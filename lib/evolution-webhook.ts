import { getSupabaseAdmin } from "./supabase-admin";
import { brazilPhoneVariants } from "./format";
import { ensureDefaultPipeline } from "./default-pipeline";
import { getTenantContext, withTenant } from "./tenant";
import { ensureDefaultAutomations, runSdrAutomationForContact } from "./automations";

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}


function rawJidFromItem(key: any, item: any) {
  const source = item?.data || item || {};
  const nestedKey =
    source?.key ||
    source?.message?.key ||
    source?.update?.key ||
    source?.message?.message?.key ||
    {};
  return String(
    key?.remoteJid ||
      nestedKey?.remoteJid ||
      source?.remoteJid ||
      source?.jid ||
      source?.chatId ||
      source?.to ||
      source?.from ||
      source?.sender ||
      source?.recipient ||
      "",
  );
}

function leftOfJid(jid: unknown) {
  return String(jid || "").split("@")[0];
}

function isBroadcastJid(jid: unknown) {
  const raw = String(jid || "").toLowerCase();
  return raw.includes("@broadcast") || raw === "status@broadcast" || raw.includes("status@broadcast");
}

function isNewsletterJid(jid: unknown) {
  return String(jid || "").toLowerCase().includes("@newsletter");
}

function isLikelyWhatsappGroupId(jid: unknown) {
  const left = leftOfJid(jid).replace(/\D/g, "");
  // Grupos/comunidades do WhatsApp frequentemente aparecem como IDs longos começando por 120...
  // Quando a Evolution não mantém @g.us no payload, isso evita tratar promoção de grupo como lead.
  return /^120\d{8,}$/.test(left);
}

function shouldIgnoreChat(key: any, item: any) {
  const remoteJid = rawJidFromItem(key, item);
  if (isGroupJid(remoteJid)) return { ignore: true, reason: "group_jid", remoteJid };
  if (isBroadcastJid(remoteJid)) return { ignore: true, reason: "broadcast_jid", remoteJid };
  if (isNewsletterJid(remoteJid)) return { ignore: true, reason: "newsletter_jid", remoteJid };
  if (isLikelyWhatsappGroupId(remoteJid)) return { ignore: true, reason: "likely_group_id_120", remoteJid };
  return { ignore: false, reason: null as string | null, remoteJid };
}

function normalizePhone(value: unknown) {
  let digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
    return digits;
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
  const source = item?.data || item || {};
  const nestedKey =
    source?.key ||
    source?.message?.key ||
    source?.update?.key ||
    source?.message?.message?.key ||
    {};
  const remoteJid =
    key?.remoteJid ||
    nestedKey?.remoteJid ||
    source?.remoteJid ||
    source?.jid ||
    source?.chatId ||
    source?.to ||
    source?.from ||
    source?.sender ||
    source?.recipient;
  const allowGroups =
    String(
      process.env.NEXTLEAD_SAVE_GROUP_MESSAGES || "false",
    ).toLowerCase() === "true";

  if (!allowGroups && (isBroadcastJid(remoteJid) || isNewsletterJid(remoteJid) || isLikelyWhatsappGroupId(remoteJid))) {
    return "";
  }

  if (isGroupJid(remoteJid)) {
    if (!allowGroups) return "";
    return normalizeJid(
      key?.participantAlt ||
        key?.participant ||
        nestedKey?.participant ||
        source?.participant ||
        source?.sender,
    );
  }

  return normalizeJid(
    remoteJid ||
      key?.remoteJidAlt ||
      nestedKey?.remoteJidAlt ||
      source?.sender ||
      source?.number,
  );
}

function toDate(timestamp: unknown) {
  if (!timestamp) return new Date();
  if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "low" in timestamp
  ) {
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
  if (Array.isArray(data?.updates)) return data.updates;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.updates)) return payload.updates;

  if (
    data?.key ||
    data?.message ||
    data?.id ||
    data?.messageId ||
    data?.status !== undefined ||
    data?.ack !== undefined ||
    data?.update
  ) {
    return [data];
  }

  if (
    payload?.key ||
    payload?.message ||
    payload?.id ||
    payload?.messageId ||
    payload?.status !== undefined ||
    payload?.ack !== undefined ||
    payload?.update
  ) {
    return [payload];
  }

  return [];
}


