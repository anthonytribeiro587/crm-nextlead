import { createHash } from "node:crypto";
import { brazilPhoneVariants, normalizeBrazilWhatsAppPhone } from "./format";
import { getSupabaseAdmin } from "./supabase-admin";
import { applyTenantFilter, getTenantContext, withTenant, type TenantContext } from "./tenant";
import { sendWhatsAppText } from "./whatsapp";

type TrialContact = {
  id: string;
  name?: string | null;
  phone?: string | null;
  tags?: string[] | null;
};

type InboundEvolutionMessage = {
  phone: string;
  body: string;
  pushName: string;
  providerMessageId?: string;
  messageType: string;
  createdAt: string;
  rawPayload: any;
};

type TrialResult = {
  handled: boolean;
  ok?: boolean;
  stage?: string;
  osNumber?: string;
  duplicate?: boolean;
  error?: string;
};

const DEFAULT_TEST_PHONE_HASH = "36b3035408fdfe2b4c5eea555b146b36eddf56120d077286cc92661ae2a4f9e9";
const ACTIVATION_COMMANDS = new Set(["teste jr", "teste jr celular", "ativar jr"]);
const EXIT_COMMANDS = new Set(["sair jr", "encerrar teste jr", "parar teste jr"]);
const RESTART_COMMANDS = new Set(["novo teste", "reiniciar teste", "testar novamente"]);

function compactText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeBasic(value: unknown) {
  return compactText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFromMe(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim";
}

function normalizeMessages(payload: any): any[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (data?.key || data?.message || data?.id) return [data];
  if (payload?.key || payload?.message || payload?.id) return [payload];
  return [];
}

function extractText(item: any) {
  const source = item?.data || item || {};
  const message = source?.message || item?.message || source;
  return compactText(
    message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.imageMessage?.caption ||
      message?.videoMessage?.caption ||
      message?.documentMessage?.caption ||
      message?.buttonsResponseMessage?.selectedDisplayText ||
      message?.templateButtonReplyMessage?.selectedDisplayText ||
      message?.listResponseMessage?.title ||
      message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "",
  );
}

function extractInboundMessage(payload: any): InboundEvolutionMessage | undefined {
  const candidates = normalizeMessages(payload);

  for (const item of [...candidates].reverse()) {
    const source = item?.data || item || {};
    const key = source?.key || source?.message?.key || item?.key || {};
    const remoteJid = String(key?.remoteJid || source?.remoteJid || source?.jid || source?.from || "");

    if (!remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("@broadcast") || remoteJid.includes("@newsletter")) {
      continue;
    }

    if (parseFromMe(key?.fromMe) || parseFromMe(source?.fromMe) || parseFromMe(item?.fromMe)) {
      continue;
    }

    const body = extractText(item);
    if (!body) continue;

    const phone = normalizeBrazilWhatsAppPhone(remoteJid.split("@")[0]);
    if (!phone) continue;

    const timestamp = Number(source?.messageTimestamp || source?.timestamp || payload?.date_time || Date.now() / 1000);
    const createdAt = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000).toISOString();
    const message = source?.message || item?.message || {};

    return {
      phone,
      body,
      pushName: compactText(source?.pushName || source?.verifiedBizName || source?.notifyName || phone),
      providerMessageId: key?.id || source?.id || item?.id || undefined,
      messageType: source?.messageType || source?.type || Object.keys(message)[0] || "text",
      createdAt,
      rawPayload: item,
    };
  }

  return undefined;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isAuthorizedTester(phone: string) {
  const normalized = normalizeBrazilWhatsAppPhone(phone);
  const configuredPhone = normalizeBrazilWhatsAppPhone(process.env.JR_TRIAL_TEST_PHONE || "");
  if (configuredPhone) return normalized === configuredPhone;

  const allowedHash = process.env.JR_TRIAL_TEST_PHONE_HASH?.trim() || DEFAULT_TEST_PHONE_HASH;
  return sha256(normalized) === allowedHash;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => compactText(item)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => compactText(item)).filter(Boolean);
    } catch {
      return value.split(",").map((item) => compactText(item)).filter(Boolean);
    }
  }
  return [];
}

