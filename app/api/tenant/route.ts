import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanUrl(value: unknown, fallback: string) {
  const url = String(value || "").trim();
  if (!url) return fallback;
  if (url.startsWith("/") || /^https?:\/\//i.test(url)) return url;
  return fallback;
}

export async function GET(request: NextRequest) {
  const tenant = await getTenantContext(request.headers.get("host"));
  return NextResponse.json({ ok: true, tenant });
}

export async function PATCH(request: NextRequest) {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin pode alterar a marca." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const tenant = await getTenantContext(request.headers.get("host"));
  if (!tenant.tenantTableReady) {
    return NextResponse.json({ error: "Tabela tenants ainda não existe. Rode a migration v6." }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const update = {
    name: String(payload.name || tenant.name).trim().slice(0, 80),
    app_name: String(payload.appName || payload.app_name || tenant.appName).trim().slice(0, 80),
    tagline: String(payload.tagline || tenant.tagline).trim().slice(0, 120),
    logo_url: cleanUrl(payload.logoUrl || payload.logo_url, tenant.logoUrl),
    mark_url: cleanUrl(payload.markUrl || payload.mark_url, tenant.markUrl),
    primary_color: cleanColor(payload.primaryColor || payload.primary_color, tenant.primaryColor),
    secondary_color: cleanColor(payload.secondaryColor || payload.secondary_color, tenant.secondaryColor),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("tenants")
    .update(update)
    .eq("id", tenant.id)
    .select("id,slug,name,app_name,tagline,logo_url,mark_url,primary_color,secondary_color,custom_domain,plan,active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tenant: data });
}