function parseFromMe(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
  }
  return false;
}

function isInboundMessageEvent(event: string) {
  const compact = String(event || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    compact.includes("messagesupsert") ||
    compact.includes("messageupsert") ||
    compact.includes("messagesset") ||
    compact.includes("messagescreate") ||
    compact.includes("messagecreate") ||
    compact.includes("sendmessage")
  );
}

function hasMessageContent(item: any) {
  const msg = item?.message || item?.data?.message || item?.update?.message;
  if (!msg) return false;
  return Boolean(
    msg?.conversation ||
      msg?.extendedTextMessage ||
      msg?.imageMessage ||
      msg?.videoMessage ||
      msg?.audioMessage ||
      msg?.documentMessage ||
      msg?.stickerMessage ||
      msg?.reactionMessage ||
      msg?.buttonsResponseMessage ||
      msg?.templateButtonReplyMessage ||
      msg?.listResponseMessage
  );
}

function isProbablyStatusOnlyItem(item: any) {
  return extractRawStatus(item) !== undefined && !hasMessageContent(item);
}

function isMessageStatusUpdateEvent(event: string) {
  const compact = String(event || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return (
    compact.includes("messagesupdate") ||
    compact.includes("messageupdate") ||
    compact.includes("messagestatus") ||
    compact.includes("statusupdate") ||
    compact.includes("messagesack") ||
    compact.includes("messageack") ||
    compact.includes("receipt") ||
    compact.includes("readreceipt")
  );
}

function extractUpdateMessageId(update: any) {
  return (
    update?.key?.id ||
    update?.data?.key?.id ||
    update?.message?.key?.id ||
    update?.message?.message?.key?.id ||
    update?.update?.key?.id ||
    update?.data?.update?.key?.id ||
    update?.data?.message?.key?.id ||
    update?.keyId ||
    update?.messageId ||
    update?.message_id ||
    update?.data?.id ||
    update?.id ||
    undefined
  );
}

function extractRawStatus(update: any) {
  return (
    update?.status ??
    update?.messageStatus ??
    update?.statusMessage ??
    update?.receipt?.status ??
    update?.update?.status ??
    update?.message?.status ??
    update?.message?.message?.status ??
    update?.data?.status ??
    update?.data?.messageStatus ??
    update?.data?.update?.status ??
    update?.data?.message?.status ??
    update?.ack ??
    update?.update?.ack ??
    update?.message?.ack ??
    update?.data?.ack ??
    update?.data?.update?.ack ??
    update?.data?.message?.ack ??
    undefined
  );
}

function normalizeMessageStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return "";

  const numeric =
    typeof value === "number"
      ? value
      : /^\d+$/.test(String(value))
        ? Number(value)
        : NaN;
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "failed";
    if (numeric === 1 || numeric === 2) return "sent";
    if (numeric === 3) return "delivered";
    if (numeric >= 4) return "read";
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
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
  const ranks: Record<string, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 99,
  };
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
    const { data: currentMessage } = await supabase
      .from("messages")
      .select("id,status")
      .eq("provider_message_id", providerMessageId)
      .limit(1)
      .maybeSingle();

    if (currentMessage?.id) {
      if (
        statusRank(String(currentMessage.status || "")) > statusRank(status) &&
        status !== "failed"
      ) {
        return true;
      }

      const { error } = await supabase
        .from("messages")
        .update({ status, updated_at: now })
        .eq("id", currentMessage.id);

      return !error;
    }
  }

  const key =
    update?.key ||
    update?.data?.key ||
    update?.message?.key ||
    update?.update?.key ||
    {};
  const phone = phoneFromKey(key, update?.data || update);
  if (!phone) return false;

  const variants = brazilPhoneVariants(phone);
  const { data: possibleContacts } = await supabase
    .from("contacts")
    .select("id,phone")
    .in("phone", variants.length ? variants : [phone])
    .limit(10);

  const contact =
    possibleContacts?.find((item: any) => item.phone === phone) ||
    possibleContacts?.[0];
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
  if (
    statusRank(String(latest.status || "")) > statusRank(status) &&
    status !== "failed"
  )
    return true;

  const { error } = await supabase
    .from("messages")
    .update({ status, updated_at: now })
    .eq("id", latest.id);

  return !error;
}

