import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanTitle(value: unknown) {
  return String(value || "Follow-up").trim().slice(0, 120) || "Follow-up";
}

function cleanDueAt(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return date.toISOString();
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const contactId = String(payload.contactId || "").trim();

  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const record = {
    contact_id: contactId,
    title: cleanTitle(payload.title),
    due_at: cleanDueAt(payload.dueAt),
    done: false,
  };

  const { data, error } = await supabase.from("activities").insert(record).select("id,contact_id,title,due_at,done").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activity: data });
}

export async function PATCH(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const activityId = String(payload.activityId || "").trim();

  if (!activityId) {
    return NextResponse.json({ error: "activityId é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.done !== undefined) update.done = Boolean(payload.done);
  if (payload.title !== undefined) update.title = cleanTitle(payload.title);
  if (payload.dueAt !== undefined) update.due_at = cleanDueAt(payload.dueAt);

  const { data, error } = await supabase
    .from("activities")
    .update(update)
    .eq("id", activityId)
    .select("id,contact_id,title,due_at,done")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activity: data });
}
