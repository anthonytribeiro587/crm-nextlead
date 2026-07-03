import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brazilPhoneVariants, normalizeBrazilWhatsAppPhone } from "@/lib/format";
import { getWhatsAppProvider, sendWhatsAppText } from "@/lib/whatsapp";
import { completeInitialContactActivities } from "@/lib/activities";

function outboundStatusRank(status: string) {
  const ranks: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 99 };
  return ranks[status] ?? 1;
}

function bestOutboundStatus(currentStatus: unknown, nextStatus: string) {
  const current = String(currentStatus || "").trim().toLowerCase();
  if (nextStatus === "failed") return "failed";
  if (current === "failed") return current;
  return outboundStatusRank(current) > outboundStatusRank(nextStatus) ? current : nextStatus;
}

async function saveOutboundMessage(input: {
  to: string;
  contactId?: string;
  message: string;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  rawPayload?: any;
  provider?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  let resolvedContactId = input.contactId;

  if (resolvedContactId) {
    // Quando o contato veio de landing/manual com telefone sem 55, normaliza no primeiro envio.
    const updateWithPhone = await supabase
      .from("contacts")
      .update({ phone: input.to, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", resolvedContactId);

    if (updateWithPhone.error) {
      await supabase
        .from("contacts")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", resolvedContactId);
    }
  }

  if (!resolvedContactId) {
    const variants = brazilPhoneVariants(input.to);
    const { data: existing } = await supabase
      .from("contacts")
      .select("id,phone")
      .in("phone", variants.length ? variants : [input.to])
      .limit(10);

    resolvedContactId = (existing?.find((item: any) => item.phone === input.to) || existing?.[0])?.id;

    if (!resolvedContactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .insert({ phone: input.to, name: input.to, source: "WhatsApp", updated_at: new Date().toISOString() })
        .select("id")
        .single();
      resolvedContactId = contact?.id;
    }
  }

  if (!resolvedContactId) return null;

  const record = {
    contact_id: resolvedContactId,
    direction: "outbound",
    body: input.message,
    type: "text",
    status: input.status,
    provider: input.provider || "whatsapp",
    provider_message_id: input.providerMessageId,
    raw_payload: input.rawPayload || null,
  };

  if (input.providerMessageId) {
    const { data: existingMessage } = await supabase
      .from("messages")
      .select("id,status")
      .eq("provider_message_id", input.providerMessageId)
      .maybeSingle();

    if (existingMessage?.id) {
      await supabase
        .from("messages")
        .update({
          ...record,
          status: bestOutboundStatus(existingMessage.status, input.status),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMessage.id);
    } else {
      await supabase.from("messages").insert(record);
    }
  } else {
    await supabase.from("messages").insert(record);
  }

  await supabase.from("contacts").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", resolvedContactId);

  if (input.status !== "failed") {
    await completeInitialContactActivities(supabase, resolvedContactId);
  }

  return resolvedContactId;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const to = normalizeBrazilWhatsAppPhone(body.to || "");
  const message = String(body.message || "").trim();
  const contactId = body.contactId;
  const provider = getWhatsAppProvider();

  if (!to || !message) {
    return NextResponse.json({ error: "Informe telefone e mensagem." }, { status: 400 });
  }

  if (provider === "demo") {
    const providerMessageId = `local-${Date.now()}`;
    await saveOutboundMessage({ to, contactId, message, status: "queued", providerMessageId, provider: "demo", rawPayload: { demo: true, source: "manual_crm" } });
    return NextResponse.json({ ok: true, demo: true, provider: "demo", providerMessageId, message: "Mensagem salva no CRM. Configure a Evolution API para envio real." });
  }

  try {
    const result = await sendWhatsAppText({ to, body: message });
    await saveOutboundMessage({
      to,
      contactId,
      message,
      status: "sent",
      providerMessageId: result.providerMessageId,
      provider: result.provider,
      rawPayload: { ...(result.payload || {}), source: "manual_crm" },
    });
    return NextResponse.json({ ok: true, provider: result.provider, providerMessageId: result.providerMessageId, result: result.payload });
  } catch (error: any) {
    await saveOutboundMessage({ to, contactId, message, status: "failed", provider, rawPayload: { error: error.message, source: "manual_crm" } });
    return NextResponse.json({ error: error.message || "Erro ao enviar mensagem." }, { status: 500 });
  }
}
