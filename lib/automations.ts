import { getSupabaseAdmin } from "./supabase-admin";
import { applyTenantFilter, getTenantContext, withTenant, type TenantContext } from "./tenant";
import type { Contact, Deal, LeadTemperature, Message, Pipeline, Stage } from "./types";

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
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return analyzeSdrLocally(input);

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const local = analyzeSdrLocally(input);
  const transcript = input.messages
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "Lead" : "Atendente"}: ${message.body}`)
    .join("\n");

  const prompt = `Você é o Agente SDR da Next Lead. Qualifique leads para landing page, CRM e automações de WhatsApp.\n\nRegras:\n- Não prometa preço, prazo fechado ou garantia de clientes.\n- Faça uma pergunta por vez.\n- Descubra tipo de negócio, se já tem site/landing e se quer mais clientes pelo WhatsApp.\n- Se estiver quente, entregue para atendimento humano.\n- Responda em português brasileiro, curto e natural.\n\nContexto:\nContato: ${input.contact?.name || "sem nome"}\nEmpresa: ${input.contact?.company || "não informada"}\nFunil/etapa: ${input.pipeline?.name || "sem funil"} / ${input.stage?.title || "sem etapa"}\nTranscrição:\n${transcript || "sem mensagens"}\n\nResponda apenas JSON válido com: summary, suggestedReply, nextQuestion, temperature (frio|morno|quente), suggestedStageHint, shouldHandoff, handoffReason, extracted { businessType, hasWebsite, wantsWhatsAppLeads, urgency }.\nSugestão local de apoio: ${JSON.stringify(local)}`;

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
