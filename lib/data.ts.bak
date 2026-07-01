import { unstable_noStore as noStore } from "next/cache";
import { getSupabaseAdmin } from "./supabase-admin";
import { ensureDefaultPipeline } from "./default-pipeline";
import {
  activities as mockActivities,
  contacts as mockContacts,
  deals as mockDeals,
  messages as mockMessages,
  serviceOrders as mockServiceOrders,
  stages as mockStages,
} from "./mock-data";
import type { Activity, Contact, Deal, Message, ServiceOrder, Stage } from "./types";

export type CrmData = {
  contacts: Contact[];
  deals: Deal[];
  stages: Stage[];
  messages: Message[];
  activities: Activity[];
  serviceOrders: ServiceOrder[];
  isDemo: boolean;
  error?: string;
  serviceOrdersReady?: boolean;
  serviceOrdersError?: string;
};

const emptyData: CrmData = {
  contacts: [],
  deals: [],
  stages: mockStages,
  messages: [],
  activities: [],
  serviceOrders: [],
  isDemo: false,
  serviceOrdersReady: true,
};

function fallbackData(error?: string): CrmData {
  return {
    contacts: mockContacts,
    deals: mockDeals,
    stages: mockStages,
    messages: mockMessages,
    activities: mockActivities,
    serviceOrders: mockServiceOrders,
    isDemo: true,
    error,
    serviceOrdersReady: true,
  };
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return [];
}

function mapServiceOrder(row: any): ServiceOrder {
  return {
    id: row.id,
    contactId: row.contact_id,
    dealId: row.deal_id || undefined,
    code: row.code || "OS",
    title: row.title || "Ordem de serviço",
    description: row.description || undefined,
    status: row.status || "aberta",
    priority: row.priority || "morno",
    owner: row.owner || "NextLead",
    estimatedValue: Number(row.estimated_value || 0),
    finalValue: Number(row.final_value || 0),
    dueAt: row.due_at || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    internalNotes: row.internal_notes || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

export async function getCrmData(): Promise<CrmData> {
  noStore();

  const supabase = getSupabaseAdmin();
  if (!supabase) return fallbackData("Variáveis do Supabase ausentes na Vercel.");

  await ensureDefaultPipeline(supabase);

  const stagesPromise = supabase.from("pipeline_stages").select("id,title,position,color").order("position", { ascending: true });
  const dealsPromise = supabase.from("deals").select("id,contact_id,stage_id,title,value,status,expected_close,lost_reason,created_at").order("created_at", { ascending: false }).limit(200);
  const messagesPromise = supabase.from("messages").select("id,contact_id,direction,body,status,provider_message_id,created_at").order("created_at", { ascending: true }).limit(500);
  const activitiesPromise = supabase.from("activities").select("id,contact_id,title,due_at,done").order("due_at", { ascending: true }).limit(300);
  const serviceOrdersPromise = supabase
    .from("service_orders")
    .select("id,contact_id,deal_id,code,title,description,status,priority,owner,estimated_value,final_value,due_at,started_at,completed_at,internal_notes,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(300);

  // Tipamos como any porque fazemos fallback de select com/sem a coluna owner.
  let contactsResult: any = await supabase
    .from("contacts")
    .select("id,name,phone,email,company,source,owner,temperature,tags,notes,last_message_at,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  let hasOwnerColumn = true;
  if (contactsResult.error?.message.toLowerCase().includes("owner")) {
    hasOwnerColumn = false;
    contactsResult = await supabase
      .from("contacts")
      .select("id,name,phone,email,company,source,temperature,tags,notes,last_message_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
  }

  const [stagesResult, dealsResult, messagesResult, activitiesResult, serviceOrdersResult] = await Promise.all([
    stagesPromise,
    dealsPromise,
    messagesPromise,
    activitiesPromise,
    serviceOrdersPromise,
  ]);

  const serviceOrdersMissing = Boolean(
    serviceOrdersResult.error?.message?.toLowerCase().includes("service_orders") ||
      serviceOrdersResult.error?.message?.toLowerCase().includes("does not exist") ||
      serviceOrdersResult.error?.code === "42P01",
  );

  const errors = [
    stagesResult.error?.message,
    contactsResult.error?.message,
    dealsResult.error?.message,
    messagesResult.error?.message,
    activitiesResult.error?.message,
    serviceOrdersMissing ? undefined : serviceOrdersResult.error?.message,
  ].filter(Boolean);

  if (errors.length) {
    console.error("Erro ao buscar dados do Supabase", errors);
    return fallbackData(errors.join(" | "));
  }

  const stages: Stage[] = (stagesResult.data || []).map((stage: any) => ({
    id: stage.id,
    title: stage.title,
    order: stage.position,
    color: stage.color || "#4f8cff",
  }));

  const contacts: Contact[] = (contactsResult.data || []).map((contact: any) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email || undefined,
    company: contact.company || undefined,
    source: contact.source || "Manual",
    owner: hasOwnerColumn ? contact.owner || "NextLead" : "NextLead",
    temperature: contact.temperature || "morno",
    tags: normalizeTags(contact.tags),
    lastMessageAt: contact.last_message_at || contact.created_at || new Date().toISOString(),
    notes: contact.notes || undefined,
  }));

  const deals: Deal[] = (dealsResult.data || []).map((deal: any) => ({
    id: deal.id,
    contactId: deal.contact_id,
    title: deal.title,
    value: Number(deal.value || 0),
    stageId: deal.stage_id || stages[0]?.id || "",
    status: deal.status || "aberto",
    expectedClose: deal.expected_close || undefined,
    lostReason: deal.lost_reason || undefined,
    createdAt: deal.created_at || new Date().toISOString(),
  }));

  const messages: Message[] = (messagesResult.data || []).map((message: any) => ({
    id: message.id,
    contactId: message.contact_id,
    direction: message.direction,
    body: message.body,
    status: message.status || "queued",
    providerMessageId: message.provider_message_id || undefined,
    createdAt: message.created_at || new Date().toISOString(),
  }));

  const activities: Activity[] = (activitiesResult.data || []).map((activity: any) => ({
    id: activity.id,
    contactId: activity.contact_id,
    title: activity.title,
    dueAt: activity.due_at || new Date().toISOString(),
    done: Boolean(activity.done),
  }));

  const serviceOrders: ServiceOrder[] = serviceOrdersMissing ? [] : (serviceOrdersResult.data || []).map(mapServiceOrder);

  return {
    ...emptyData,
    stages: stages.length ? stages : mockStages,
    contacts,
    deals,
    messages,
    activities,
    serviceOrders,
    serviceOrdersReady: !serviceOrdersMissing,
    serviceOrdersError: serviceOrdersMissing ? "Tabela service_orders ainda não existe. Rode scripts/migration-v3-service-orders.sql no Supabase." : undefined,
    isDemo: false,
  };
}
