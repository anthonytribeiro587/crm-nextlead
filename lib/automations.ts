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
  geminiUsage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export const defaultSdrAgentInstructions = `Você é um SDR humano da Next Lead, empresa que cria landing pages e soluções simples para captação de leads pelo WhatsApp.

Objetivo do agente:
- Qualificar o lead comercialmente antes de entregar para a equipe.
- Conduzir a conversa com perguntas simples, uma por vez.
- Descobrir: tipo de negócio, se já tem site/landing page, se quer receber mais orçamentos pelo WhatsApp e urgência.

Regras obrigatórias:
- Nunca diga que é IA, robô, modelo, automação ou assistente virtual.
- Apresente-se como atendimento da Next Lead somente quando fizer sentido.
- Seja curto, natural e comercial, como conversa real de WhatsApp.
- Use linguagem de leigo. Se falar em landing page, explique como “uma página simples para apresentar seu serviço e levar o cliente para o WhatsApp”.
- Sempre avance a qualificação. Não responda apenas “olá, tudo bem?” se ainda falta informação.
- Se o lead disser “não entendi”, “começar o quê?” ou “como assim?”, explique o passo em palavras simples e refaça a pergunta certa.
- Faça no máximo uma pergunta por mensagem.
- Não prometa preço fechado, prazo fechado, garantia de clientes ou resultado garantido.
- Não invente informações que o lead não passou.
- Se o lead pedir preço, diga que depende do nível de personalização e faça a próxima pergunta de qualificação.
- Quando o lead demonstrar interesse real, diga que vai encaminhar para alguém da equipe orientar.
- Use português brasileiro.
- Não use markdown pesado; no máximo quebras de linha curtas.

Fluxo obrigatório do SDR:
1. Saudação + contexto simples: explique que a Next Lead cria uma página simples para apresentar o serviço e levar o cliente ao WhatsApp.
2. Perguntar tipo de negócio. Não avance sem entender minimamente o negócio.
3. Perguntar presença atual: se já tem site/página ou se hoje usa Instagram/WhatsApp.
4. Perguntar objetivo: se a pessoa quer receber mais pedidos de orçamento/clientes pelo WhatsApp.
5. Perguntar momento: se quer ver uma sugestão/protótipo agora ou se está só pesquisando.
6. Entregar para vendedor: quando houver negócio + objetivo confirmado, diga que alguém da equipe vai preparar uma sugestão/protótipo.

Tratamento de respostas curtas:
- Se responder “WhatsApp”, “Instagram” ou “só WhatsApp”, entenda como canal atual, não como objetivo confirmado.
- Se responder “sim” após a pergunta de objetivo, confirme interesse e avance para urgência/protótipo.
- Se responder “não” após a pergunta de objetivo, não repita a pergunta; explique que tudo bem e pergunte se quer apenas entender melhor ou encerrar.
- Se responder “começar o quê?”, “não entendi” ou algo parecido, explique o que é o próximo passo antes de continuar.`;

