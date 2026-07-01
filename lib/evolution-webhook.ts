import { getSupabaseAdmin } from "./supabase-admin";
import { brazilPhoneVariants } from "./format";
import { ensureDefaultPipeline } from "./default-pipeline";

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  let digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function isGroupJid(jid: unknown) {
  return String(jid || "").includes("@g.us");
}

function normalizeJid(jid: unknown) {
  const raw = String(jid || "");
  if (!raw) return "";
  if (isGroupJid(raw)) return "";
  const left = raw.split("@")[0];
  return normalizePhone(left);
}

function phoneFromKey(key: any, item: any) {
  const remoteJid = key?.remoteJid || item?.remoteJid || item?.jid;
  const allowGroups = String(process.env.NEXTLEAD_SAVE_GROUP_MESSAGES || "false").toLowerCase() === "true";

  if (isGroupJid(remoteJid)) {
    if (!allowGroups) return "";
    return normalizeJid(key?.participantAlt || key?.participant || item?.participant || item?.sender);
  }

  return normalizeJid(remoteJid || key?.remoteJidAlt || item?.sender);
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
    (msg?.audioMessage ? "[áudio]" : null) ||
    (msg?.stickerMessage ? "[figurinha]" : null) ||
    (msg?.imageMessage ? "[imagem]" : null) ||
    (msg?.videoMessage ? "[vídeo]" : null) ||
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

function isMessageStatusUpdateEvent(event: string) {
  const compact = String(event || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact.includes("messagesupdate") || compact.includes("messagestatus") || compact.includes("statusupdate");
}

function extractUpdateMessageId(update: any) {
  return (
    update?.key?.id ||
    update?.data?.key?.id ||
    update?.message?.key?.id ||
    update?.update?.key?.id ||
    update?.keyId ||
    update?.messageId ||
    update?.id ||
    undefined
  );
}

function extractRawStatus(update: any) {
  return (
    update?.status ??
    update?.update?.status ??
    update?.message?.status ??
    update?.data?.status ??
    update?.data?.update?.status ??
    update?.ack ??
    update?.update?.ack ??
    undefined
  );
}

function normalizeMessageStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return "";

  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : NaN;
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "failed";
    if (numeric === 1 || numeric === 2) return "sent";
    if (numeric === 3) return "delivered";
    if (numeric >= 4) return "read";
  }

  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    pending: "queued",
    queued: "queued",
    server_ack: "sent",
    sent: "sent",
    send: "sent",
    delivery_ack: "delivered",
    delivered: "delivered",
    read: "read",
    read_ack: "read",
    played: "read",
    error: "failed",
    failed: "failed",
  };

  return map[normalized] || normalized;
}

function statusRank(status: string) {
  const ranks: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 99 };
  return ranks[status] ?? 1;
}

async function updateOutboundStatusFromEvolution(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  update: any,
) {
  const status = normalizeMessageStatus(extractRawStatus(update));
  if (!status) return false;

  const now = new Date().toISOString();
  const providerMessageId = extractUpdateMessageId(update);

  if (providerMessageId) {
    const { data, error } = await supabase
      .from("messages")
      .update({ status, updated_at: now })
      .eq("provider_message_id", providerMessageId)
      .select("id,status")
      .limit(1);

    if (!error && data?.length) return true;
  }

  const key = update?.key || update?.data?.key || update?.message?.key || update?.update?.key || {};
  const phone = phoneFromKey(key, update?.data || update);
  if (!phone) return false;

  const variants = brazilPhoneVariants(phone);
  const { data: possibleContacts } = await supabase
    .from("contacts")
    .select("id,phone")
    .in("phone", variants.length ? variants : [phone])
    .limit(10);

  const contact = possibleContacts?.find((item: any) => item.phone === phone) || possibleContacts?.[0];
  if (!contact?.id) return false;

  const { data: latest } = await supabase
    .from("messages")
    .select("id,status")
    .eq("contact_id", contact.id)
    .eq("direction", "outbound")
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.id) return false;
  if (statusRank(String(latest.status || "")) > statusRank(status) && status !== "failed") return true;

  const { error } = await supabase
    .from("messages")
    .update({ status, updated_at: now })
    .eq("id", latest.id);

  return !error;
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

  const firstStageId = await ensureDefaultPipeline(supabase);

  if (!firstStageId) return;

  await supabase.from("deals").insert({
    contact_id: contactId,
    stage_id: firstStageId,
    title,
    status: "aberto",
    value: 0,
    source: "WhatsApp",
  });
}

