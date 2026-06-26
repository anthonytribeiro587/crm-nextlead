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
    .select("id,contact_id,title,value,status,stage_id")
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
      const { data: stage } = await supabase.from("pipeline_stages").select("title").eq("id", stageId).maybeSingle();
      eventTitle = `Etapa alterada para ${stage?.title || "nova etapa"}`;
    } else if (title !== undefined || value !== undefined || expectedClose !== undefined) {
      eventTitle = "Oportunidade editada";
    }

    await logCommercialActivity(supabase, { contactId: deal.contact_id, title: eventTitle, done: true });
  }

  return NextResponse.json({ ok: true });
}