function withoutJrTags(tags: string[]) {
  return tags.filter((tag) => tag !== "jr_trial" && !tag.startsWith("jr_"));
}

function tagValue(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
}

function stageFromTags(tags: string[]) {
  return tagValue(tags, "jr_stage:") || "device";
}

function replaceTrialTags(tags: string[], values: string[]) {
  return [...withoutJrTags(tags), "jr_trial", ...values];
}

function safeTagValue(value: string, maxLength = 100) {
  return compactText(value).replace(/[\r\n,]/g, " ").slice(0, maxLength);
}

async function findContact(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  phone: string,
): Promise<TrialContact | undefined> {
  const variants = brazilPhoneVariants(phone);
  let query = supabase.from("contacts").select("id,name,phone,tags").in("phone", variants).limit(1);
  query = applyTenantFilter(query, tenant);
  let result = await query.maybeSingle();

  if (result.error && String(result.error.message || "").toLowerCase().includes("tags")) {
    let fallbackQuery = supabase.from("contacts").select("id,name,phone").in("phone", variants).limit(1);
    fallbackQuery = applyTenantFilter(fallbackQuery, tenant);
    const fallback = await fallbackQuery.maybeSingle();
    if (!fallback.error && fallback.data?.id) return { ...fallback.data, tags: [] };
  }

  return result.data?.id ? (result.data as TrialContact) : undefined;
}

async function getOrCreateContact(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  inbound: InboundEvolutionMessage,
): Promise<TrialContact> {
  const existing = await findContact(supabase, tenant, inbound.phone);
  if (existing?.id) return { ...existing, tags: normalizeTags(existing.tags) };

  const payload = withTenant(
    {
      phone: inbound.phone,
      name: inbound.pushName || inbound.phone,
      source: "WhatsApp",
      owner: "NextLead",
      temperature: "morno",
      tags: [],
      last_message_at: inbound.createdAt,
      updated_at: new Date().toISOString(),
    },
    tenant,
  );

  let inserted = await supabase.from("contacts").insert(payload).select("id,name,phone,tags").single();

  if (inserted.error) {
    inserted = await supabase
      .from("contacts")
      .insert(withTenant({ phone: inbound.phone, name: inbound.pushName || inbound.phone }, tenant))
      .select("id,name,phone")
      .single();
  }

  if (inserted.error || !inserted.data?.id) {
    const retry = await findContact(supabase, tenant, inbound.phone);
    if (retry?.id) return { ...retry, tags: normalizeTags(retry.tags) };
    throw new Error(inserted.error?.message || "Não foi possível criar o contato de teste.");
  }

  return { ...(inserted.data as TrialContact), tags: normalizeTags((inserted.data as TrialContact).tags) };
}

