import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ensureDefaultPipeline } from "@/lib/default-pipeline";
import { applyTenantFilter, getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin pode acessar diagnóstico técnico." }, { status: 403 });
  }

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

  const tenant = await getTenantContext();
  await ensureDefaultPipeline(supabase, tenant);

  const [contacts, deals, stages, activities, messages] = await Promise.all([
    applyTenantFilter(supabase.from("contacts").select("id,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1), tenant),
    applyTenantFilter(supabase.from("deals").select("id,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1), tenant),
    applyTenantFilter(supabase.from("pipeline_stages").select("id,position", { count: "exact" }).order("position", { ascending: true }).limit(1), tenant),
    applyTenantFilter(supabase.from("activities").select("id,due_at", { count: "exact" }).order("due_at", { ascending: false }).limit(1), tenant),
    applyTenantFilter(supabase.from("messages").select("id,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1), tenant),
  ]);

  return NextResponse.json({
    ok: true,
    tenant: { id: tenant.id, slug: tenant.slug },
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
  });
}
