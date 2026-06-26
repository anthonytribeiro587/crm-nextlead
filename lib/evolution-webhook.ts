import { getSupabaseAdmin } from "./supabase-admin";

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeJid(jid: unknown) {
  const raw = String(jid || "");
  if (!raw) return "";
  if (raw.includes("@g.us")) return "";
  const left = raw.split("@")[0];
  return onlyDigits(left);
}

function toDate(timestamp: unknown) {
  if (!timestamp) return new Date();
  if (typeof timestamp === "object" && timestamp !== null && "low" in timestamp) {
    const low = Number((timestamp as any).low || 0);
    return new Date(low * 1000);
  }
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return new Date();
  return new Date(value > 9999999999 ? value : value * 1000);
}

function extractText(message: any, messageType?: string) {
  const msg = message?.message || message?.data?.message || message;
  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.templateButtonReplyMessage?.selectedDisplayText ||
    msg?.listResponseMessage?.title ||
    msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.reactionMessage?.text ||
    (messageType ? `[${messageType}]` : "[mensagem]")
  );
}

function normalizeMessages(payload: any): any[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (data?.key || data?.message) return [data];
  if (payload?.key || payload?.message) return [payload];
  return [];
}

async function ensureDealForContact(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, contactId: string, title: string) {
  const { data: existingDeal } = await supabase
    .from("deals")
    .select("id")
    .eq("contact_id", contactId)
    .eq("status", "aberto")
    .limit(1)
    .maybeSingle();

  if (existingDeal?.id) return;

  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .order("position", { ascending: true })
    .limit(1)
    .single();

  if (!firstStage?.id) return;

  await supabase.from("deals").insert({
    contact_id: contactId,
    stage_id: firstStage.id,
    title,
    status: "aberto",
    value: 0,
    source: "WhatsApp",
  });
}

export async function persistEvolutionWebhook(payload: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { persisted: false, reason: "Supabase não configurado." };

  await supabase.from("webhook_events").insert({ provider: "evolution", payload });

  const event = String(payload?.event || "").toUpperCase();

  if (event.includes("MESSAGES_UPDATE")) {
    const updates = normalizeMessages(payload);
    for (const update of updates) {
      const id = update?.key?.id || update?.id;
      const status = update?.status || update?.update?.status || update?.message?.status;
      if (!id || !status) continue;
      await supabase.from("messages").update({ status, updated_at: new Date().toISOString() }).eq("provider_message_id", id);
    }
    return { persisted: true, messages: 0, statusUpdates: updates.length };
  }

  const messages = normalizeMessages(payload);
  let saved = 0;

  for (const item of messages) {
    const key = item?.key || item?.data?.key || {};
    const remoteJid = key?.remoteJid || item?.remoteJid || item?.jid;
    const phone = normalizeJid(remoteJid);
    if (!phone) continue;

    const fromMe = Boolean(key?.fromMe || item?.fromMe);
    const pushName = item?.pushName || item?.verifiedBizName || item?.notifyName || phone;
    const messageType = item?.messageType || item?.type || Object.keys(item?.message || {})[0] || "text";
    const body = extractText(item, messageType);
    const createdAt = toDate(item?.messageTimestamp || item?.timestamp || item?.date_time);
    const providerMessageId = key?.id || item?.id || undefined;

    const { data: contact } = await supabase
      .from("contacts")
      .upsert(
        {
          phone,
          name: pushName || phone,
          source: "WhatsApp",
          owner: "NextLead",
          temperature: "morno",
          last_message_at: createdAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone" },
      )
      .select("id,name")
      .single();

    if (!contact?.id) continue;

    if (!fromMe) {
      await ensureDealForContact(supabase, contact.id, `Atendimento WhatsApp - ${pushName || phone}`);
    }

    const record = {
      contact_id: contact.id,
      direction: fromMe ? "outbound" : "inbound",
      body,
      type: messageType,
      status: fromMe ? "sent" : "received",
      provider: "evolution",
      provider_message_id: providerMessageId,
      raw_payload: item,
      created_at: createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (providerMessageId) {
      await supabase.from("messages").upsert(record, { onConflict: "provider_message_id" });
    } else {
      await supabase.from("messages").insert(record);
    }

    saved += 1;
  }

  return { persisted: true, messages: saved, event: payload?.event || null };
}