async function updateContactTags(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  contactId: string,
  tags: string[],
) {
  const result = await supabase
    .from("contacts")
    .update({ tags, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", contactId);

  if (result.error) throw new Error(`Não foi possível salvar a sessão JR: ${result.error.message}`);
}

async function saveInboundMessage(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contactId: string,
  inbound: InboundEvolutionMessage,
) {
  if (inbound.providerMessageId) {
    const existing = await supabase
      .from("messages")
      .select("id")
      .eq("provider_message_id", inbound.providerMessageId)
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) return { duplicate: true };
  }

  const fullRecord = withTenant(
    {
      contact_id: contactId,
      direction: "inbound",
      body: inbound.body,
      type: inbound.messageType || "text",
      status: "received",
      provider: "evolution",
      provider_message_id: inbound.providerMessageId || null,
      raw_payload: inbound.rawPayload,
      created_at: inbound.createdAt,
      updated_at: new Date().toISOString(),
    },
    tenant,
  );

  let result = await supabase.from("messages").insert(fullRecord);
  if (result.error) {
    result = await supabase.from("messages").insert({
      contact_id: contactId,
      direction: "inbound",
      body: inbound.body,
      type: inbound.messageType || "text",
      status: "received",
      created_at: inbound.createdAt,
    });
  }

  if (result.error) throw new Error(`Não foi possível salvar a mensagem recebida: ${result.error.message}`);
  return { duplicate: false };
}

async function sendAndSaveReply(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contactId: string,
  phone: string,
  body: string,
) {
  const sent = await sendWhatsAppText({ to: phone, body });
  const createdAt = new Date().toISOString();
  const fullRecord = withTenant(
    {
      contact_id: contactId,
      direction: "outbound",
      body,
      type: "text",
      status: "sent",
      provider: sent.provider,
      provider_message_id: sent.providerMessageId || null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    tenant,
  );

  let result = await supabase.from("messages").insert(fullRecord);
  if (result.error) {
    result = await supabase.from("messages").insert({
      contact_id: contactId,
      direction: "outbound",
      body,
      type: "text",
      status: "sent",
      created_at: createdAt,
    });
  }

  if (result.error) console.error("JR trial outbound history error", result.error.message);
}

function inferDevice(text: string) {
  const patterns = [
    /\biphone\s*(?:se|x[rs]?|\d{1,2})(?:\s*(?:pro|max|plus|mini))?\b/i,
    /\b(?:samsung\s*)?(?:galaxy\s*)?[asmz]\s?\d{2,3}(?:\s*(?:ultra|fe|plus))?\b/i,
    /\b(?:moto|motorola)\s+[a-z0-9+\- ]{1,24}\b/i,
    /\b(?:redmi|xiaomi|poco)\s+[a-z0-9+\- ]{1,24}\b/i,
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern)?.[0];
    if (matched) return compactText(matched);
  }

  const cleaned = compactText(text)
    .replace(/^(meu|minha|e um|é um|tenho um|tenho uma)\s+/i, "")
    .replace(/[.!?,;:]+$/g, "");
  return cleaned.length >= 2 && cleaned.length <= 60 ? cleaned : undefined;
}

function inferIssueSummary(text: string) {
  const options: Array<[RegExp, string]> = [
    [/caiu.*(?:agua|água)|molhou|oxid/i, "possível contato com líquido/oxidação"],
    [/nao liga|não liga|morto|sem sinal de vida/i, "aparelho não liga"],
    [/tela.*(?:quebrada|trincada|preta|apagada)|display|touch/i, "problema na tela/display"],
    [/bateria|descarrega|nao segura carga|não segura carga/i, "problema de bateria"],
    [/nao.*carrega|não.*carrega|conector|carregamento/i, "problema de carregamento"],
    [/camera|câmera|foco/i, "problema na câmera"],
    [/microfone|alto.?falante|sem som|audio|áudio/i, "problema de áudio"],
    [/travando|lento|reinicia|loop|software/i, "falha de software/desempenho"],
  ];

  return options.find(([pattern]) => pattern.test(text))?.[1] || compactText(text).slice(0, 140);
}

function buildOsNumber(phone: string) {
  const date = new Date();
  const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `JR-T${stamp}-${phone.slice(-4)}`;
}

async function polishFinalReply(input: { device: string; issue: string; osNumber: string }) {
  const fallback = `Triagem concluída ✅\n\nAparelho: ${input.device}\nRelato: ${input.issue}\nOS de teste: ${input.osNumber}\n\nA equipe técnica confirmaria o diagnóstico, o prazo e o orçamento após avaliar o aparelho.`;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fallback;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Você é o atendimento da JR Celular. Reescreva a mensagem abaixo em português brasileiro, com tom humano e profissional, adequada ao WhatsApp. Preserve exatamente o aparelho e o código da OS. Não invente preço, prazo, diagnóstico, garantia ou disponibilidade de peça. Use no máximo 75 palavras.\n\n${fallback}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.35, maxOutputTokens: 180 },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) return fallback;
    const payload = await response.json();
    const text = compactText(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!text || !text.includes(input.osNumber)) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