async function ensureDealForContact(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  contactId: string,
  title: string,
  tenant?: Awaited<ReturnType<typeof getTenantContext>>,
) {
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

  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("pipeline_id")
    .eq("id", firstStageId)
    .maybeSingle();

  await supabase.from("deals").insert(withTenant({
    contact_id: contactId,
    pipeline_id: firstStage?.pipeline_id || null,
    stage_id: firstStageId,
    title,
    status: "aberto",
    value: 0,
    source: "WhatsApp",
  }, tenant || await getTenantContext()));
}

async function upsertContactSafe(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  input: { phone: string; name: string; createdAt: string },
  tenant?: Awaited<ReturnType<typeof getTenantContext>>,
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
    return {
      data: { id: existing.id, name: existing.name },
      error: null,
    } as any;
  }

  const fullPayload = withTenant({
    phone: input.phone,
    name: input.name || input.phone,
    source: "WhatsApp",
    owner: "NextLead",
    temperature: "morno",
    last_message_at: input.createdAt,
    updated_at: new Date().toISOString(),
  }, tenant || await getTenantContext());

  let result = await supabase
    .from("contacts")
    .insert(fullPayload)
    .select("id,name")
    .single();

  if (!result.error && result.data?.id) return result;

  // Fallback para bancos antigos sem algumas colunas extras.
  // IMPORTANTE: não usar upsert/onConflict aqui. Alguns bancos antigos não têm
  // constraint unique em phone ou tenant_id+phone, então o Postgres retorna:
  // "there is no unique or exclusion constraint matching the ON CONFLICT specification".
  // Como já buscamos o contato antes, fazemos insert mínimo; se falhar, tentamos
  // buscar novamente para lidar com corrida/conflito sem quebrar o SDR.
  const fallbackPayload = withTenant({
    phone: input.phone,
    name: input.name || input.phone,
    company: null,
  }, tenant || await getTenantContext());

  result = await supabase
    .from("contacts")
    .insert(fallbackPayload)
    .select("id,name")
    .single();

  if (!result.error && result.data?.id) return result;

  const retry = await supabase
    .from("contacts")
    .select("id,name,phone")
    .in("phone", variants.length ? variants : [input.phone])
    .limit(1)
    .maybeSingle();

  if (!retry.error && retry.data?.id) {
    return { data: { id: retry.data.id, name: retry.data.name }, error: null } as any;
  }

  return result;
}