async function upsertContactSafe(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  input: { phone: string; name: string; createdAt: string },
) {
  const variants = brazilPhoneVariants(input.phone);
  const { data: possibleContacts } = await supabase
    .from("contacts")
    .select("id,name,company,phone")
    .in("phone", variants.length ? variants : [input.phone])
    .limit(10);

  const existing =
    possibleContacts?.find((contact: any) => contact.phone === input.phone) ||
    possibleContacts?.[0];

  // Se o contato já veio da landing/manual, preserva nome/empresa e só atualiza o último contato.
  // Também normaliza o telefone salvo para evitar duplicar quando o WhatsApp responder com 55 + DDD.
  if (existing?.id) {
    let result = await supabase
      .from("contacts")
      .update({
        phone: input.phone,
        last_message_at: input.createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id,name")
      .single();

    // Fallback se houver conflito de telefone por algum contato duplicado antigo.
    if (result.error) {
      result = await supabase
        .from("contacts")
        .update({
          last_message_at: input.createdAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id,name")
        .single();
    }

    if (!result.error && result.data?.id) return result;
    return { data: { id: existing.id, name: existing.name }, error: null } as any;
  }

  const fullPayload = {
    phone: input.phone,
    name: input.name || input.phone,
    source: "WhatsApp",
    owner: "NextLead",
    temperature: "morno",
    last_message_at: input.createdAt,
    updated_at: new Date().toISOString(),
  };

  let result = await supabase.from("contacts").insert(fullPayload).select("id,name").single();

  if (!result.error && result.data?.id) return result;

  // Fallback para bancos antigos sem algumas colunas extras.
  const fallbackPayload = {
    phone: input.phone,
    name: input.name || input.phone,
    company: null,
  };

  result = await supabase.from("contacts").upsert(fallbackPayload, { onConflict: "phone" }).select("id,name").single();
  return result;
}

async function saveMessageSafe(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  record: any,
  providerMessageId?: string,
) {
  const result = providerMessageId
    ? await supabase.from("messages").upsert(record, { onConflict: "provider_message_id" })
    : await supabase.from("messages").insert(record);

  if (!result.error) return result;

  // Fallback para bancos antigos sem provider/raw_payload/updated_at.
  const minimal = {
    contact_id: record.contact_id,
    direction: record.direction,
    body: record.body,
    type: record.type || "text",
    status: record.status || "received",
    created_at: record.created_at,
  };

  return supabase.from("messages").insert(minimal);
}

export async function persistEvolutionWebhook(payload: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { persisted: false, reason: "Supabase não configurado." };

  await supabase.from("webhook_events").insert({ provider: "evolution", payload });

  const event = String(payload?.event || "").toLowerCase();

  if (isMessageStatusUpdateEvent(event)) {
    const updates = normalizeMessages(payload);
    let statusUpdates = 0;

    for (const update of updates) {
      const updated = await updateOutboundStatusFromEvolution(supabase, update);
      if (updated) statusUpdates += 1;
    }

    return { persisted: true, messages: 0, statusUpdates };
  }

  const messages = normalizeMessages(payload);
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of messages) {
    const key = item?.key || item?.data?.key || {};
    const phone = phoneFromKey(key, item);

    if (!phone) {
      skipped += 1;
      continue;
    }

    const fromMe = Boolean(key?.fromMe || item?.fromMe);

    // Mensagens enviadas pelo próprio CRM já são salvas em /api/whatsapp/send.
    // Ignorar ecos fromMe evita criar contatos duplicados como "Você" para o mesmo número.
    if (fromMe) {
      skipped += 1;
      continue;
    }

    const pushName = item?.pushName || item?.verifiedBizName || item?.notifyName || phone;
    const messageType = item?.messageType || item?.type || Object.keys(item?.message || {})[0] || "text";
    const body = extractText(item, messageType);
    const createdAt = toDate(item?.messageTimestamp || item?.timestamp || payload?.date_time || item?.date_time);
    const providerMessageId = key?.id || item?.id || undefined;

    const contactResult = await upsertContactSafe(supabase, {
      phone,
      name: pushName || phone,
      createdAt: createdAt.toISOString(),
    });

    if (contactResult.error || !contactResult.data?.id) {
      errors.push(`contact:${phone}:${contactResult.error?.message || "sem id"}`);
      continue;
    }

    const contact = contactResult.data;

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

    const messageResult = await saveMessageSafe(supabase, record, providerMessageId);
    if (messageResult.error) {
      errors.push(`message:${phone}:${messageResult.error.message}`);
      continue;
    }

    saved += 1;
  }

  return { persisted: true, messages: saved, skipped, errors, event: payload?.event || null };
}
