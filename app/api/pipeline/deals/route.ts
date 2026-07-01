import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { completeInitialContactActivities } from "@/lib/activities";
import { logCommercialActivity } from "@/lib/commercial-events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseMoney(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDate(value: unknown) {
  if (value === undefined) return undefined;
  const date = String(value ?? "").trim();
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}


export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const contactId = String(payload.contactId || payload.contact_id || "").trim();
  const stageId = String(payload.stageId || payload.stage_id || "").trim();
  const title = String(payload.title || "Nova oportunidade").trim() || "Nova oportunidade";

  if (!contactId || !stageId) {
    return NextResponse.json({ error: "contactId e stageId são obrigatórios." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      demo: true,
      deal: {
        id: `demo-deal-${Date.now()}`,
        contactId,
        pipelineId: String(payload.pipelineId || payload.pipeline_id || "") || undefined,
        stageId,
        title,
        value: parseMoney(payload.value) || 0,
        status: "aberto",
        expectedClose: String(payload.expectedClose || "") || undefined,
        createdAt: new Date().toISOString(),
      },
    });
  }

  const value = parseMoney(payload.value) || 0;
  const expectedClose = cleanDate(payload.expectedClose ?? payload.expected_close);

  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id,pipeline_id,title")
    .eq("id", stageId)
    .maybeSingle();

  if (stageError || !stage) {
    return NextResponse.json({ error: "Etapa inválida ou inexistente." }, { status: 400 });
  }

  const insert: Record<string, any> = {
    contact_id: contactId,
    stage_id: stageId,
    title,
    value,
    status: "aberto",
    source: "Funil",
    updated_at: new Date().toISOString(),
  };
  if (expectedClose) insert.expected_close = expectedClose;

  const { data: deal, error } = await supabase
    .from("deals")
    .insert(insert)
    .select("id,contact_id,stage_id,title,value,status,expected_close,lost_reason,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logCommercialActivity(supabase, { contactId, title: `Oportunidade criada: ${title}`, done: true });

  return NextResponse.json({
    ok: true,
    deal: {
      id: deal.id,
      contactId: deal.contact_id,
      pipelineId: stage.pipeline_id || undefined,
      stageId: deal.stage_id,
      title: deal.title,
      value: Number(deal.value || 0),
      status: deal.status || "aberto",
      expectedClose: deal.expected_close || undefined,
      lostReason: deal.lost_reason || undefined,
      createdAt: deal.created_at || new Date().toISOString(),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json();
  const { dealId, stageId, status, lostReason, title } = payload;

  if (!dealId) {
    return NextResponse.json({ error: "dealId é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let selectedStage: { id: string; pipeline_id?: string; title?: string } | null = null;

  if (stageId) {
    const { data: stage, error: stageError } = await supabase
      .from("pipeline_stages")
      .select("id,pipeline_id,title")
      .eq("id", stageId)
      .maybeSingle();

    if (stageError || !stage) {
      return NextResponse.json({ error: "Etapa inválida ou inexistente." }, { status: 400 });
    }

    selectedStage = stage;
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (stageId) update.stage_id = stageId;
  if (status) {
    update.status = status;
    if (status !== "perdido") update.lost_reason = null;
  }
  if (lostReason !== undefined) update.lost_reason = String(lostReason || "").trim() || null;
  if (title !== undefined) update.title = String(title || "Nova oportunidade").trim();

  const value = parseMoney(payload.value);
  if (value !== undefined) update.value = value;

  const expectedClose = cleanDate(payload.expectedClose ?? payload.expectedCloseDate ?? payload.expected_close);
  if (expectedClose !== undefined) update.expected_close = expectedClose;

  const { data: deal, error } = await supabase
    .from("deals")
    .update(update)
    .eq("id", dealId)
    .select("id,contact_id,title,value,status,stage_id,expected_close,lost_reason,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (deal?.contact_id) {
    if (stageId || status) {
      await completeInitialContactActivities(supabase, deal.contact_id);
    }

    let eventTitle = "Oportunidade atualizada";
    if (status === "perdido") eventTitle = lostReason ? `Oportunidade perdida: ${String(lostReason).slice(0, 80)}` : "Oportunidade marcada como perdida";
    else if (status === "ganho") eventTitle = "Oportunidade marcada como fechada";
    else if (stageId) {
      eventTitle = `Etapa alterada para ${selectedStage?.title || "nova etapa"}`;
    } else if (title !== undefined || value !== undefined || expectedClose !== undefined) {
      eventTitle = "Oportunidade editada";
    }

    await logCommercialActivity(supabase, { contactId: deal.contact_id, title: eventTitle, done: true });
  }

  return NextResponse.json({
    ok: true,
    deal: deal
      ? {
          id: deal.id,
          contactId: deal.contact_id,
          pipelineId: selectedStage?.pipeline_id || undefined,
          stageId: deal.stage_id,
          title: deal.title,
          value: Number(deal.value || 0),
          status: deal.status || "aberto",
          expectedClose: deal.expected_close || undefined,
          lostReason: deal.lost_reason || undefined,
          createdAt: deal.created_at || new Date().toISOString(),
        }
      : undefined,
  });
}
