import { unstable_noStore as noStore } from "next/cache";
import { getSupabaseAdmin } from "./supabase-admin";
import { ensureDefaultPipeline } from "./default-pipeline";
import { activities as mockActivities, contacts as mockContacts, deals as mockDeals, messages as mockMessages, stages as mockStages } from "./mock-data";
import type { Activity, Contact, Deal, Message, Stage } from "./types";

export type CrmData = {
  contacts: Contact[];
  deals: Deal[];
  stages: Stage[];
  messages: Message[];
  activities: Activity[];
  isDemo: boolean;
  error?: string;
};

const emptyData: CrmData = {
  contacts: [],
  deals: [],
  stages: mockStages,
  messages: [],
  activities: [],
  isDemo: false,
};

function fallbackData(error?: string): CrmData {
  return {
    contacts: mockContacts,
    deals: mockDeals,
    stages: mockStages,
    messages: mockMessages,
    activities: mockActivities,
    isDemo: true,
    error,
  };
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return [];
}

export async function getCrmData(): Promise<CrmData> {
  noStore();

  const supabase = getSupabaseAdmin();
  if (!supabase) return fallbackData("Variáveis do Supabase ausentes na Vercel.");

  await ensureDefaultPipeline(supabase);

  const stagesPromise = supabase.from("pipeline_stages").select("id,title,position,color").order("position", { ascending: true });
  const dealsPromise = supabase.from("deals").select("id,contact_id,stage_id,title,value,status,expected_close,lost_reason,created_at").order("created_at", { ascending: false }).limit(200);
  const messagesPromise = supabase.from("messages").select("id,contact_id,direction,body,status,provider_message_id,created_at").order("created_at", { ascending: true }).limit(500);
  const activitiesPromise = supabase.from("activities").select("id,contact_id,title,due_at,done").order("due_at", { ascending: true }).limit(200);

  // Tipamos como any porque fazemos fallback de select com/sem a coluna owner.
  // O Supabase infere tipos diferentes para cada select, e o build da Vercel
  // não permite reatribuir uma resposta com formato diferente.
  let contactsResult: any = await supabase
    .from("contacts")
    .select("id,name,phone,email,company,source,owner,temperature,tags,notes,last_message_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  // Compatível com bancos criados antes da coluna contacts.owner.
  let hasOwnerColumn = true;
  if (contactsResult.error?.message.toLowerCase().includes("owner")) {
    hasOwnerColumn = false;
    contactsResult = await supabase
      .from("contacts")
      .select("id,name,phone,email,company,source,temperature,tags,notes,last_message_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
  }

  const [stagesResult, dealsResult, messagesResult, activitiesResult] = await Promise.all([
    stagesPromise,
    dealsPromise,
    messagesPromise,
    activitiesPromise,
  ]);

  const errors = [
    stagesResult.error?.message,
    contactsResult.error?.message,
    dealsResult.error?.message,
    messagesResult.error?.message,
    activitiesResult.error?.message,
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

  return {
    ...emptyData,
    stages: stages.length ? stages : mockStages,
    contacts,
    deals,
    messages,
    activities,
    isDemo: false,
  };
}
