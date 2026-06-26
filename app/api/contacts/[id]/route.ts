import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeBrazilWhatsAppPhone } from "@/lib/format";
import { logCommercialActivity } from "@/lib/commercial-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedTemperatures = new Set(["frio", "morno", "quente"]);

function cleanText(value: unknown, fallback = "") {
  const result = String(value ?? fallback).trim();
  return result || fallback;
}

function parseTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const contactId = params.id;

  if (!contactId) {
    return NextResponse.json({ error: "ID do contato é obrigatório." }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (payload.name !== undefined) update.name = cleanText(payload.name, "Lead");
  if (payload.company !== undefined) update.company = cleanText(payload.company) || null;
  if (payload.email !== undefined) update.email = cleanText(payload.email) || null;
  if (payload.notes !== undefined) update.notes = cleanText(payload.notes) || null;
  if (payload.owner !== undefined) update.owner = cleanText(payload.owner, "NextLead");
  if (payload.phone !== undefined) {
    const phone = normalizeBrazilWhatsAppPhone(payload.phone || "");
    if (phone) update.phone = phone;
  }
  if (payload.temperature !== undefined) {
    const temperature = cleanText(payload.temperature).toLowerCase();
    if (!allowedTemperatures.has(temperature)) {
      return NextResponse.json({ error: "Temperatura inválida." }, { status: 400 });
    }
    update.temperature = temperature;
  }
  const tags = parseTags(payload.tags);
  if (tags !== undefined) update.tags = tags;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { data: previousContact } = await supabase
    .from("contacts")
    .select("temperature,owner,name,company")
    .eq("id", contactId)
    .maybeSingle();

  let result: any = await supabase
    .from("contacts")
    .update(update)
    .eq("id", contactId)
    .select("id,name,phone,email,company,source,owner,temperature,tags,notes,last_message_at")
    .single();

  if (result.error?.message.toLowerCase().includes("owner")) {
    const fallbackUpdate = { ...update };
    delete fallbackUpdate.owner;
    result = await supabase
      .from("contacts")
      .update(fallbackUpdate)
      .eq("id", contactId)
      .select("id,name,phone,email,company,source,temperature,tags,notes,last_message_at")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (payload.temperature !== undefined && previousContact?.temperature !== result.data?.temperature) {
    await logCommercialActivity(supabase, { contactId, title: `Temperatura alterada para ${result.data?.temperature}`, done: true });
  }

  if (payload.owner !== undefined && previousContact?.owner !== result.data?.owner) {
    await logCommercialActivity(supabase, { contactId, title: `Responsável alterado para ${result.data?.owner || "NextLead"}`, done: true });
  }

  if ((payload.name !== undefined || payload.company !== undefined || payload.notes !== undefined) && previousContact) {
    await logCommercialActivity(supabase, { contactId, title: "Dados do lead atualizados", done: true });
  }

  return NextResponse.json({ ok: true, contact: result.data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const contactId = params.id;

  if (!contactId) {
    return NextResponse.json({ error: "ID do contato é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { error } = await supabase.from("contacts").delete().eq("id", contactId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
