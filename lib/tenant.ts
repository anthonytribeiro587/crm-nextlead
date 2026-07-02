import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabase-admin";

export const DEFAULT_TENANT_ID = process.env.NEXTLEAD_DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";
export const DEFAULT_TENANT_SLUG = process.env.NEXTLEAD_DEFAULT_TENANT_SLUG || "nextlead";

export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  appName: string;
  tagline: string;
  logoUrl: string;
  markUrl: string;
  primaryColor: string;
  secondaryColor: string;
  customDomain?: string;
  plan?: string;
  isDefault: boolean;
  tenantTableReady: boolean;
};

export const fallbackTenant: TenantContext = {
  id: DEFAULT_TENANT_ID,
  slug: DEFAULT_TENANT_SLUG,
  name: "NextLead",
  appName: "NextLead CRM",
  tagline: "Páginas que convertem",
  logoUrl: "/nextlead-logo.png",
  markUrl: "/nextlead-mark.png",
  primaryColor: "#2f6bff",
  secondaryColor: "#00d8ff",
  plan: "agency",
  isDefault: true,
  tenantTableReady: false,
};

function normalizeHost(host?: string | null) {
  return String(host || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(":")[0];
}

export function getTenantSlugFromHost(host?: string | null) {
  const normalized = normalizeHost(host);
  const forced = process.env.NEXTLEAD_TENANT_SLUG || process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (forced) return forced;

  const rootDomain = normalizeHost(process.env.NEXTLEAD_ROOT_DOMAIN || "nextlead.com.br");
  if (normalized && rootDomain && normalized.endsWith(`.${rootDomain}`)) {
    const subdomain = normalized.replace(`.${rootDomain}`, "").split(".").at(0);
    if (subdomain && !["crm", "app", "www"].includes(subdomain)) return subdomain;
  }

  return DEFAULT_TENANT_SLUG;
}

function mapTenant(row: any, tableReady: boolean): TenantContext {
  if (!row) return { ...fallbackTenant, tenantTableReady: tableReady };
  return {
    id: row.id || DEFAULT_TENANT_ID,
    slug: row.slug || DEFAULT_TENANT_SLUG,
    name: row.name || "NextLead",
    appName: row.app_name || row.name || "NextLead CRM",
    tagline: row.tagline || "Páginas que convertem",
    logoUrl: row.logo_url || "/nextlead-logo.png",
    markUrl: row.mark_url || row.logo_url || "/nextlead-mark.png",
    primaryColor: row.primary_color || "#2f6bff",
    secondaryColor: row.secondary_color || "#00d8ff",
    customDomain: row.custom_domain || undefined,
    plan: row.plan || undefined,
    isDefault: row.id === DEFAULT_TENANT_ID || row.slug === DEFAULT_TENANT_SLUG,
    tenantTableReady: tableReady,
  };
}

export async function getTenantContext(hostOverride?: string | null): Promise<TenantContext> {
  const supabase = getSupabaseAdmin();
  const host = hostOverride ?? headers().get("host");
  const slug = getTenantSlugFromHost(host);

  if (!supabase) return fallbackTenant;

  const { data, error } = await supabase
    .from("tenants")
    .select("id,slug,name,app_name,tagline,logo_url,mark_url,primary_color,secondary_color,custom_domain,plan,active")
    .or(`slug.eq.${slug},custom_domain.eq.${normalizeHost(host)}`)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) return fallbackTenant;
  return mapTenant(data, true);
}

export function withTenant<T extends Record<string, any>>(record: T, tenant: TenantContext): T & { tenant_id?: string } {
  if (!tenant.tenantTableReady) return record;
  return { ...record, tenant_id: tenant.id };
}

export function applyTenantFilter<T = any>(query: T, tenant: TenantContext): T {
  if (!tenant.tenantTableReady) return query;
  const anyQuery = query as any;
  if (typeof anyQuery?.eq !== "function") return query;
  return anyQuery.eq("tenant_id", tenant.id) as T;
}
