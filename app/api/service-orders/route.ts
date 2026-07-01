import { NextRequest, NextResponse } from "next/server";
import { logCommercialActivity } from "@/lib/commercial-events";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedStatuses = new Set([
  "aberta",
  "diagnostico",
  "aguardando_aprovacao",
  "aprovada",
  "execucao",
  "aguardando_material",
  "concluida",
  "entregue",
  "cancelada",
]);

const allowedPriorities = new Set(["frio", "morno", "quente"]);

function cleanText(value: unknown, fallback = "") {
  const result = String(value ?? fallback).trim();
  return result || fallback;
}

function parseMoney(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDateTime(value: unknown) {
  if (value === undefined) return undefined;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function serviceOrderSelect() {
  return "id,contact_id,deal_id,code,title,description,status,priority,owner,estimated_value,final_value,due_at,started_at,completed_at,internal_notes,created_at,updated_at";
}


async function generateNextServiceOrderCode(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const now = new Date();
  const year = now.getFullYear();
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;

  if (!supabase) return `${year} - 1`;

  const { data, error } = await supabase
    .from("service_orders")
    .select("code,created_at")
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) return `${year} - ${Date.now().toString().slice(-4)}`;

  let max = 0;
  for (const row of data || []) {
    const match = String((row as any).code || "").match(/^(\d{4})\s*-\s*(\d+)$/);
    if (match && Number(match[1]) === year) max = Math.max(max, Number(match[2]));
  }

  return `${year} - ${max + 1}`;
}

function tableMissingResponse(message?: string) {
  return NextResponse.json(
    {
      error: "Tabela de ordens de serviço ainda não criada.",
      detail: message || "Rode scripts/migration-v3-service-orders.sql no SQL Editor do Supabase.",
    },
    { status: 428 },
  );
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const contactId = cleanText(payload.contactId);

  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const dueAt = cleanDateTime(payload.dueAt ?? payload.due_at);
  const estimatedValue = parseMoney(payload.estimatedValue ?? payload.estimated_value);
  const finalValue = parseMoney(payload.finalValue ?? payload.final_value);
  const priority = cleanText(payload.priority, "morno").toLowerCase();
  const status = cleanText(payload.status, "aberta").toLowerCase();

  if (!allowedPriorities.has(priority)) return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
  if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });

  const shouldPreventDuplicate = Boolean(payload.preventDuplicate);
  if (shouldPreventDuplicate) {
    const { data: existingOrder } = await supabase
      .from("service_orders")
      .select(serviceOrderSelect())
      .eq("contact_id", contactId)
      .not("status", "in", "(concluida,entregue,cancelada)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      return NextResponse.json(
        {
          error: "Este lead já possui uma ordem de serviço aberta.",
          detail: "Abra a OS existente antes de criar uma nova demanda para o mesmo cliente.",
          existingOrder,
        },
        { status: 409 },
      );
    }
  }

  const code = cleanText(payload.code) || await generateNextServiceOrderCode(supabase);

  const insert = {
    contact_id: contactId,
    deal_id: cleanText(payload.dealId ?? payload.deal_id) || null,
    code,
    title: cleanText(payload.title, "Nova ordem de serviço"),
    description: cleanText(payload.description) || null,
    status,
    priority,
    owner: cleanText(payload.owner, "NextLead"),
    estimated_value: estimatedValue ?? 0,
    final_value: finalValue ?? 0,
    due_at: dueAt === undefined ? null : dueAt,
    internal_notes: cleanText(payload.internalNotes ?? payload.internal_notes) || null,
  };

  const { data, error } = await supabase.from("service_orders").insert(insert).select(serviceOrderSelect()).single();

  if (error) {
    if (error.message.toLowerCase().includes("service_orders") || error.code === "42P01") return tableMissingResponse(error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const savedOrder = data as any;
  await logCommercialActivity(supabase, { contactId, title: `OS criada: ${savedOrder.code} · ${savedOrder.title}`, done: true });

  return NextResponse.json({ ok: true, serviceOrder: savedOrder });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const orderId = cleanText(payload.orderId ?? payload.id);

  if (!orderId) {
    return NextResponse.json({ error: "orderId é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) update.title = cleanText(payload.title, "Ordem de serviço");
  if (payload.description !== undefined) update.description = cleanText(payload.description) || null;
  if (payload.owner !== undefined) update.owner = cleanText(payload.owner, "NextLead");
  if (payload.internalNotes !== undefined || payload.internal_notes !== undefined) update.internal_notes = cleanText(payload.internalNotes ?? payload.internal_notes) || null;
  if (payload.dealId !== undefined || payload.deal_id !== undefined) update.deal_id = cleanText(payload.dealId ?? payload.deal_id) || null;

  const estimatedValue = parseMoney(payload.estimatedValue ?? payload.estimated_value);
  if (estimatedValue !== undefined) update.estimated_value = estimatedValue;

  const finalValue = parseMoney(payload.finalValue ?? payload.final_value);
  if (finalValue !== undefined) update.final_value = finalValue;

  const dueAt = cleanDateTime(payload.dueAt ?? payload.due_at);
  if (dueAt !== undefined) update.due_at = dueAt;

  const status = payload.status !== undefined ? cleanText(payload.status).toLowerCase() : undefined;
  if (status !== undefined) {
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    update.status = status;
    if (status === "execucao" && !payload.startedAt && !payload.started_at) update.started_at = new Date().toISOString();
    if (["concluida", "entregue"].includes(status) && !payload.completedAt && !payload.completed_at) update.completed_at = new Date().toISOString();
  }

  const priority = payload.priority !== undefined ? cleanText(payload.priority).toLowerCase() : undefined;
  if (priority !== undefined) {
    if (!allowedPriorities.has(priority)) return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    update.priority = priority;
  }

  const { data, error } = await supabase.from("service_orders").update(update).eq("id", orderId).select(serviceOrderSelect()).single();

  if (error) {
    if (error.message.toLowerCase().includes("service_orders") || error.code === "42P01") return tableMissingResponse(error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const savedOrder = data as any;
  if (savedOrder?.contact_id) {
    const statusLabel = status ? `Status da OS alterado para ${status.replaceAll("_", " ")}` : "Ordem de serviço atualizada";
    await logCommercialActivity(supabase, { contactId: savedOrder.contact_id, title: `${statusLabel}: ${savedOrder.code}`, done: true });
  }

  return NextResponse.json({ ok: true, serviceOrder: savedOrder });
}
