import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { applyTenantFilter, getTenantContext, withTenant } from "@/lib/tenant";
import { analyzeSdrLocally, analyzeSdrWithGemini, ensureDefaultAutomations } from "@/lib/automations";
import { sendWhatsAppText } from "@/lib/whatsapp";
import type { Contact, Deal, Message, Pipeline, Stage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mapContact(row: any): Contact {
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

function mapDeal(row: any): Deal {
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

function mapMessage(row: any): Message {
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

async function insertRun(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, tenant: any, record: Record<string, any>) {
  const full = withTenant(record, tenant);
  const { error } = await supabase.from("automation_runs").insert(full);
  return error;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const contactId = String(payload.contactId || "").trim();
  const requestedMode = String(payload.mode || "").trim();

  if (!contactId) return NextResponse.json({ error: "contactId é obrigatório." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const analysis = analyzeSdrLocally({ messages: [] });
    return NextResponse.json({ ok: true, demo: true, analysis });
  }

  const tenant = await getTenantContext(request.headers.get("host"));
  const automationId = await ensureDefaultAutomations(supabase, tenant);

  const automationResult = automationId
    ? await applyTenantFilter(supabase.from("automations").select("id,enabled,mode,type").eq("id", automationId).limit(1), tenant).maybeSingle()
    : { data: null, error: null } as any;

  const automation = automationResult.data;
  const mode = requestedMode === "auto" || requestedMode === "suggest" || requestedMode === "off" ? requestedMode : automation?.mode || "suggest";

  if (automation && (automation.enabled === false || mode === "off")) {
    await insertRun(supabase, tenant, {
      automation_id: automation.id,
      contact_id: contactId,
      status: "skipped",
      summary: "Automação SDR desligada.",
      input: { contactId, mode },
    });
    return NextResponse.json({ ok: true, skipped: true, reason: "Automação SDR desligada." });
  }

  const contactResult = await applyTenantFilter(
    supabase.from("contacts").select("id,name,phone,email,company,source,owner,temperature,tags,notes,last_message_at,created_at").eq("id", contactId).limit(1),
    tenant,
  ).maybeSingle();

  if (contactResult.error || !contactResult.data?.id) {
    return NextResponse.json({ error: contactResult.error?.message || "Contato não encontrado." }, { status: 404 });
  }

  const contact = mapContact(contactResult.data);
  const dealsResult = await applyTenantFilter(
    supabase.from("deals").select("id,contact_id,pipeline_id,stage_id,title,value,status,expected_close,lost_reason,created_at,updated_at").eq("contact_id", contact.id).eq("status", "aberto").order("updated_at", { ascending: false }).limit(1),
    tenant,
  ).maybeSingle();
  const deal = dealsResult.data ? mapDeal(dealsResult.data) : undefined;

  let stage: Stage | undefined;
  let pipeline: Pipeline | undefined;

  if (deal?.stageId) {
    const stageResult = await applyTenantFilter(supabase.from("pipeline_stages").select("id,pipeline_id,title,position,color").eq("id", deal.stageId).limit(1), tenant).maybeSingle();
    if (stageResult.data) {
      stage = { id: stageResult.data.id, pipelineId: stageResult.data.pipeline_id, title: stageResult.data.title, order: stageResult.data.position, color: stageResult.data.color || "#4f8cff" };
    }
  }

  const pipelineId = deal?.pipelineId || stage?.pipelineId;
  if (pipelineId) {
    const pipelineResult = await applyTenantFilter(supabase.from("pipelines").select("id,name,created_at").eq("id", pipelineId).limit(1), tenant).maybeSingle();
    if (pipelineResult.data) pipeline = { id: pipelineResult.data.id, name: pipelineResult.data.name, createdAt: pipelineResult.data.created_at || undefined };
  }

  const messagesResult = await applyTenantFilter(
    supabase.from("messages").select("id,contact_id,direction,body,status,type,provider_message_id,created_at").eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(14),
    tenant,
  );
  const messages = (messagesResult.data || []).map(mapMessage).reverse();

  const analysis = process.env.GEMINI_API_KEY ? await analyzeSdrWithGemini({ contact, deal, stage, pipeline, messages }) : analyzeSdrLocally({ contact, deal, stage, pipeline, messages });

  await supabase.from("contacts").update({ temperature: analysis.temperature, updated_at: new Date().toISOString() }).eq("id", contact.id);

  const historyTitle = analysis.shouldHandoff
    ? `IA SDR qualificou lead como ${analysis.temperature}. ${analysis.handoffReason}`
    : `IA SDR gerou sugestão. Próxima pergunta: ${analysis.nextQuestion}`;

  await supabase.from("activities").insert(withTenant({
    contact_id: contact.id,
    title: historyTitle,
    due_at: new Date().toISOString(),
    done: true,
    updated_at: new Date().toISOString(),
  }, tenant));

  let sent = false;
  const canAutoSend = mode === "auto" && process.env.NEXTLEAD_ENABLE_AUTO_SDR === "true" && contact.phone;
  if (canAutoSend) {
    try {
      await sendWhatsAppText({ to: contact.phone, body: analysis.suggestedReply });
      sent = true;
    } catch (error: any) {
      await insertRun(supabase, tenant, {
        automation_id: automation?.id || automationId,
        contact_id: contact.id,
        deal_id: deal?.id || null,
        status: "error",
        summary: "Falha ao enviar resposta automática do SDR.",
        input: { contactId, mode },
        output: analysis,
        error: error.message,
      });
      return NextResponse.json({ ok: false, error: error.message, analysis }, { status: 500 });
    }
  }

  await insertRun(supabase, tenant, {
    automation_id: automation?.id || automationId,
    contact_id: contact.id,
    deal_id: deal?.id || null,
    status: "success",
    summary: sent ? "IA SDR respondeu automaticamente." : "IA SDR gerou sugestão de atendimento.",
    input: { contactId, mode },
    output: analysis,
  });

  if (automation?.id) await supabase.from("automations").update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", automation.id);

  return NextResponse.json({ ok: true, mode, sent, analysis });
}