async function ensureTrialDeal(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contactId: string,
  osNumber: string,
  device: string,
) {
  let existingQuery = supabase.from("deals").select("id").eq("contact_id", contactId).eq("title", `OS ${osNumber} - ${device}`).limit(1);
  existingQuery = applyTenantFilter(existingQuery, tenant);
  const existing = await existingQuery.maybeSingle();
  if (existing.data?.id) return existing.data.id;

  let pipelineQuery = supabase.from("pipelines").select("id,name").ilike("name", "%Ordem de Serviço%").limit(1);
  pipelineQuery = applyTenantFilter(pipelineQuery, tenant);
  let pipeline = await pipelineQuery.maybeSingle();

  if (!pipeline.data?.id) {
    let fallbackPipelineQuery = supabase.from("pipelines").select("id,name").order("created_at", { ascending: true }).limit(1);
    fallbackPipelineQuery = applyTenantFilter(fallbackPipelineQuery, tenant);
    pipeline = await fallbackPipelineQuery.maybeSingle();
  }

  if (!pipeline.data?.id) return undefined;

  let stageQuery = supabase
    .from("pipeline_stages")
    .select("id,pipeline_id")
    .eq("pipeline_id", pipeline.data.id)
    .order("position", { ascending: true })
    .limit(1);
  stageQuery = applyTenantFilter(stageQuery, tenant);
  let stage = await stageQuery.maybeSingle();

  if (stage.error && tenant.tenantTableReady) {
    stage = await supabase
      .from("pipeline_stages")
      .select("id,pipeline_id")
      .eq("pipeline_id", pipeline.data.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  if (!stage.data?.id) return undefined;

  const deal = await supabase
    .from("deals")
    .insert(
      withTenant(
        {
          contact_id: contactId,
          pipeline_id: pipeline.data.id,
          stage_id: stage.data.id,
          title: `OS ${osNumber} - ${device}`,
          status: "aberto",
          value: 0,
          source: "WhatsApp / Trial JR",
        },
        tenant,
      ),
    )
    .select("id")
    .single();

  if (deal.error) console.error("JR trial deal error", deal.error.message);
  return deal.data?.id;
}

async function completeTrial(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contact: TrialContact,
  inbound: InboundEvolutionMessage,
  tags: string[],
  device: string,
  issueText: string,
) {
  const issue = inferIssueSummary(issueText);
  const osNumber = buildOsNumber(inbound.phone);
  const nextTags = replaceTrialTags(tags, [
    "jr_stage:complete",
    `jr_device:${safeTagValue(device, 70)}`,
    `jr_issue:${safeTagValue(issue, 100)}`,
    `jr_os:${osNumber}`,
  ]);

  await updateContactTags(supabase, contact.id, nextTags);
  await ensureTrialDeal(supabase, tenant, contact.id, osNumber, device);
  const reply = await polishFinalReply({ device, issue, osNumber });
  await sendAndSaveReply(supabase, tenant, contact.id, inbound.phone, reply);

  return { handled: true, ok: true, stage: "complete", osNumber } satisfies TrialResult;
}

export async function processJrWhatsappTrial(payload: any): Promise<TrialResult> {
  const inbound = extractInboundMessage(payload);
  if (!inbound || !isAuthorizedTester(inbound.phone)) return { handled: false };

  const normalizedBody = normalizeBasic(inbound.body);
  const isActivation = ACTIVATION_COMMANDS.has(normalizedBody);

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { handled: isActivation, ok: false, error: "Supabase não configurado." };

    const tenant = await getTenantContext();
    const existingContact = await findContact(supabase, tenant, inbound.phone);
    const existingTags = normalizeTags(existingContact?.tags);
    const isActive = existingTags.includes("jr_trial");

    if (!isActivation && !isActive) return { handled: false };

    const contact = existingContact?.id
      ? { ...existingContact, tags: existingTags }
      : await getOrCreateContact(supabase, tenant, inbound);
    const tags = normalizeTags(contact.tags);

    await supabase.from("webhook_events").insert(withTenant({ provider: "evolution-jr-trial", payload }, tenant));
    const saved = await saveInboundMessage(supabase, tenant, contact.id, inbound);
    if (saved.duplicate) return { handled: true, ok: true, duplicate: true, stage: stageFromTags(tags) };

    if (isActivation) {
      const nextTags = replaceTrialTags(tags, ["jr_stage:device"]);
      await updateContactTags(supabase, contact.id, nextTags);
      await sendAndSaveReply(
        supabase,
        tenant,
        contact.id,
        inbound.phone,
        "🧪 Modo de teste JR Celular ativado. Vou simular o atendimento automático com IA. Qual é a marca e o modelo do aparelho?",
      );
      return { handled: true, ok: true, stage: "device" };
    }

    if (EXIT_COMMANDS.has(normalizedBody)) {
      await updateContactTags(supabase, contact.id, withoutJrTags(tags));
      await sendAndSaveReply(
        supabase,
        tenant,
        contact.id,
        inbound.phone,
        "Teste da JR Celular encerrado. Suas próximas mensagens voltam ao atendimento normal da Next Lead.",
      );
      return { handled: true, ok: true, stage: "closed" };
    }

    if (RESTART_COMMANDS.has(normalizedBody)) {
      const nextTags = replaceTrialTags(tags, ["jr_stage:device"]);
      await updateContactTags(supabase, contact.id, nextTags);
      await sendAndSaveReply(
        supabase,
        tenant,
        contact.id,
        inbound.phone,
        "Novo teste iniciado. Qual é a marca e o modelo do aparelho?",
      );
      return { handled: true, ok: true, stage: "device" };
    }

    const stage = stageFromTags(tags);

    if (stage === "device") {
      const device = inferDevice(inbound.body);
      if (!device) {
        await sendAndSaveReply(
          supabase,
          tenant,
          contact.id,
          inbound.phone,
          "Não consegui identificar o aparelho. Informe a marca e o modelo, por exemplo: iPhone 13, Galaxy A54 ou Moto G84.",
        );
        return { handled: true, ok: true, stage: "device" };
      }

      const issueInSameMessage = inferIssueSummary(inbound.body);
      const hasRecognizedIssue = issueInSameMessage !== compactText(inbound.body).slice(0, 140);
      if (hasRecognizedIssue) {
        return completeTrial(supabase, tenant, contact, inbound, tags, device, inbound.body);
      }

      const nextTags = replaceTrialTags(tags, ["jr_stage:issue", `jr_device:${safeTagValue(device, 70)}`]);
      await updateContactTags(supabase, contact.id, nextTags);
      await sendAndSaveReply(
        supabase,
        tenant,
        contact.id,
        inbound.phone,
        `Entendi, é um ${device}. O que aconteceu com o aparelho e quais sintomas ele apresenta?`,
      );
      return { handled: true, ok: true, stage: "issue" };
    }

    if (stage === "issue") {
      const device = tagValue(tags, "jr_device:") || "aparelho informado";
      if (inbound.body.length < 4) {
        await sendAndSaveReply(
          supabase,
          tenant,
          contact.id,
          inbound.phone,
          "Descreva um pouco melhor o defeito. Exemplo: a tela ficou preta, não carrega, não liga ou descarrega rápido.",
        );
        return { handled: true, ok: true, stage: "issue" };
      }
      return completeTrial(supabase, tenant, contact, inbound, tags, device, inbound.body);
    }

    const osNumber = tagValue(tags, "jr_os:");
    await sendAndSaveReply(
      supabase,
      tenant,
      contact.id,
      inbound.phone,
      osNumber
        ? `A OS de teste ${osNumber} já está com a triagem concluída. Envie NOVO TESTE para simular outro aparelho ou SAIR JR para voltar ao atendimento normal.`
        : "A triagem já foi concluída. Envie NOVO TESTE para começar novamente ou SAIR JR para encerrar.",
    );
    return { handled: true, ok: true, stage: "complete", osNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no teste JR pelo WhatsApp.";
    console.error("JR WhatsApp trial error", message);
    return { handled: true, ok: false, error: message };
  }
}
