import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ensureDefaultPipeline } from "@/lib/default-pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({
      ok: false,
      message: "Supabase não configurado na Vercel.",
      env: {
        hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
    });
  }

  await ensureDefaultPipeline(supabase);

  const [contacts, deals, stages, activities, messages] = await Promise.all([
    supabase.from("contacts").select("id,name,phone,source,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
    supabase.from("deals").select("id,title,contact_id,stage_id,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
    supabase.from("pipeline_stages").select("id,title,position", { count: "exact" }).order("position", { ascending: true }),
    supabase.from("activities").select("id,title,contact_id,due_at", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
    supabase.from("messages").select("id,contact_id,direction,body,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
  ]);

  return NextResponse.json({
    ok: true,
    env: {
      hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      urlHost: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    },
    counts: {
      contacts: contacts.count,
      deals: deals.count,
      stages: stages.count,
      activities: activities.count,
      messages: messages.count,
    },
    errors: {
      contacts: contacts.error?.message || null,
      deals: deals.error?.message || null,
      stages: stages.error?.message || null,
      activities: activities.error?.message || null,
      messages: messages.error?.message || null,
    },
    samples: {
      contacts: contacts.data || [],
      deals: deals.data || [],
      stages: stages.data || [],
      activities: activities.data || [],
      messages: messages.data || [],
    },
  });
}
