import { getSupabaseAdmin } from "./supabase-admin";
import { applyTenantFilter, getTenantContext, withTenant, type TenantContext } from "./tenant";
import type { Contact, Deal, LeadTemperature, Message, Pipeline, Stage } from "./types";
import { sendWhatsAppText } from "./whatsapp";

export type AutomationMode = "off" | "suggest" | "auto";
export type AutomationType = "sdr_nextlead" | "welcome" | "followup" | "post_proposal" | string;

export type Automation = {
  id: string;
  tenantId?: string;
  name: string;
  description: string;
  type: AutomationType;
  enabled: boolean;
  mode: AutomationMode;
  triggerType: string;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  lastRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AutomationRun = {
  id: string;
  automationId?: string;
  contactId?: string;
  dealId?: string;
  status: "success" | "error" | "skipped" | string;
  summary?: string;
  output?: any;
  error?: string;
  createdAt: string;
};

export type SdrAnalysis = {
  summary: string;
  suggestedReply: string;
  nextQuestion: string;
  temperature: LeadTemperature;
  suggestedStageHint: string;
  shouldHandoff: boolean;
  handoffReason: string;
  extracted: {
    businessType?: string;
    hasWebsite?: "sim" | "nao" | "nao_informado";
    wantsWhatsAppLeads?: "sim" | "nao" | "nao_informado";
    urgency?: "baixa" | "media" | "alta";
  };
};

export const defaultSdrAgentInstructions = `Você é um SDR humano da Next Lead, uma empresa que cria landing pages e soluções simples de captação de leads.

Regras de comportamento:
- Nunca diga que é IA, robô, modelo ou automação.
- Apresente-se como atendimento da Next Lead.
- Seja curto, natural e comercial, como conversa de WhatsApp.
- Não prometa preço fechado, prazo fechado, garantia de clientes ou resultado garantido.
- Não invente informações que o lead não passou.
- Faça uma pergunta por vez.
- Seu objetivo é qualificar, não fechar a venda sozinho.
- Descubra: tipo de negócio, se já tem site/landing page, se quer receber mais orçamentos pelo WhatsApp e urgência.
- Quando o lead demonstrar interesse real, diga que vai encaminhar para alguém da equipe orientar.
- Se o lead pedir preço, diga que depende do nível de personalização e pergunte sobre o negócio antes de passar para avaliação.
- Use português brasileiro.
- Não use markdown pesado; no máximo quebras de linha curtas.`;

export const defaultSdrAutomation: Automation = {
  id: "sdr-nextlead-default",
  name: "SDR NextLead",
  description: "Qualifica leads pelo WhatsApp: negócio, site/landing, intenção de captar clientes e entrega para atendimento humano quando estiver quente.",
  type: "sdr_nextlead",
  enabled: true,
  mode: "suggest",
  triggerType: "message_received",
  conditions: {
    onlyOpenDeals: true,
    avoidHumanTakeover: true,
    businessHoursOnly: false,
    cooldownMinutes: 5,
  },
  actions: {
    generateReply: true,
    classifyTemperature: true,
    suggestStage: true,
    logHistory: true,
    autoSendRequiresEnv: true,
    agentInstructions: defaultSdrAgentInstructions,
  },
};

export const automationTemplates: Automation[] = [
  defaultSdrAutomation,
  {
    id: "welcome-template",
    name: "Boas-vindas para novo lead",
    description: "Envia uma primeira mensagem quando um lead entra pela landing page ou WhatsApp.",
    type: "welcome",
    enabled: false,
    mode: "off",
    triggerType: "lead_created",
    conditions: { onlyNewLeads: true },
    actions: { sendWelcomeMessage: true, createFollowup: false },
  },
  {
    id: "followup-template",
    name: "Follow-up de lead parado",
    description: "Cria uma próxima ação quando o lead fica sem resposta por um período definido.",
    type: "followup",
    enabled: false,
    mode: "off",
    triggerType: "lead_idle",
    conditions: { idleHours: 24 },
    actions: { createActivity: true, markUrgent: true },
  },
  {
    id: "post-proposal-template",
    name: "Pós-proposta",
    description: "Lembra o atendente de retomar leads com proposta enviada após alguns dias.",
    type: "post_proposal",
    enabled: false,
    mode: "off",
    triggerType: "stage_changed_to_proposal",
    conditions: { waitDays: 2 },
    actions: { createActivity: true, suggestMessage: true },
  },
];

function mapAutomation(row: any): Automation {
  return {
    id: row.id,
    tenantId: row.tenant_id || undefined,
    name: row.name || "Automação",
    description: row.description || "",
    type: row.type || "custom",
    enabled: row.enabled !== false,
    mode: row.mode || "suggest",
    triggerType: row.trigger_type || "manual",
    conditions: row.conditions || {},
    actions: row.actions || {},
    lastRunAt: row.last_run_at || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

function mapRun(row: any): AutomationRun {
  return {
    id: row.id,
    automationId: row.automation_id || undefined,
    contactId: row.contact_id || undefined,
    dealId: row.deal_id || undefined,
    status: row.status || "success",
    summary: row.summary || undefined,
    output: row.output || undefined,
    error: row.error || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function getAutomationsData() {
  const supabase = getSupabaseAdmin();
  const tenant = await getTenantContext();

  if (!supabase) {
    return {
      automations: automationTemplates,
      runs: [],
      tableReady: false,
      error: "Supabase não configurado.",
    };
  }

  const automationsResult = await applyTenantFilter(
    supabase
      .from("automations")
      .select("id,tenant_id,name,description,type,enabled,mode,trigger_type,conditions,actions,last_run_at,created_at,updated_at")
      .order("created_at", { ascending: true }),
    tenant,
  );

  if (automationsResult.error) {
    return {
      automations: automationTemplates,
      runs: [],
      tableReady: false,
      error: automationsResult.error.message,
    };
  }

  const runsResult = await applyTenantFilter(
    supabase
      .from("automation_runs")
      .select("id,automation_id,contact_id,deal_id,status,summary,output,error,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    tenant,
  );

  return {
    automations: (automationsResult.data || []).map(mapAutomation),
    runs: runsResult.error ? [] : (runsResult.data || []).map(mapRun),
    tableReady: true,
    error: runsResult.error?.message,
  };
}

export async function ensureDefaultAutomations(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, tenant: TenantContext) {
  if (!tenant.tenantTableReady) return;

  const { data: existing, error } = await supabase
    .from("automations")
    .select("id,type")
    .eq("tenant_id", tenant.id)
    .eq("type", "sdr_nextlead")
    .limit(1)
    .maybeSingle();

  if (!error && existing?.id) return existing.id;

  const record = withTenant({
    name: defaultSdrAutomation.name,
    description: defaultSdrAutomation.description,
    type: defaultSdrAutomation.type,
    enabled: true,
    mode: "suggest",
    trigger_type: defaultSdrAutomation.triggerType,
    conditions: defaultSdrAutomation.conditions,
    actions: defaultSdrAutomation.actions,
  }, tenant);

  const { data } = await supabase.from("automations").insert(record).select("id").single();
  return data?.id;
}

function compactText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hasAny(text: string, words: string[]) {
  const normalized = text.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function inferBusinessType(text: string, contact?: Contact) {
  const source = `${contact?.company || ""} ${text}`.toLowerCase();
  const options: Array<[string, string[]]> = [
    ["assistência técnica", ["assistência", "celular", "telefone", "conserto", "manutenção"]],
    ["academia / studio", ["academia", "cross", "gym", "personal", "aluno", "treino"]],
    ["serviços locais", ["eletric", "instala", "pintura", "reforma", "obra", "manutenção"]],
    ["loja / comércio", ["loja", "venda", "produto", "revenda", "cliente na loja"]],
    ["clínica / atendimento", ["clínica", "consulta", "dent", "estética", "saúde"]],
  ];
  return options.find(([, words]) => hasAny(source, words))?.[0];
}

function inferHasWebsite(text: string): SdrAnalysis["extracted"]["hasWebsite"] {
  const lower = text.toLowerCase();
  if (hasAny(lower, ["não tenho site", "nao tenho site", "só instagram", "so instagram", "não tenho landing", "nao tenho landing"])) return "nao";
  if (hasAny(lower, ["tenho site", "tenho landing", "já tenho site", "ja tenho site", "meu site"])) return "sim";
  return "nao_informado";
}

function inferWantsWhatsappLeads(text: string): SdrAnalysis["extracted"]["wantsWhatsAppLeads"] {
  const lower = text.toLowerCase();
  if (hasAny(lower, ["whatsapp", "zap", "orçamento", "orcamento", "mais clientes", "leads", "chamar", "mensagem"])) return "sim";
  if (hasAny(lower, ["não quero whatsapp", "nao quero whatsapp", "só catálogo", "so catalogo"])) return "nao";
  return "nao_informado";
}


function mapContactRow(row: any): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || undefined,
    company: row.company || undefined,
    source: row.source || "WhatsApp",
    owner: row.owner || "NextLead",
    temperature: row.temperature || "morno",
    tags: Array.isArray(row.tags) ? row.tags : [],
    lastMessageAt: row.last_message_at || row.created_at || new Date().toISOString(),
    notes: row.notes || undefined,
  };
}

function mapDealRow(row: any): Deal {
  return {
    id: row.id,
    contactId: row.contact_id,
    title: row.title || "Oportunidade",
    value: Number(row.value || 0),
    pipelineId: row.pipeline_id || undefined,
    stageId: row.stage_id,
    status: row.status || "aberto",
    expectedClose: row.expected_close || undefined,
    lostReason: row.lost_reason || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function mapMessageRow(row: any): Message {
  return {
    id: row.id,
    contactId: row.contact_id,
    direction: row.direction,
    body: row.body,
    status: row.status || "received",
    createdAt: row.created_at || new Date().toISOString(),
    providerMessageId: row.provider_message_id || undefined,
    type: row.type || "text",
  };
}

async function insertAutomationRun(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  record: Record<string, any>,
) {
  const full = withTenant(record, tenant);
  const { error } = await supabase.from("automation_runs").insert(full);
  return error;
}

function isAutoSdrGloballyEnabled() {
  return String(process.env.NEXTLEAD_ENABLE_AUTO_SDR || "").toLowerCase() === "true";
}

function shouldSkipBecauseRecentRun(runs: any[], mode: AutomationMode) {
  if (mode !== "auto") return false;
  const cooldownMs = Number(process.env.NEXTLEAD_AUTO_SDR_COOLDOWN_SECONDS || 35) * 1000;
  const now = Date.now();
  return (runs || []).some((run) => {
    const created = new Date(run.created_at || 0).getTime();
    if (!created || Number.isNaN(created)) return false;
    return now - created < cooldownMs && String(run.status || "") === "success";
  });
}

export type RunSdrAutomationInput = {
  contactId: string;
  tenant?: TenantContext;
  requestedMode?: AutomationMode;
  source?: "manual" | "webhook";
};

export async function runSdrAutomationForContact(input: RunSdrAutomationInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const analysis = analyzeSdrLocally({ messages: [] });
    return { ok: true, demo: true, mode: "suggest" as AutomationMode, sent: false, analysis };
  }

  const tenant = input.tenant || (await getTenantContext());
  const automationId = await ensureDefaultAutomations(supabase, tenant);
  const automationResult = automationId
    ? await applyTenantFilter(
        supabase.from("automations").select("id,enabled,mode,type,actions,conditions").eq("id", automationId).limit(1),
        tenant,
      ).maybeSingle()
    : ({ data: null, error: null } as any);

  const automation = automationResult.data;
  const storedMode = (automation?.mode || "suggest") as AutomationMode;
  const mode = input.requestedMode || storedMode;

  if (automation && (automation.enabled === false || mode === "off")) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation.id,
      contact_id: input.contactId,
      status: "skipped",
      summary: "Automação SDR desligada.",
      input: { contactId: input.contactId, mode, source: input.source || "manual" },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Automação SDR desligada." };
  }

  const contactResult = await applyTenantFilter(
    supabase.from("contacts").select("id,name,phone,email,company,source,owner,temperature,tags,notes,last_message_at,created_at").eq("id", input.contactId).limit(1),
    tenant,
  ).maybeSingle();

  if (contactResult.error || !contactResult.data?.id) {
    return { ok: false, status: 404, error: contactResult.error?.message || "Contato não encontrado." };
  }

  const contact = mapContactRow(contactResult.data);

  const recentRuns = await applyTenantFilter(
    supabase
      .from("automation_runs")
      .select("id,status,summary,created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(3),
    tenant,
  );

  if (shouldSkipBecauseRecentRun(recentRuns.data || [], mode)) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      status: "skipped",
      summary: "SDR automático ignorado por cooldown anti-duplicidade.",
      input: { contactId: contact.id, mode, source: input.source || "manual" },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Cooldown anti-duplicidade." };
  }

  const dealsResult = await applyTenantFilter(
    supabase
      .from("deals")
      .select("id,contact_id,pipeline_id,stage_id,title,value,status,expected_close,lost_reason,created_at,updated_at")
      .eq("contact_id", contact.id)
      .eq("status", "aberto")
      .order("updated_at", { ascending: false })
      .limit(1),
    tenant,
  ).maybeSingle();
  const deal = dealsResult.data ? mapDealRow(dealsResult.data) : undefined;

  let stage: Stage | undefined;
  let pipeline: Pipeline | undefined;

  if (deal?.stageId) {
    const stageResult = await applyTenantFilter(
      supabase.from("pipeline_stages").select("id,pipeline_id,title,position,color").eq("id", deal.stageId).limit(1),
      tenant,
    ).maybeSingle();
    if (stageResult.data) {
      stage = {
        id: stageResult.data.id,
        pipelineId: stageResult.data.pipeline_id,
        title: stageResult.data.title,
        order: stageResult.data.position,
        color: stageResult.data.color || "#4f8cff",
      };
    }
  }

  const pipelineId = deal?.pipelineId || stage?.pipelineId;
  if (pipelineId) {
    const pipelineResult = await applyTenantFilter(
      supabase.from("pipelines").select("id,name,created_at").eq("id", pipelineId).limit(1),
      tenant,
    ).maybeSingle();
    if (pipelineResult.data) pipeline = { id: pipelineResult.data.id, name: pipelineResult.data.name, createdAt: pipelineResult.data.created_at || undefined };
  }

  const messagesResult = await applyTenantFilter(
    supabase
      .from("messages")
      .select("id,contact_id,direction,body,status,type,provider_message_id,created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(14),
    tenant,
  );
  const messages = (messagesResult.data || []).map(mapMessageRow).reverse();

  const agentInstructions = String(automation?.actions?.agentInstructions || process.env.NEXTLEAD_SDR_PROMPT || defaultSdrAgentInstructions).trim();
  const analysis = process.env.GEMINI_API_KEY
    ? await analyzeSdrWithGemini({ contact, deal, stage, pipeline, messages, agentInstructions })
    : analyzeSdrLocally({ contact, deal, stage, pipeline, messages });

  if (mode === "auto" && !isAutoSdrGloballyEnabled()) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      deal_id: deal?.id || null,
      status: "skipped",
      summary: "SDR em automático, mas NEXTLEAD_ENABLE_AUTO_SDR não está true no deploy.",
      input: { contactId: contact.id, mode, source: input.source || "manual" },
      output: { ...analysis, autoSendEnabled: false },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "NEXTLEAD_ENABLE_AUTO_SDR não está true no deploy.", analysis };
  }

  await applyTenantFilter(supabase.from("contacts").update({ temperature: analysis.temperature, updated_at: new Date().toISOString() }).eq("id", contact.id), tenant);

  const historyTitle = analysis.shouldHandoff
    ? `IA SDR qualificou lead como ${analysis.temperature}. ${analysis.handoffReason}`
    : `IA SDR gerou sugestão. Próxima pergunta: ${analysis.nextQuestion}`;

  await supabase.from("activities").insert(
    withTenant(
      {
        contact_id: contact.id,
        title: historyTitle,
        due_at: new Date().toISOString(),
        done: true,
        updated_at: new Date().toISOString(),
      },
      tenant,
    ),
  );

  let sent = false;
  let providerMessageId: string | undefined;
  const canAutoSend = mode === "auto" && isAutoSdrGloballyEnabled() && Boolean(contact.phone);

  if (canAutoSend) {
    try {
      const result = await sendWhatsAppText({ to: contact.phone, body: analysis.suggestedReply });
      providerMessageId = result.providerMessageId;
      sent = true;
      await supabase.from("messages").insert(
        withTenant(
          {
            contact_id: contact.id,
            direction: "outbound",
            body: analysis.suggestedReply,
            type: "text",
            status: "sent",
            provider: result.provider,
            provider_message_id: providerMessageId,
            raw_payload: result.payload,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          tenant,
        ),
      );
    } catch (error: any) {
      await insertAutomationRun(supabase, tenant, {
        automation_id: automation?.id || automationId,
        contact_id: contact.id,
        deal_id: deal?.id || null,
        status: "error",
        summary: "Falha ao enviar resposta automática do SDR.",
        input: { contactId: contact.id, mode, source: input.source || "manual" },
        output: analysis,
        error: error.message,
      });
      return { ok: false, status: 500, error: error.message, mode, sent: false, analysis };
    }
  }

  await insertAutomationRun(supabase, tenant, {
    automation_id: automation?.id || automationId,
    contact_id: contact.id,
    deal_id: deal?.id || null,
    status: "success",
    summary: sent ? "IA SDR respondeu automaticamente." : "IA SDR gerou sugestão de atendimento.",
    input: { contactId: contact.id, mode, source: input.source || "manual" },
    output: { ...analysis, autoSendEnabled: isAutoSdrGloballyEnabled(), providerMessageId },
  });

  if (automation?.id) {
    await applyTenantFilter(
      supabase.from("automations").update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", automation.id),
      tenant,
    );
  }

  return { ok: true, mode, sent, autoSendEnabled: isAutoSdrGloballyEnabled(), analysis };
}

export function analyzeSdrLocally(input: {
  contact?: Contact;
  deal?: Deal;
  stage?: Stage;
  pipeline?: Pipeline;
  messages: Message[];
}): SdrAnalysis {
  const { contact, deal, stage, pipeline, messages } = input;
  const inbound = messages.filter((message) => message.direction === "inbound");
  const lastInbound = compactText(inbound.at(-1)?.body || "");
  const allText = compactText(messages.map((message) => `${message.direction}: ${message.body}`).join("\n"));
  const businessType = inferBusinessType(allText, contact);
  const hasWebsite = inferHasWebsite(allText);
  const wantsWhatsAppLeads = inferWantsWhatsappLeads(allText);
  const urgency: SdrAnalysis["extracted"]["urgency"] = hasAny(allText, ["urgente", "essa semana", "quanto antes", "hoje", "preciso"]) ? "alta" : inbound.length >= 3 ? "media" : "baixa";

  let missingQuestion = "qual é o tipo do seu negócio?";
  if (businessType) missingQuestion = "hoje você já tem site ou landing page, ou usa mais Instagram/WhatsApp?";
  if (businessType && hasWebsite !== "nao_informado") missingQuestion = "seu objetivo é receber mais pedidos de orçamento direto no WhatsApp?";
  if (businessType && hasWebsite !== "nao_informado" && wantsWhatsAppLeads !== "nao_informado") missingQuestion = "quer que eu encaminhe para uma avaliação com a equipe da Next Lead?";

  const qualified = Boolean(businessType && wantsWhatsAppLeads === "sim");
  const temperature: LeadTemperature = qualified && (hasWebsite === "nao" || urgency !== "baixa") ? "quente" : qualified ? "morno" : "frio";
  const shouldHandoff = temperature === "quente" || (qualified && inbound.length >= 2);
  const first = compactText(contact?.name).split(" ")[0] || "tudo bem";

  const suggestedReply = shouldHandoff
    ? `Perfeito, ${first}. Pelo que você me falou, faz sentido a Next Lead avaliar uma landing page/estrutura simples para transformar esse interesse em contatos pelo WhatsApp. Vou encaminhar para alguém da equipe te orientar com o melhor caminho.`
    : `Oi, ${first}! Para eu te orientar melhor: ${missingQuestion.charAt(0).toUpperCase()}${missingQuestion.slice(1)}`;

  const summaryParts = [
    `${contact?.name || "Lead"} está em ${pipeline?.name || "funil não definido"}${stage?.title ? ` / ${stage.title}` : ""}.`,
    businessType ? `Tipo de negócio identificado: ${businessType}.` : "Tipo de negócio ainda não identificado.",
    hasWebsite === "nao_informado" ? "Ainda não informou se tem site/landing." : hasWebsite === "sim" ? "Já indicou ter site/landing." : "Indicou não ter site/landing.",
    wantsWhatsAppLeads === "sim" ? "Mostrou interesse em captar clientes pelo WhatsApp." : "Ainda precisa confirmar interesse em captar clientes pelo WhatsApp.",
  ];

  return {
    summary: summaryParts.join(" "),
    suggestedReply,
    nextQuestion: missingQuestion,
    temperature,
    suggestedStageHint: shouldHandoff ? "Diagnóstico / Briefing recebido" : "Contato feito",
    shouldHandoff,
    handoffReason: shouldHandoff ? "Lead demonstrou perfil comercial e interesse suficiente para atendimento humano." : "Ainda faltam informações para qualificar o lead.",
    extracted: { businessType, hasWebsite, wantsWhatsAppLeads, urgency },
  };
}

export async function analyzeSdrWithGemini(input: {
  contact?: Contact;
  deal?: Deal;
  stage?: Stage;
  pipeline?: Pipeline;
  messages: Message[];
  agentInstructions?: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return analyzeSdrLocally(input);

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const local = analyzeSdrLocally(input);
  const transcript = input.messages
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "Lead" : "Atendente"}: ${message.body}`)
    .join("\n");

  const prompt = `${input.agentInstructions || defaultSdrAgentInstructions}

Tarefa: analise o lead e retorne SOMENTE JSON válido com as chaves: summary, suggestedReply, nextQuestion, temperature, suggestedStageHint, shouldHandoff, handoffReason, extracted.

Contexto:
Contato: ${input.contact?.name || "Lead"} - ${input.contact?.company || input.contact?.source || "sem empresa"}
Funil: ${input.pipeline?.name || "não definido"} / ${input.stage?.title || "sem etapa"}
Oportunidade: ${input.deal?.title || "sem oportunidade"}

Conversa:
${transcript || "Sem mensagens recentes."}

Formato obrigatório:
{
  "summary": "resumo curto",
  "suggestedReply": "resposta curta pronta para WhatsApp",
  "nextQuestion": "próxima pergunta objetiva",
  "temperature": "frio|morno|quente",
  "suggestedStageHint": "etapa sugerida",
  "shouldHandoff": false,
  "handoffReason": "motivo",
  "extracted": { "businessType": "", "hasWebsite": "sim|nao|nao_informado", "wantsWhatsAppLeads": "sim|nao|nao_informado", "urgency": "baixa|media|alta" }
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 900, responseMimeType: "application/json" },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response.ok || !text) return local;
    const parsed = JSON.parse(text);
    return { ...local, ...parsed, extracted: { ...local.extracted, ...(parsed.extracted || {}) } } as SdrAnalysis;
  } catch {
    return local;
  }
}


export async function testGeminiConnection(samplePrompt = "Responda apenas: Gemini conectado.") {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  if (!apiKey) {
    return { ok: false, configured: false, model, error: "GEMINI_API_KEY não configurada no deploy." };
  }

  try {
    const startedAt = Date.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: samplePrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join(" ").trim();
    return {
      ok: response.ok && Boolean(text),
      configured: true,
      model,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      text: text || null,
      error: response.ok ? null : payload?.error?.message || "Gemini não retornou resposta válida.",
    };
  } catch (error: any) {
    return { ok: false, configured: true, model, error: error?.message || "Falha ao chamar Gemini." };
  }
}