export const defaultSdrAutomation: Automation = {
  id: "sdr-nextlead-default",
  name: "SDR NextLead",
  description: "Qualifica leads pelo WhatsApp: negócio, site/landing, intenção de captar clientes e entrega para atendimento humano quando estiver quente.",
  type: "sdr_nextlead",
  enabled: true,
  mode: "suggest",
  triggerType: "message_received",
  conditions: {
    onlyOpenDeals: false,
    avoidHumanTakeover: true,
    businessHoursOnly: false,
    cooldownMinutes: 0,
  },
  actions: {
    generateReply: true,
    classifyTemperature: true,
    suggestStage: true,
    logHistory: true,
    stateMachine: true,
    handoffToSeller: true,
    prototypeHandoff: true,
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
    ["assistência técnica", ["assistência", "assistencia", "celular", "telefone", "conserto", "manutenção", "manutencao"]],
    ["lavagem / estética automotiva", ["lavagem", "lavage", "lavação", "lavacao", "lava rápido", "lava rapido", "estética automotiva", "estetica automotiva", "carro", "carros", "automotivo"]],
    ["academia / studio", ["academia", "cross", "gym", "personal", "aluno", "treino"]],
    ["serviços locais", ["eletric", "instala", "pintura", "reforma", "obra", "manutenção", "manutencao"]],
    ["loja / comércio", ["loja", "venda", "produto", "revenda", "cliente na loja", "shopee", "tenis", "tênis", "ecommerce", "e-commerce"]],
    ["clínica / atendimento", ["clínica", "clinica", "consulta", "dent", "estética", "estetica", "saúde", "saude"]],
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
  const lower = normalizeBasic(text);
  if (hasAny(lower, ["nao quero whatsapp", "nao quero zap", "so catalogo", "so catalogo", "nao preciso de cliente", "nao quero mais cliente"])) return "nao";

  // Não trate a palavra “WhatsApp” sozinha como desejo de captar leads.
  // Em respostas como “uso WhatsApp”, geralmente o lead só está dizendo o canal atual.
  const intentWords = ["quero", "preciso", "gostaria", "objetivo", "mais", "captar", "receber", "gerar", "orcamento", "orcamentos", "cliente", "clientes", "lead", "leads", "pedido", "pedidos", "chamar"];
  const channelWords = ["whatsapp", "whats", "zap", "mensagem", "direct"];
  if (hasAny(lower, intentWords) && (hasAny(lower, channelWords) || hasAny(lower, ["orcamento", "orcamentos", "cliente", "clientes", "lead", "leads"]))) return "sim";
  if (hasAny(lower, ["sim quero", "sim preciso", "quero sim", "isso mesmo", "exatamente", "pode ser", "fechado"])) return "sim";
  return "nao_informado";
}


type SdrPhase = "ask_business" | "ask_presence" | "ask_goal" | "ask_urgency" | "handoff" | "paused";

type SdrState = {
  id?: string;
  tenantId?: string;
  contactId: string;
  dealId?: string;
  phase: SdrPhase;
  businessType?: string;
  hasWebsite?: "sim" | "nao" | "nao_informado";
  currentChannels?: string[];
  wantsWhatsAppLeads?: "sim" | "nao" | "nao_informado";
  urgency?: "baixa" | "media" | "alta" | "nao_informado";
  handoffReady?: boolean;
  handoffAt?: string;
  lastInboundText?: string;
  updatedAt?: string;
};

function normalizeBasic(text: string) {
  return compactText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isAffirmative(text: string) {
  const t = normalizeBasic(text);
  return ["sim", "s", "isso", "tenho", "tenho sim", "quero", "exato", "exatamente", "pode", "claro", "com certeza", "tenho isso"].some((item) => t === item || t.includes(item));
}

function isNegative(text: string) {
  const t = normalizeBasic(text);
  return ["nao", "nao tenho", "sem", "ainda nao", "so instagram", "so whatsapp", "somente instagram", "somente whatsapp"].some((item) => t === item || t.includes(item));
}

function inferChannels(text: string) {
  const t = normalizeBasic(text);
  const channels = new Set<string>();
  if (hasAny(t, ["instagram", "insta"])) channels.add("Instagram");
  if (hasAny(t, ["whatsapp", "whats", "zap"])) channels.add("WhatsApp");
  if (hasAny(t, ["google", "pesquisa"])) channels.add("Google");
  if (hasAny(t, ["indicacao", "indicação"])) channels.add("Indicação");
  if (hasAny(t, ["facebook", "face"])) channels.add("Facebook");
  return Array.from(channels);
}

function inferUrgency(text: string): "baixa" | "media" | "alta" | "nao_informado" {
  const t = normalizeBasic(text);
  if (hasAny(t, ["urgente", "agora", "hoje", "essa semana", "quanto antes", "logo", "rapido", "rápido", "pra ontem"])) return "alta";
  if (hasAny(t, ["sem pressa", "futuramente", "mais pra frente", "so pesquisando", "só pesquisando", "nao tenho pressa"])) return "baixa";
  if (hasAny(t, ["mes", "mês", "semana que vem", "proximo", "próximo"])) return "media";
  return "nao_informado";
}

function isConfusionMessage(text: string) {
  const t = normalizeBasic(text);
  return hasAny(t, [
    "nao entendi",
    "n entendi",
    "nao entendi direito",
    "como assim",
    "comecar oq",
    "comecar o que",
    "começar oq",
    "começar o que",
    "que seria",
    "o que e isso",
    "o que é isso",
    "landing page o que e",
    "landing page o que é",
    "nao sei o que e",
    "nao sei o que é",
  ]);
}

function educationalReplyForPhase(phase: SdrPhase, first: string, state: Partial<SdrState>) {
  if (phase === "ask_business") {
    return `Claro, ${first}. A Next Lead ajuda negócios a receberem mais contatos pelo WhatsApp através de uma página simples de divulgação. Qual é o tipo do seu negócio?`;
  }
  if (phase === "ask_presence") {
    return `Claro. Landing page é uma página simples que apresenta seu serviço e leva o cliente direto para o WhatsApp. Hoje você já tem alguma página ou atende só por Instagram/WhatsApp?`;
  }
  if (phase === "ask_goal") {
    return `A ideia é facilitar para mais pessoas pedirem orçamento pelo seu WhatsApp, sem depender só de indicação ou post no Instagram. Esse é o objetivo para o seu negócio?`;
  }
  if (phase === "ask_urgency") {
    return `Começar seria a equipe montar uma sugestão/protótipo da página para você avaliar antes de fechar qualquer coisa. Você quer ver essa sugestão agora ou está só pesquisando por enquanto?`;
  }
  return `Sem problema, ${first}. Vou simplificar: a gente entende seu negócio e prepara uma sugestão de página para atrair contatos pelo WhatsApp. Quer que eu encaminhe para alguém da equipe te orientar?`;
}

function isLikelyBusinessAnswer(text: string) {
  const t = normalizeBasic(text);
  if (!t || isGreetingOnly(t)) return false;
  if (["sim", "nao", "isso", "tenho isso", "whatsapp", "zap", "instagram", "insta", "google", "site", "landing"].includes(t)) return false;
  return t.length >= 4 && /[a-z]/.test(t);
}

function inferBusinessFromAnswer(text: string, contact?: Contact) {
  const inferred = inferBusinessType(text, contact);
  if (inferred) return inferred;
  const cleaned = compactText(text);
  if (isLikelyBusinessAnswer(cleaned)) return cleaned.slice(0, 80);
  return undefined;
}

function lastOutboundQuestion(messages: Message[]) {
  return normalizeBasic(messages.filter((message) => message.direction === "outbound").at(-1)?.body || "");
}
function lastInboundCreatedAt(messages: Message[]) {
  return messages.filter((message) => message.direction === "inbound").at(-1)?.createdAt || "";
}

function isShortYes(text: string) {
  return isAffirmative(text) && normalizeBasic(text).length <= 18;
}

function isShortNo(text: string) {
  return isNegative(text) && normalizeBasic(text).length <= 18;
}


function mapSdrStateRow(row: any): SdrState {
  return {
    id: row.id,
    tenantId: row.tenant_id || undefined,
    contactId: row.contact_id,
    dealId: row.deal_id || undefined,
    phase: row.phase || "ask_business",
    businessType: row.business_type || undefined,
    hasWebsite: row.has_website || "nao_informado",
    currentChannels: Array.isArray(row.current_channels) ? row.current_channels : [],
    wantsWhatsAppLeads: row.wants_whatsapp_leads || "nao_informado",
    urgency: row.urgency || "nao_informado",
    handoffReady: Boolean(row.handoff_ready),
    handoffAt: row.handoff_at || undefined,
    lastInboundText: row.last_inbound_text || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

async function loadSdrState(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contactId: string,
): Promise<{ state?: SdrState; tableReady: boolean; error?: string }> {
  const result = await applyTenantFilter(
    supabase
      .from("sdr_states")
      .select("id,tenant_id,contact_id,deal_id,phase,business_type,has_website,current_channels,wants_whatsapp_leads,urgency,handoff_ready,handoff_at,last_inbound_text,updated_at")
      .eq("contact_id", contactId)
      .limit(1),
    tenant,
  ).maybeSingle();

  if (result.error) {
    const message = result.error.message || "";
    if (message.includes("sdr_states") || message.includes("schema cache") || message.includes("does not exist")) {
      return { tableReady: false, error: message };
    }
    return { tableReady: true, error: message };
  }

  return { tableReady: true, state: result.data ? mapSdrStateRow(result.data) : undefined };
}

async function saveSdrState(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  state: SdrState,
) {
  const payload = withTenant({
    contact_id: state.contactId,
    deal_id: state.dealId || null,
    phase: state.phase,
    business_type: state.businessType || null,
    has_website: state.hasWebsite || "nao_informado",
    current_channels: state.currentChannels || [],
    wants_whatsapp_leads: state.wantsWhatsAppLeads || "nao_informado",
    urgency: state.urgency || "nao_informado",
    handoff_ready: Boolean(state.handoffReady),
    handoff_at: state.handoffAt || null,
    last_inbound_text: state.lastInboundText || null,
    updated_at: new Date().toISOString(),
  }, tenant);

  if (state.id) {
    const updated = await supabase.from("sdr_states").update(payload).eq("id", state.id).select("id").single();
    if (!updated.error) return { ok: true, id: updated.data?.id };
  }

  // Evita depender de constraint: busca por contato e atualiza, senão insere.
  const existing = await applyTenantFilter(
    supabase.from("sdr_states").select("id").eq("contact_id", state.contactId).limit(1),
    tenant,
  ).maybeSingle();
  if (existing.data?.id) {
    const updated = await supabase.from("sdr_states").update(payload).eq("id", existing.data.id).select("id").single();
    return { ok: !updated.error, id: updated.data?.id, error: updated.error?.message };
  }

  const inserted = await supabase.from("sdr_states").insert({ ...payload, created_at: new Date().toISOString() }).select("id").single();
  return { ok: !inserted.error, id: inserted.data?.id, error: inserted.error?.message };
}

function computeSdrStateMachine(input: {
  contact?: Contact;
  deal?: Deal;
  stage?: Stage;
  pipeline?: Pipeline;
  messages: Message[];
  previousState?: SdrState;
}): { state: SdrState; analysis: SdrAnalysis; shouldPauseAfterHandoff: boolean } {
  const { contact, deal, stage, pipeline, messages, previousState } = input;
  const inbound = messages.filter((message) => message.direction === "inbound");
  const lastInbound = compactText(inbound.at(-1)?.body || "");
  const allInboundText = compactText(inbound.map((message) => message.body).join("\n"));
  const allText = compactText(messages.map((message) => `${message.direction}: ${message.body}`).join("\n"));
  const lastQuestion = lastOutboundQuestion(messages);
  const first = compactText(contact?.name).split(" ")[0] || "tudo bem";

  const state: SdrState = {
    contactId: contact?.id || previousState?.contactId || "",
    dealId: deal?.id || previousState?.dealId,
    phase: previousState?.phase || "ask_business",
    businessType: previousState?.businessType,
    hasWebsite: previousState?.hasWebsite || "nao_informado",
    currentChannels: previousState?.currentChannels || [],
    wantsWhatsAppLeads: previousState?.wantsWhatsAppLeads || "nao_informado",
    urgency: previousState?.urgency || "nao_informado",
    handoffReady: previousState?.handoffReady || false,
    handoffAt: previousState?.handoffAt,
    lastInboundText: lastInbound,
    id: previousState?.id,
  };

  const inferredBusiness = inferBusinessType(allInboundText, contact) || inferBusinessFromAnswer(lastInbound, contact);
  if (!state.businessType && inferredBusiness) state.businessType = inferredBusiness;

  const channels = new Set([...(state.currentChannels || []), ...inferChannels(allInboundText)]);
  state.currentChannels = Array.from(channels);

  const websiteFromAll = inferHasWebsite(allInboundText);
  const websiteQuestionWasAsked = hasAny(lastQuestion, ["site", "landing", "pagina", "página", "instagram/whatsapp"]);
  const normalizedLast = normalizeBasic(lastInbound);
  const previousPhase = previousState?.phase || state.phase;

  // Respostas curtas precisam ser interpretadas pela fase anterior, não pelo histórico inteiro.
  // Isso evita o SDR voltar etapa ou repetir pergunta quando o lead responde “sim”, “não” ou “WhatsApp”.
  if (previousPhase === "ask_presence") {
    if (hasAny(normalizedLast, ["site", "landing", "pagina", "página", "tenho isso", "tenho sim"]) || (isShortYes(lastInbound) && hasAny(lastQuestion, ["site", "página", "pagina", "landing"]))) {
      state.hasWebsite = "sim";
    } else if (isShortNo(lastInbound) || hasAny(normalizedLast, ["instagram", "insta", "whatsapp", "zap", "so whatsapp", "só whatsapp", "uso whatsapp", "uso o whatsapp"])) {
      state.hasWebsite = "nao";
    }
  }

  if (state.hasWebsite === "nao_informado" && websiteFromAll !== "nao_informado") state.hasWebsite = websiteFromAll;
  if (state.hasWebsite === "nao_informado" && websiteQuestionWasAsked) {
    if (isAffirmative(lastInbound) && hasAny(normalizedLast, ["tenho", "isso", "site", "landing"])) state.hasWebsite = "sim";
    if (isNegative(lastInbound) || hasAny(normalizedLast, ["instagram", "insta", "whatsapp", "zap"])) state.hasWebsite = "nao";
  }

  const wantsFromAll = inferWantsWhatsappLeads(allInboundText);
  const goalQuestionWasAsked = hasAny(lastQuestion, ["orcamento direto no whatsapp", "orçamento direto no whatsapp", "pedidos de orçamento", "pedidos de orcamento", "captar", "mais contatos", "mais clientes", "esse e seu objetivo", "esse é seu objetivo"]);
  if (previousPhase === "ask_goal" || previousPhase === "paused") {
    if (isShortYes(lastInbound) || hasAny(normalizedLast, ["quero", "isso", "exatamente", "sim", "orcamento", "orçamento", "cliente", "lead", "mais contatos"])) state.wantsWhatsAppLeads = "sim";
    else if (isShortNo(lastInbound)) state.wantsWhatsAppLeads = "nao";
  }

  if (state.wantsWhatsAppLeads === "nao_informado" && wantsFromAll !== "nao_informado") state.wantsWhatsAppLeads = wantsFromAll;
  if (state.wantsWhatsAppLeads === "nao_informado" && goalQuestionWasAsked) {
    if (isAffirmative(lastInbound) || hasAny(normalizedLast, ["orcamento", "orçamento", "cliente", "lead", "mais contatos"])) state.wantsWhatsAppLeads = "sim";
    if (isNegative(lastInbound)) state.wantsWhatsAppLeads = "nao";
  }

  const urgencyFromAll = inferUrgency(allInboundText);
  const urgencyQuestionWasAsked = hasAny(lastQuestion, ["urgencia", "urgência", "pesquisando", "quando", "comecar", "começar"]);
  if (state.urgency === "nao_informado" && urgencyFromAll !== "nao_informado") state.urgency = urgencyFromAll;
  if (state.urgency === "nao_informado" && urgencyQuestionWasAsked) {
    if (hasAny(normalizedLast, ["agora", "rapido", "urgente", "essa semana", "quanto antes", "logo"])) state.urgency = "alta";
    else if (hasAny(normalizedLast, ["pesquisando", "sem pressa", "futuro", "mais pra frente"])) state.urgency = "baixa";
    else if (lastInbound) state.urgency = "media";
  }

  let phase: SdrPhase = "ask_business";
  let nextQuestion = "qual é o tipo do seu negócio?";
  let suggestedReply = `Oi, ${first}! Aqui é da Next Lead. A gente cria uma página simples para apresentar seu serviço e levar clientes direto para o WhatsApp. Pra eu te orientar melhor: qual é o tipo do seu negócio?`;
  let shouldHandoff = false;
  let handoffReason = "Ainda faltam informações para qualificar o lead.";
  const confused = isConfusionMessage(lastInbound);

  if (state.handoffReady || state.phase === "handoff") {
    phase = "handoff";
    shouldHandoff = true;
    handoffReason = "Lead já foi entregue para atendimento humano.";
    suggestedReply = `Perfeito, ${first}. Já encaminhei seu atendimento para a equipe da Next Lead te orientar por aqui.`;
    nextQuestion = "aguardar atendimento humano";
  } else if (!state.businessType) {
    phase = "ask_business";
  } else if (state.hasWebsite === "nao_informado") {
    phase = "ask_presence";
    nextQuestion = "hoje você já tem uma página/site, ou atende mais pelo Instagram e WhatsApp?";
    suggestedReply = `Legal, ${first}. Pra eu entender seu momento: hoje você já tem uma página/site, ou atende mais pelo Instagram e WhatsApp?`;
  } else if (state.wantsWhatsAppLeads === "nao_informado") {
    phase = "ask_goal";
    nextQuestion = "seu objetivo é receber mais pedidos de orçamento direto no WhatsApp?";
    suggestedReply = state.hasWebsite === "sim"
      ? `Entendi. A ideia seria usar essa página para gerar mais pedidos de orçamento no WhatsApp. Esse é seu objetivo?`
      : `Entendi. Então a ideia seria criar uma página simples para apresentar seu serviço e trazer mais pedidos de orçamento no WhatsApp. Esse é seu objetivo?`;
  } else if (state.wantsWhatsAppLeads === "sim" && state.urgency === "nao_informado") {
    phase = "ask_urgency";
    nextQuestion = "você quer ver uma sugestão/protótipo agora ou está só pesquisando por enquanto?";
    suggestedReply = `Boa. O próximo passo seria alguém da Next Lead montar uma sugestão/protótipo para você visualizar. Você quer ver isso agora ou está só pesquisando por enquanto?`;
  } else if (state.wantsWhatsAppLeads === "sim") {
    phase = "handoff";
    shouldHandoff = true;
    state.handoffReady = true;
    state.handoffAt = state.handoffAt || new Date().toISOString();
    nextQuestion = "vendedor deve enviar protótipo/sugestão";
    handoffReason = "Lead informou negócio e interesse em captar orçamentos pelo WhatsApp.";
    suggestedReply = `Perfeito, ${first}. Pelo que você me falou, faz sentido a gente te mostrar uma ideia/protótipo da página. Vou encaminhar para alguém da Next Lead te orientar e preparar uma sugestão para o seu negócio.`;
  } else {
    phase = "paused";
    nextQuestion = "lead sem objetivo de captação confirmado";
    suggestedReply = `Sem problema, ${first}. Então não vou insistir. Se quiser, posso só te explicar rapidamente como funciona uma página da Next Lead para captar contatos pelo WhatsApp.`;
    handoffReason = "Lead não confirmou interesse em captar orçamentos pelo WhatsApp.";
  }

  if (confused && !state.handoffReady) {
    const explainPhase = state.phase === "handoff" ? phase : (previousState?.phase || phase);
    phase = explainPhase === "paused" ? "ask_goal" : explainPhase;
    suggestedReply = educationalReplyForPhase(phase, first, state);
    nextQuestion = suggestedReply.includes("?") ? suggestedReply.slice(suggestedReply.lastIndexOf(".") + 1).trim() || nextQuestion : nextQuestion;
    shouldHandoff = false;
    handoffReason = "Lead pediu explicação; SDR deve simplificar antes de avançar.";
  }

  state.phase = phase;
  const temperature: LeadTemperature = shouldHandoff
    ? "quente"
    : state.wantsWhatsAppLeads === "sim"
      ? "morno"
      : state.businessType
        ? "morno"
        : "frio";

  const summaryParts = [
    `${contact?.name || "Lead"} está em ${pipeline?.name || "funil não definido"}${stage?.title ? ` / ${stage.title}` : ""}.`,
    state.businessType ? `Negócio: ${state.businessType}.` : "Negócio ainda não identificado.",
    state.hasWebsite === "nao_informado" ? "Site/landing ainda não informado." : state.hasWebsite === "sim" ? "Já indicou ter site/landing." : "Ainda não tem site/landing clara.",
    state.wantsWhatsAppLeads === "sim" ? "Quer captar pelo WhatsApp." : state.wantsWhatsAppLeads === "nao" ? "Não confirmou interesse em WhatsApp." : "Interesse em WhatsApp ainda não confirmado.",
    `Fase SDR: ${phase}.`,
  ];

  return {
    state,
    shouldPauseAfterHandoff: phase === "handoff",
    analysis: {
      summary: summaryParts.join(" "),
      suggestedReply: forceOneQuestion(suggestedReply),
      nextQuestion,
      temperature,
      suggestedStageHint: shouldHandoff ? "Briefing recebido / Diagnóstico" : phase === "ask_presence" ? "Contato feito" : "Novo lead",
      shouldHandoff,
      handoffReason,
      extracted: {
        businessType: state.businessType,
        hasWebsite: state.hasWebsite || "nao_informado",
        wantsWhatsAppLeads: state.wantsWhatsAppLeads || "nao_informado",
        urgency: state.urgency === "nao_informado" ? "media" : state.urgency,
      },
    },
  };
}

async function polishSdrReplyWithGemini(input: { analysis: SdrAnalysis; state: SdrState; contact?: Contact }) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return input.analysis;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = `Reescreva a mensagem abaixo como WhatsApp comercial da Next Lead, sem mudar o objetivo nem a pergunta.

Regras:
- Nunca diga que é IA.
- Não invente preço, prazo ou garantia.
- Mantenha uma pergunta só.
- Máximo 3 linhas.
- Use linguagem simples para leigos.
- Se falar em landing page, explique como página simples para apresentar o serviço e levar ao WhatsApp.
- Se a fase for handoff, deixe claro que alguém da equipe vai orientar e preparar uma sugestão/protótipo.

Fase: ${input.state.phase}
Mensagem base: ${input.analysis.suggestedReply}

Responda somente a mensagem final.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 180 },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join(" ").trim();
    if (!response.ok || !text) return input.analysis;
    return {
      ...input.analysis,
      suggestedReply: forceOneQuestion(text),
      geminiUsage: {
        promptTokenCount: payload?.usageMetadata?.promptTokenCount,
        candidatesTokenCount: payload?.usageMetadata?.candidatesTokenCount,
        totalTokenCount: payload?.usageMetadata?.totalTokenCount,
      },
    } as SdrAnalysis;
  } catch {
    return input.analysis;
  }
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
  const clean = (value: Record<string, any>) =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

  const full = clean(withTenant(record, tenant));
  const first = await supabase.from("automation_runs").insert(full).select("id").single();
  if (!first.error) return { id: first.data?.id, error: null };

  console.error("NextLead automation_runs insert failed", first.error.message);

  // Fallback 1: alguns bancos podem estar com migration parcial e sem input/output jsonb.
  const minimal = clean(withTenant({
    automation_id: record.automation_id || null,
    contact_id: record.contact_id || null,
    deal_id: record.deal_id || null,
    status: record.status || "success",
    summary: record.summary || null,
    error: record.error || first.error.message || null,
    created_at: new Date().toISOString(),
  }, tenant));

  const second = await supabase.from("automation_runs").insert(minimal).select("id").single();
  if (!second.error) return { id: second.data?.id, error: null };

  console.error("NextLead automation_runs minimal insert failed", second.error.message);

  // Fallback 2: último recurso para pelo menos aparecer no diagnóstico.
  const bare = clean({
    status: record.status || "error",
    summary: record.summary || "Execução SDR registrada com fallback.",
    error: record.error || second.error.message || first.error.message || null,
    created_at: new Date().toISOString(),
  });
  const third = await supabase.from("automation_runs").insert(bare).select("id").single();
  if (!third.error) return { id: third.data?.id, error: null };

  console.error("NextLead automation_runs bare insert failed", third.error.message);
  return { id: null, error: third.error };
}

function isAutoSdrGloballyEnabled() {
  return String(process.env.NEXTLEAD_ENABLE_AUTO_SDR || "").toLowerCase() === "true";
}

function isSdrVerboseDiagnosticsEnabled() {
  return String(process.env.NEXTLEAD_SDR_VERBOSE_LOGS || "").toLowerCase() === "true";
}

function isGreetingOnly(text: string) {
  const normalized = compactText(text).toLowerCase().replace(/[!?.]/g, "");
  return ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "e ai", "e aí", "tudo bem", "td bem"].includes(normalized) || normalized.length <= 4;
}

function forceOneQuestion(reply: string) {
  const cleaned = String(reply || "").trim().replace(/\n{3,}/g, "\n\n");
  const firstQuestion = cleaned.indexOf("?");
  if (firstQuestion < 0) return cleaned;
  return cleaned.slice(0, firstQuestion + 1).trim();
}

function buildSdrHardGuardrails() {
  return `

Regras finais que prevalecem sobre qualquer instrução anterior:
- A resposta precisa estar relacionada à Next Lead, landing pages, captação de leads, WhatsApp ou qualificação comercial.
- Se a última mensagem for apenas cumprimento, NÃO responda só cumprimento; pergunte o tipo de negócio.
- Faça somente uma pergunta por mensagem.
- Não diga que é IA.
- Não invente preço, prazo ou garantia.`;
}

function refineSdrAnalysis(input: {
  analysis: SdrAnalysis;
  contact?: Contact;
  messages: Message[];
}) {
  const analysis = { ...input.analysis, extracted: { ...(input.analysis.extracted || {}) } } as SdrAnalysis;
  const first = compactText(input.contact?.name).split(" ")[0] || "tudo bem";
  const inbound = input.messages.filter((message) => message.direction === "inbound");
  const lastInbound = compactText(inbound.at(-1)?.body || "");
  const businessType = analysis.extracted.businessType;
  const hasWebsite = analysis.extracted.hasWebsite || "nao_informado";
  const wantsWhatsAppLeads = analysis.extracted.wantsWhatsAppLeads || "nao_informado";

  let nextQuestion = analysis.nextQuestion || "qual é o tipo do seu negócio?";
  let suggestedReply = analysis.suggestedReply || "";

  if (!businessType) {
    nextQuestion = "qual é o tipo do seu negócio?";
    suggestedReply = `Oi, ${first}! Aqui é da Next Lead. A gente cria uma página simples para apresentar seu serviço e levar clientes direto para o WhatsApp. Pra eu te orientar melhor: qual é o tipo do seu negócio?`;
    analysis.temperature = analysis.temperature === "quente" ? "morno" : analysis.temperature || "frio";
    analysis.shouldHandoff = false;
    analysis.handoffReason = "Ainda falta identificar o tipo de negócio do lead.";
  } else if (hasWebsite === "nao_informado") {
    nextQuestion = "hoje você já tem uma página/site, ou atende mais pelo Instagram e WhatsApp?";
    suggestedReply = `Legal, ${first}. Pra eu entender seu momento: hoje você já tem uma página/site, ou atende mais pelo Instagram e WhatsApp?`;
    analysis.shouldHandoff = false;
  } else if (wantsWhatsAppLeads === "nao_informado") {
    nextQuestion = "seu objetivo é receber mais pedidos de orçamento direto no WhatsApp?";
    suggestedReply = `Entendi. A ideia da página é facilitar para mais pessoas pedirem orçamento no WhatsApp. Esse é seu objetivo?`;
    analysis.shouldHandoff = false;
  } else if (analysis.shouldHandoff) {
    suggestedReply = `Perfeito, ${first}. Pelo que você me falou, faz sentido a equipe da Next Lead avaliar o melhor caminho para captar mais contatos pelo WhatsApp. Vou encaminhar para alguém te orientar.`;
  }

  analysis.nextQuestion = nextQuestion;
  analysis.suggestedReply = forceOneQuestion(suggestedReply);
  return analysis;
}

async function hasRecentHumanTakeover(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tenant: TenantContext,
  contactId: string,
) {
  const minutes = Number(process.env.NEXTLEAD_HUMAN_TAKEOVER_MINUTES || 30);
  if (!minutes || minutes < 1) return false;
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const result = await applyTenantFilter(
    supabase
      .from("messages")
      .select("id,raw_payload,created_at")
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5),
    tenant,
  );
  const rows = result.data || [];
  return rows.some((message: any) => {
    const source = String(message?.raw_payload?.source || message?.raw_payload?.nextlead_source || "").toLowerCase();
    return source === "manual_crm" || source === "human";
  });
}

function shouldSkipBecauseRecentRun(runs: any[], mode: AutomationMode, latestInboundText?: string, inboundMessageId?: string) {
  if (mode !== "auto") return false;
  const cooldownSeconds = Number(process.env.NEXTLEAD_AUTO_SDR_COOLDOWN_SECONDS || 8);
  const cooldownMs = Math.max(3, cooldownSeconds) * 1000;
  const now = Date.now();
  const latest = compactText(latestInboundText || "").toLowerCase();
  const inboundId = compactText(inboundMessageId || "");

  return (runs || []).some((run) => {
    const previousInboundId = compactText(run.input?.inboundMessageId || run.output?.inboundMessageId || "");
    if (inboundId && previousInboundId && inboundId === previousInboundId) return true;

    const created = new Date(run.created_at || 0).getTime();
    if (!created || Number.isNaN(created)) return false;
    if (now - created >= cooldownMs || String(run.status || "") !== "success") return false;

    const previousInbound = compactText(run.output?.lastInboundText || run.input?.lastInboundText || "").toLowerCase();
    // Se for exatamente a mesma mensagem chegando duplicada pela Evolution, ignora.
    if (latest && previousInbound && latest === previousInbound) return true;

    // Para runs antigos sem latestInboundText, mantém uma trava curtíssima para evitar resposta dupla.
    return !previousInbound && now - created < 2500;
  });
}

export type RunSdrAutomationInput = {
  contactId: string;
  tenant?: TenantContext;
  requestedMode?: AutomationMode;
  source?: "manual" | "webhook";
  inboundMessageId?: string;
  latestInboundText?: string;
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

  let contactResult = await applyTenantFilter(
    supabase.from("contacts").select("id,tenant_id,name,phone,email,company,source,temperature,tags,notes,last_message_at,created_at").eq("id", input.contactId).limit(1),
    tenant,
  ).maybeSingle();

  // Compatibilidade SaaS: alguns contatos antigos foram criados antes de tenant_id.
  // Se o webhook salvou a mensagem, mas o SDR não acha o contato pelo filtro do tenant,
  // tentamos recuperar pelo id sem filtro e vinculamos ao tenant atual quando estiver vazio.
  if ((contactResult.error || !contactResult.data?.id) && tenant.tenantTableReady) {
    const fallbackContact = await supabase
      .from("contacts")
      .select("id,tenant_id,name,phone,email,company,source,temperature,tags,notes,last_message_at,created_at")
      .eq("id", input.contactId)
      .limit(1)
      .maybeSingle();

    if (fallbackContact.data?.id && !fallbackContact.data.tenant_id) {
      await supabase.from("contacts").update({ tenant_id: tenant.id, updated_at: new Date().toISOString() }).eq("id", fallbackContact.data.id);
      fallbackContact.data.tenant_id = tenant.id;
    }

    if (fallbackContact.data?.id && (!fallbackContact.data.tenant_id || fallbackContact.data.tenant_id === tenant.id)) {
      contactResult = fallbackContact as any;
    }
  }

  if (contactResult.error || !contactResult.data?.id) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      status: "error",
      summary: "SDR não encontrou o contato no tenant atual.",
      input: { contactId: input.contactId, mode, source: input.source || "manual" },
      error: contactResult.error?.message || "Contato não encontrado.",
    });
    return { ok: false, status: 404, error: contactResult.error?.message || "Contato não encontrado.", reason: "contact_not_found_for_tenant" };
  }

  const contact = mapContactRow(contactResult.data);

  if (input.source === "webhook" && isSdrVerboseDiagnosticsEnabled()) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      status: "started",
      summary: "Webhook recebido; SDR iniciou análise do contato.",
      input: { contactId: contact.id, mode, source: input.source || "manual" },
    });
  }

  if (input.source === "webhook" && automation?.conditions?.avoidHumanTakeover !== false && await hasRecentHumanTakeover(supabase, tenant, contact.id)) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      status: "skipped",
      summary: "SDR pausado porque um atendente humano assumiu a conversa recentemente.",
      input: { contactId: contact.id, mode, source: input.source || "manual" },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Atendimento humano recente." };
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
  const latestInboundText = compactText(input.latestInboundText || messages.filter((message) => message.direction === "inbound").at(-1)?.body || "");

  const recentRuns = await applyTenantFilter(
    supabase
      .from("automation_runs")
      .select("id,status,summary,input,output,created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(5),
    tenant,
  );

  if (shouldSkipBecauseRecentRun(recentRuns.data || [], mode, latestInboundText, input.inboundMessageId)) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      status: "skipped",
      summary: "SDR automático ignorado por evento duplicado/cooldown curto.",
      input: { contactId: contact.id, mode, source: input.source || "manual", lastInboundText: latestInboundText, inboundMessageId: input.inboundMessageId },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Cooldown anti-duplicidade curto." };
  }

  const stateLoad = await loadSdrState(supabase, tenant, contact.id);

  if (input.source === "webhook" && stateLoad.state?.lastInboundText && compactText(stateLoad.state.lastInboundText).toLowerCase() === latestInboundText.toLowerCase()) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      deal_id: deal?.id || null,
      status: "skipped",
      summary: "SDR ignorou evento duplicado da mesma última mensagem recebida.",
      input: { contactId: contact.id, mode, source: input.source || "manual", lastInboundText: latestInboundText, inboundMessageId: input.inboundMessageId },
      output: { state: stateLoad.state },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Evento duplicado da última mensagem recebida." };
  }

  const stateMachine = computeSdrStateMachine({ contact, deal, stage, pipeline, messages, previousState: stateLoad.state });
  let analysis = await polishSdrReplyWithGemini({ analysis: stateMachine.analysis, state: stateMachine.state, contact });

  if (input.source === "webhook" && stateLoad.state?.phase === "handoff") {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      deal_id: deal?.id || null,
      status: "skipped",
      summary: "SDR pausado: lead já foi entregue para vendedor enviar protótipo/sugestão.",
      input: { contactId: contact.id, mode, source: input.source || "manual", lastInboundText: latestInboundText },
      output: { state: stateLoad.state },
    });
    return { ok: true, skipped: true, mode, sent: false, reason: "Lead já entregue para atendimento humano." };
  }

  if (stateLoad.tableReady) {
    const savedState = await saveSdrState(supabase, tenant, stateMachine.state);
    if (!savedState.ok) {
      await insertAutomationRun(supabase, tenant, {
        automation_id: automation?.id || automationId,
        contact_id: contact.id,
        deal_id: deal?.id || null,
        status: "error",
        summary: "SDR executou, mas não conseguiu salvar o estado da conversa.",
        input: { contactId: contact.id, mode, source: input.source || "manual", lastInboundText: latestInboundText },
        output: { state: stateMachine.state, analysis },
        error: savedState.error || "Erro desconhecido ao salvar sdr_states.",
      });
    }
  }

  if (mode === "auto" && !isAutoSdrGloballyEnabled()) {
    await insertAutomationRun(supabase, tenant, {
      automation_id: automation?.id || automationId,
      contact_id: contact.id,
      deal_id: deal?.id || null,
      status: "skipped",
      summary: "SDR em automático, mas NEXTLEAD_ENABLE_AUTO_SDR não está true no deploy.",
      input: { contactId: contact.id, mode, source: input.source || "manual" },
      output: { ...analysis, autoSendEnabled: false, latestInboundText },
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
            raw_payload: { ...(result.payload || {}), source: "auto_sdr" },
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
        output: { ...analysis, latestInboundText },
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
    input: { contactId: contact.id, mode, source: input.source || "manual", latestInboundText, inboundMessageId: input.inboundMessageId },
    output: { ...analysis, autoSendEnabled: isAutoSdrGloballyEnabled(), providerMessageId, latestInboundText, inboundMessageId: input.inboundMessageId },
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
  if (businessType) missingQuestion = "hoje você já tem uma página/site, ou atende mais pelo Instagram e WhatsApp?";
  if (businessType && hasWebsite !== "nao_informado") missingQuestion = "seu objetivo é receber mais pedidos de orçamento direto no WhatsApp?";
  if (businessType && hasWebsite !== "nao_informado" && wantsWhatsAppLeads !== "nao_informado") missingQuestion = "quer que eu encaminhe para uma avaliação com a equipe da Next Lead?";

  const qualified = Boolean(businessType && wantsWhatsAppLeads === "sim");
  const temperature: LeadTemperature = qualified && (hasWebsite === "nao" || urgency !== "baixa") ? "quente" : qualified ? "morno" : "frio";
  const shouldHandoff = temperature === "quente" || (qualified && inbound.length >= 2);
  const first = compactText(contact?.name).split(" ")[0] || "tudo bem";

  const suggestedReply = shouldHandoff
    ? `Perfeito, ${first}. Pelo que você me falou, faz sentido a equipe da Next Lead avaliar o melhor caminho para captar mais contatos pelo WhatsApp. Vou encaminhar para alguém te orientar.`
    : !businessType
      ? `Oi, ${first}! Aqui é da Next Lead. A gente cria uma página simples para apresentar seu serviço e levar clientes direto para o WhatsApp. Pra eu te orientar melhor: qual é o tipo do seu negócio?`
      : `Legal, ${first}. ${missingQuestion.charAt(0).toUpperCase()}${missingQuestion.slice(1)}`;

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

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const local = analyzeSdrLocally(input);
  const transcript = input.messages
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "Lead" : "Atendente"}: ${message.body}`)
    .join("\n");

  const prompt = `${input.agentInstructions || defaultSdrAgentInstructions}

Tarefa: analise o lead e retorne SOMENTE JSON válido com as chaves: summary, suggestedReply, nextQuestion, temperature, suggestedStageHint, shouldHandoff, handoffReason, extracted.

Importante para suggestedReply:
- Se a última mensagem for só cumprimento, responda com uma saudação curta e pergunte o tipo do negócio.
- Não responda só “Olá, tudo bem?”. A resposta precisa avançar a qualificação.
- Use no máximo uma pergunta.
- Use linguagem simples para leigos. Se citar landing page, explique como uma página simples que apresenta o serviço e leva para o WhatsApp.
- Não considere “uso WhatsApp” como interesse em captar leads; isso pode ser só o canal atual. Confirme o objetivo antes.
- Se o lead disser “não entendi” ou “começar o quê?”, explique o passo em palavras simples.
- Mantenha a resposta com 1 a 3 linhas de WhatsApp.

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
    const usage = payload?.usageMetadata || {};
    return {
      ...local,
      ...parsed,
      extracted: { ...local.extracted, ...(parsed.extracted || {}) },
      geminiUsage: {
        promptTokenCount: usage.promptTokenCount,
        candidatesTokenCount: usage.candidatesTokenCount,
        totalTokenCount: usage.totalTokenCount,
      },
    } as SdrAnalysis;
  } catch {
    return local;
  }
}


export async function testGeminiConnection(samplePrompt = "Responda apenas: Gemini conectado.") {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
