import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { onlyDigits } from "@/lib/format";
import { sendWhatsAppText } from "@/lib/whatsapp";

async function saveOutboundMessage(input: {
  to: string;
  contactId?: string;
  message: string;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  rawPayload?: any;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let resolvedContactId = input.contactId;

  if (!resolvedContactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .upsert({ phone: input.to, name: input.to, source: "WhatsApp", updated_at: new Date().toISOString() }, { onConflict: "phone" })
      .select("id")
      .single();
    resolvedContactId = contact?.id;
  }

  if (!resolvedContactId) return null;

  await supabase.from("messages").insert({
    contact_id: resolvedContactId,
    direction: "outbound",
    body: input.message,
    type: "text",
    status: input.status,
    provider: "whatsapp",
    provider_message_id: input.providerMessageId,
    raw_payload: input.rawPayload || null,
  });

  await supabase.from("contacts").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", resolvedContactId);

  return resolvedContactId;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const to = onlyDigits(body.to || "");
  const message = String(body.message || "").trim();
  const contactId = body.contactId;

  if (!to || !message) {
    return NextResponse.json({ error: "Informe telefone e mensagem." }, { status: 400 });
  }

  const hasWhatsAppCredentials = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  if (!hasWhatsAppCredentials) {
    const providerMessageId = `local-${Date.now()}`;
    await saveOutboundMessage({ to, contactId, message, status: "queued", providerMessageId, rawPayload: { demo: true } });
    return NextResponse.json({ ok: true, demo: true, providerMessageId, message: "Mensagem salva no CRM. Configure a Meta para envio real." });
  }

  try {
    const result = await sendWhatsAppText({ to, body: message });
    const providerMessageId = result?.messages?.[0]?.id;
    await saveOutboundMessage({ to, contactId, message, status: "sent", providerMessageId, rawPayload: result });
    return NextResponse.json({ ok: true, providerMessageId, result });
  } catch (error: any) {
    await saveOutboundMessage({ to, contactId, message, status: "failed", rawPayload: { error: error.message } });
    return NextResponse.json({ error: error.message || "Erro ao enviar mensagem." }, { status: 500 });
  }
}
