import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brazilPhoneVariants, normalizeBrazilWhatsAppPhone } from "@/lib/format";
import { ensureDefaultPipeline } from "@/lib/default-pipeline";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-server";
import { upsertInitialContactActivity } from "@/lib/activities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedTemperatures = new Set(["frio", "morno", "quente"]);

function text(value: unknown, fallback = "") {
  const result = String(value ?? fallback).trim();
  return result || fallback;
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "0")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanDate(value: unknown) {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function allowedOrigins() {
  return String(process.env.NEXTLEAD_ALLOWED_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(request: NextRequest) {
  const requestOrigin = request.headers.get("origin") || "*";
  const origins = allowedOrigins();
  if (origins.includes("*")) return "*";
  return origins.includes(requestOrigin) ? requestOrigin : origins[0] || "*";
}

function corsHeaders(request: NextRequest) {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-NextLead-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: NextRequest, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init?.headers || {}),
    },
  });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function hasValidLeadAccess(request: NextRequest) {
  const requiredKey = process.env.NEXTLEAD_LEADS_API_KEY?.trim();
  if (!requiredKey) return true;

  const headerKey = request.headers.get("x-nextlead-key")?.trim() || getBearerToken(request);
  if (headerKey && headerKey === requiredKey) return true;

  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return Boolean(session);
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  if (!hasValidLeadAccess(request)) {
    return json(request, { error: "Chave de integração inválida." }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const name = text(payload.name);
  const phone = normalizeBrazilWhatsAppPhone(payload.phone || "");
  const source = text(payload.source, "Landing Page");
  const interest = text(payload.interest, "Novo orçamento");
  const company = text(payload.company || payload.business || "");
  const email = text(payload.email || "");
  const owner = text(payload.owner || payload.responsible || "NextLead");
  const rawTemperature = text(payload.temperature, "morno").toLowerCase();
  const temperature = allowedTemperatures.has(rawTemperature) ? rawTemperature : "morno";
  const value = parseMoney(payload.value || payload.valor || 0);
  const tags = parseTags(payload.tags);
  const notes = text(payload.notes || payload.message || "");
  const expectedClose = cleanDate(payload.expectedCloseDate || payload.expectedClose || payload.expected_close);

  if (!name || !phone) {
    return json(request, { error: "Nome e telefone são obrigatórios." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return json(request, { ok: true, demo: true, message: "Lead recebido. Configure Supabase para salvar." });
  }

  const firstStageId = await ensureDefaultPipeline(supabase);

  const contactPayload: Record<string, any> = {
    name,
    phone,
    email: email || null,
    company: company || null,
    source,
    temperature,
    tags,
    notes: notes || null,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const contactPayloadWithOwner = { ...contactPayload, owner };

  const variants = brazilPhoneVariants(phone);
  const { data: possibleContacts } = await supabase
    .from("contacts")
    .select("id,phone")
    .in("phone", variants.length ? variants : [phone])
    .limit(10);

  const existingContact =
    possibleContacts?.find((item: any) => item.phone === phone) ||
    possibleContacts?.[0];

  let contactResult: any;

  if (existingContact?.id) {
    contactResult = await supabase
      .from("contacts")
      .update(contactPayloadWithOwner)
      .eq("id", existingContact.id)
      .select("id")
      .single();

    if (contactResult.error?.message.toLowerCase().includes("owner")) {
      contactResult = await supabase
        .from("contacts")
        .update(contactPayload)
        .eq("id", existingContact.id)
        .select("id")
        .single();
    }

    // Fallback se o telefone normalizado conflitar com algum contato duplicado antigo.
    if (contactResult.error?.message.toLowerCase().includes("duplicate") || contactResult.error?.message.toLowerCase().includes("unique")) {
      const safePayload = { ...contactPayload };
      delete (safePayload as any).phone;
      contactResult = await supabase
        .from("contacts")
        .update(safePayload)
        .eq("id", existingContact.id)
        .select("id")
        .single();
    }
  } else {
    contactResult = await supabase
      .from("contacts")
      .upsert(contactPayloadWithOwner, { onConflict: "phone" })
      .select("id")
      .single();

    if (contactResult.error?.message.toLowerCase().includes("owner")) {
      contactResult = await supabase
        .from("contacts")
        .upsert(contactPayload, { onConflict: "phone" })
        .select("id")
        .single();
    }
  }

  const contact = contactResult.data;
  const contactError = contactResult.error;

  if (contactError || !contact) {
    return json(request, { error: contactError?.message || "Erro ao salvar contato." }, { status: 500 });
  }

  const { data: existingDeal } = await supabase
    .from("deals")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("status", "aberto")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dealId = existingDeal?.id || null;

  const dealPayload = {
    contact_id: contact.id,
    stage_id: firstStageId,
    title: interest,
    value,
    source,
    expected_close: expectedClose,
    status: "aberto",
    updated_at: new Date().toISOString(),
  };

  if (existingDeal) {
    const { error: dealUpdateError } = await supabase
      .from("deals")
      .update(dealPayload)
      .eq("id", existingDeal.id);

    if (dealUpdateError) {
      return json(request, { error: `Contato salvo, mas falhou ao atualizar oportunidade: ${dealUpdateError.message}` }, { status: 500 });
    }
  } else {
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert(dealPayload)
      .select("id")
      .single();

    if (dealError) {
      return json(request, { error: `Contato salvo, mas falhou ao criar oportunidade: ${dealError.message}` }, { status: 500 });
    }

    dealId = deal.id;
  }

  await upsertInitialContactActivity({ supabase, contactId: contact.id, temperature });

  return json(request, { ok: true, contactId: contact.id, dealId });
}
