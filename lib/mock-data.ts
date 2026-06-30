import type { Activity, Contact, Deal, Message, ServiceOrder, Stage } from "./types";

export const stages: Stage[] = [
  { id: "novo", title: "Novo lead", order: 1, color: "#3b82f6" },
  { id: "contato", title: "Contato feito", order: 2, color: "#06b6d4" },
  { id: "diagnostico", title: "Diagnóstico", order: 3, color: "#8b5cf6" },
  { id: "proposta", title: "Proposta enviada", order: 4, color: "#f59e0b" },
  { id: "negociacao", title: "Negociação", order: 5, color: "#ec4899" },
  { id: "fechado", title: "Fechado", order: 6, color: "#22c55e" },
];

export const contacts: Contact[] = [
  {
    id: "c1",
    name: "Carlos Ribeiro",
    phone: "5551999990001",
    company: "Academia Voltá",
    source: "Landing Page Academia",
    owner: "Miguel",
    temperature: "quente",
    tags: ["site", "orçamento"],
    lastMessageAt: "2026-06-25T13:40:00.000Z",
    notes: "Quer página com WhatsApp e antes/depois.",
  },
  {
    id: "c2",
    name: "Fernanda Lima",
    phone: "5551999990002",
    company: "JR Celular",
    source: "Instagram",
    owner: "Felipe",
    temperature: "morno",
    tags: ["manutenção", "loja local"],
    lastMessageAt: "2026-06-25T12:15:00.000Z",
    notes: "Pediu ajuste em imagem de compartilhamento.",
  },
  {
    id: "c3",
    name: "Roberto Oliveira",
    phone: "5551999990003",
    company: "Irmãos Oliveira",
    source: "Indicação",
    owner: "Miguel",
    temperature: "quente",
    tags: ["obras", "condomínio"],
    lastMessageAt: "2026-06-24T20:25:00.000Z",
  },
  {
    id: "c4",
    name: "Mariana Costa",
    phone: "5551999990004",
    company: "LC Design Móveis",
    source: "Google",
    owner: "Felipe",
    temperature: "frio",
    tags: ["marcenaria"],
    lastMessageAt: "2026-06-23T19:10:00.000Z",
  },
];

export const deals: Deal[] = [
  { id: "d1", contactId: "c1", title: "Landing Page Academia", value: 1200, stageId: "proposta", status: "aberto", expectedClose: "2026-06-28", createdAt: "2026-06-25T13:42:00.000Z" },
  { id: "d2", contactId: "c2", title: "Landing Page Assistência", value: 900, stageId: "diagnostico", status: "aberto", expectedClose: "2026-07-02", createdAt: "2026-06-25T12:19:00.000Z" },
  { id: "d3", contactId: "c3", title: "Landing Page Manutenções", value: 1500, stageId: "negociacao", status: "aberto", expectedClose: "2026-06-30", createdAt: "2026-06-24T20:30:00.000Z" },
  { id: "d4", contactId: "c4", title: "Página móveis planejados", value: 1100, stageId: "contato", status: "aberto", expectedClose: "2026-07-05", createdAt: "2026-06-23T19:15:00.000Z" },
];

export const messages: Message[] = [
  { id: "m1", contactId: "c1", direction: "inbound", body: "Oi, vi a página da academia. Quanto custa uma landing assim?", status: "read", createdAt: "2026-06-25T13:40:00.000Z" },
  { id: "m2", contactId: "c1", direction: "outbound", body: "Opa Carlos! Depende do nível de personalização, mas posso te mostrar um modelo e adaptar para tua academia.", status: "delivered", createdAt: "2026-06-25T13:43:00.000Z" },
  { id: "m3", contactId: "c2", direction: "inbound", body: "Preciso de uma página para loja de celular, com mapa e botão do WhatsApp.", status: "read", createdAt: "2026-06-25T12:15:00.000Z" },
  { id: "m4", contactId: "c3", direction: "inbound", body: "Consegue colocar reformas, impermeabilização e pintura no mesmo site?", status: "read", createdAt: "2026-06-24T20:25:00.000Z" },
];

export const activities: Activity[] = [
  { id: "a1", contactId: "c1", title: "Enviar proposta com 2 opções", dueAt: "2026-06-26T09:00:00.000Z", done: false },
  { id: "a2", contactId: "c3", title: "Pedir fotos reais dos serviços", dueAt: "2026-06-26T15:00:00.000Z", done: false },
  { id: "a3", contactId: "c2", title: "Validar logo em branco para hero", dueAt: "2026-06-25T18:00:00.000Z", done: true },
];


export const serviceOrders: ServiceOrder[] = [
  {
    id: "os1",
    contactId: "c2",
    dealId: "d2",
    code: "OS-0001",
    title: "Avaliação de atendimento para assistência",
    description: "Mapear fluxo de orçamento, entrada de aparelho e retorno ao cliente.",
    status: "diagnostico",
    priority: "morno",
    owner: "Felipe",
    estimatedValue: 900,
    finalValue: 0,
    dueAt: "2026-07-03T18:00:00.000Z",
    internalNotes: "Cliente quer rapidez no WhatsApp e histórico por atendimento.",
    createdAt: "2026-06-25T12:30:00.000Z",
    updatedAt: "2026-06-25T12:30:00.000Z",
  },
  {
    id: "os2",
    contactId: "c3",
    dealId: "d3",
    code: "OS-0002",
    title: "Página de manutenções prediais",
    description: "Organizar serviços, provas visuais e captação pelo WhatsApp.",
    status: "execucao",
    priority: "quente",
    owner: "Miguel",
    estimatedValue: 1500,
    finalValue: 0,
    dueAt: "2026-07-05T18:00:00.000Z",
    createdAt: "2026-06-26T09:00:00.000Z",
    updatedAt: "2026-06-26T09:00:00.000Z",
  },
];