async function saveMessageSafe(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  record: any,
  providerMessageId?: string,
) {
  const result = providerMessageId
    ? await supabase
        .from("messages")
        .upsert(record, { onConflict: "provider_message_id" })
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

async function insertSdrDiagnosticRun(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: Awaited<ReturnType<typeof getTenantContext>>,
  record: Record<string, any>,
) {
  const payload = {
    tenant_id: tenant.tenantTableReady ? tenant.id : undefined,
    automation_id: record.automation_id || null,
    contact_id: record.contact_id || null,
    deal_id: record.deal_id || null,
    status: record.status || "started",
    summary: record.summary || "SDR webhook diagnosticado.",
    input: record.input || {},
    output: record.output || {},
    error: record.error || null,
    created_at: new Date().toISOString(),
  };

  const clean = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const first = await supabase.from("automation_runs").insert(clean).select("id").single();
  if (!first.error) return { id: first.data?.id, error: null };

  console.error("NextLead SDR diagnostic run insert failed", first.error.message);

  const minimal = {
    tenant_id: tenant.tenantTableReady ? tenant.id : undefined,
    status: payload.status,
    summary: payload.summary,
    error: payload.error || first.error.message,
    created_at: payload.created_at,
  };
  const second = await supabase
    .from("automation_runs")
    .insert(Object.fromEntries(Object.entries(minimal).filter(([, value]) => value !== undefined)))
    .select("id")
    .single();

  if (second.error) {
    console.error("NextLead SDR diagnostic minimal insert failed", second.error.message);
    return { id: null, error: second.error };
  }

  return { id: second.data?.id, error: null };
}

function isSdrVerboseDiagnosticsEnabled() {
  return String(process.env.NEXTLEAD_SDR_VERBOSE_LOGS || "").toLowerCase() === "true";
}

export async function persistEvolutionWebhook(payload: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase)
    return { persisted: false, reason: "Supabase não configurado." };

  const tenant = await getTenantContext();

  await supabase
    .from("webhook_events")
    .insert(withTenant({ provider: "evolution", payload }, tenant));

  const event = String(payload?.event || "").toLowerCase();
  const candidates = normalizeMessages(payload);
  const inboundMessageEvent = isInboundMessageEvent(event);
  const looksLikeStatusUpdate = candidates.some(
    (item) =>
      isProbablyStatusOnlyItem(item) &&
      Boolean(
        extractUpdateMessageId(item) ||
        phoneFromKey(
          item?.key ||
            item?.data?.key ||
            item?.message?.key ||
            item?.update?.key ||
            {},
          item,
        ),
      ),
  );

  // Importante: alguns payloads de MESSAGES_UPSERT da Evolution vêm com
  // campos como status/ack mesmo quando são mensagens recebidas.
  // Se tratarmos isso como update de status, a resposta do lead nunca entra no Inbox.
  // Por isso, eventos explícitos de mensagem sempre seguem para persistência de mensagem.
  if (!inboundMessageEvent && (isMessageStatusUpdateEvent(event) || looksLikeStatusUpdate)) {
    const updates = candidates;
    let statusUpdates = 0;

    for (const update of updates) {
      const updated = await updateOutboundStatusFromEvolution(supabase, update);
      if (updated) statusUpdates += 1;
    }

    return { persisted: true, messages: 0, statusUpdates, statusOnly: true };
  }

  const messages = normalizeMessages(payload);
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];
  const automationResults: any[] = [];

  for (const item of messages) {
    const key = item?.key || item?.data?.key || {};
    const chatCheck = shouldIgnoreChat(key, item);
    if (chatCheck.ignore) {
      skipped += 1;
      errors.push(`ignored:${chatCheck.reason}:${chatCheck.remoteJid || "sem_jid"}`);
      continue;
    }

    const phone = phoneFromKey(key, item);

    if (!phone) {
      skipped += 1;
      errors.push("ignored:no_phone_or_group");
      continue;
    }

    const fromMe = parseFromMe(key?.fromMe) || parseFromMe(item?.fromMe) || parseFromMe(item?.data?.key?.fromMe) || parseFromMe(item?.data?.fromMe);

    // Mensagens enviadas pelo próprio CRM já são salvas em /api/whatsapp/send.
    // Ignorar ecos fromMe evita criar contatos duplicados como "Você" para o mesmo número.
    if (fromMe) {
      skipped += 1;
      continue;
    }

    const pushName =
      item?.pushName || item?.verifiedBizName || item?.notifyName || phone;
    const messageType =
      item?.messageType ||
      item?.type ||
      Object.keys(item?.message || {})[0] ||
      "text";
    const body = extractText(item, messageType);
    const createdAt = toDate(
      item?.messageTimestamp ||
        item?.timestamp ||
        payload?.date_time ||
        item?.date_time,
    );
    const providerMessageId = key?.id || item?.id || undefined;

    if (isSdrVerboseDiagnosticsEnabled()) await insertSdrDiagnosticRun(supabase, tenant, {
      status: "started",
      summary: "Webhook elegível para SDR; preparando contato e oportunidade.",
      input: {
        phone,
        body: String(body || "").slice(0, 300),
        messageType,
        providerMessageId,
        event: payload?.event || null,
        source: "webhook_pre_contact",
      },
    });

    const contactResult = await upsertContactSafe(supabase, {
      phone,
      name: pushName || phone,
      createdAt: createdAt.toISOString(),
    }, tenant);

    if (contactResult.error || !contactResult.data?.id) {
      const contactError = contactResult.error?.message || "sem id";
      await insertSdrDiagnosticRun(supabase, tenant, {
        status: "error",
        summary: "SDR não conseguiu criar/encontrar contato a partir do webhook.",
        input: { phone, body: String(body || "").slice(0, 300), source: "webhook_contact_error" },
        error: contactError,
      });
      errors.push(
        `contact:${phone}:${contactError}`,
      );
      continue;
    }

    const contact = contactResult.data;

    if (isSdrVerboseDiagnosticsEnabled()) await insertSdrDiagnosticRun(supabase, tenant, {
      status: "started",
      summary: "SDR encontrou/criou contato; salvando mensagem e preparando automação.",
      contact_id: contact.id,
      input: { phone, contactId: contact.id, body: String(body || "").slice(0, 300), source: "webhook_contact_ok" },
    });

    let dealReady = false;
    if (!fromMe) {
      try {
        await ensureDealForContact(
          supabase,
          contact.id,
          `Atendimento WhatsApp - ${pushName || phone}`,
          tenant,
        );
        dealReady = true;
      } catch (dealError) {
        const dealMessage = dealError instanceof Error ? dealError.message : "erro ao preparar oportunidade";
        errors.push(`deal:${phone}:${dealMessage}`);
        await insertSdrDiagnosticRun(supabase, tenant, {
          status: "error",
          summary: "SDR não conseguiu preparar oportunidade, mas vai tentar responder mesmo assim.",
          contact_id: contact.id,
          input: { phone, contactId: contact.id, source: "webhook_deal_error" },
          error: dealMessage,
        });
      }
    }

    const record = withTenant({
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
    }, tenant);

    const messageResult = await saveMessageSafe(
      supabase,
      record,
      providerMessageId,
    );
    if (messageResult.error) {
      errors.push(`message:${phone}:${messageResult.error.message}`);
      await insertSdrDiagnosticRun(supabase, tenant, {
        status: "error",
        summary: "SDR não conseguiu salvar mensagem recebida, mas vai tentar responder mesmo assim.",
        contact_id: contact.id,
        input: { phone, contactId: contact.id, body: String(body || "").slice(0, 300), source: "webhook_message_error" },
        error: messageResult.error.message,
      });
      // Não interromper o SDR: alguns eventos repetidos da Evolution podem bater em conflito
      // de provider_message_id, mas ainda assim queremos registrar/diagnosticar a automação.
    } else {
      saved += 1;
    }

    if (!fromMe) {
      try {
        if (isSdrVerboseDiagnosticsEnabled()) await insertSdrDiagnosticRun(supabase, tenant, {
          status: "started",
          summary: "SDR vai chamar motor da automação agora.",
          contact_id: contact.id,
          input: { phone, contactId: contact.id, body: String(body || "").slice(0, 300), source: "webhook_before_run", dealReady, messageSaved: !messageResult.error },
        });
        await ensureDefaultAutomations(supabase, tenant);
        const debugStart = { phone, contactId: contact.id, tenantId: tenant.id, body: String(body || "").slice(0, 80), providerMessageId, dealReady, messageSaved: !messageResult.error };
        console.info("NextLead SDR webhook start", JSON.stringify(debugStart).slice(0, 1000));
        const automationResult = await runSdrAutomationForContact({ contactId: contact.id, tenant, source: "webhook" });
        automationResults.push({ phone, contactId: contact.id, ...automationResult });
        console.info("NextLead SDR webhook result", JSON.stringify({ phone, contactId: contact.id, ...automationResult }).slice(0, 2200));
        if (!automationResult?.ok) {
          errors.push(`automation:${phone}:${automationResult?.error || automationResult?.reason || "sem detalhes"}`);
        }
      } catch (automationError) {
        const message = automationError instanceof Error ? automationError.message : "erro";
        await insertSdrDiagnosticRun(supabase, tenant, {
          status: "error",
          summary: "SDR falhou durante execução automática do webhook.",
          contact_id: contact.id,
          input: { phone, contactId: contact.id, body: String(body || "").slice(0, 300), source: "webhook_automation_error" },
          error: message,
        });
        automationResults.push({ phone, contactId: contact.id, ok: false, error: message });
        console.error("NextLead SDR webhook error", message);
        errors.push(`automation:${phone}:${message}`);
      }
    }
  }

  return {
    persisted: true,
    messages: saved,
    skipped,
    errors,
    automationResults,
    event: payload?.event || null,
  };
}
