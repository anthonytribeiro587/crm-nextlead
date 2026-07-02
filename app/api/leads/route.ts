import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  brazilPhoneVariants,
  normalizeBrazilWhatsAppPhone,
} from "@/lib/format";
import { ensureDefaultPipeline } from "@/lib/default-pipeline";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-server";
import { upsertInitialContactActivity } from "@/lib/activities";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_SLUG,
  applyTenantFilter,
  getTenantContext,
  withTenant,
  type TenantContext,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedTemperatures = new Set(["frio", "morno", "quente"]);

function text(value: unknown, fallback = "") {
  const result = String(value ?? fallback).trim();
  return result || fallback;
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "0")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function cleanDate(value: unknown) {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function allowedOrigins() {
  return String(process.env.NEXTLEAD_ALLOWED_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(request: NextRequest) {
  const requestOrigin = request.headers.get("origin") || "*";
  const origins = allowedOrigins();
  if (origins.includes("*")) return "*";
  return origins.includes(requestOrigin) ? requestOrigin : origins[0] || "*";
}

function corsHeaders(request: NextRequest) {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(request),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-NextLead-Key, X-NextLead-Tenant, X-Tenant-Slug",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request: NextRequest, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init?.headers || {}),
    },
  });
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function hasValidLeadAccess(request: NextRequest) {
  const requiredKey = process.env.NEXTLEAD_LEADS_API_KEY?.trim();
  if (!requiredKey) return true;

  const headerKey =
    request.headers.get("x-nextlead-key")?.trim() || getBearerToken(request);
  if (headerKey && headerKey === requiredKey) return true;

  const session = verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  return Boolean(session);
}

async function resolveLeadTenant(
  request: NextRequest,
  payload: Record<string, any>,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<TenantContext> {
  const headerSlug =
    request.headers.get("x-nextlead-tenant") ||
    request.headers.get("x-tenant-slug");
  const bodySlug =
    payload.tenant_slug || payload.tenantSlug || payload.tenant || payload.slug;
  const bodyId = payload.tenant_id || payload.tenantId;
  const requested = text(bodyId || bodySlug || headerSlug || "").toLowerCase();

  // Compatibilidade: landing pages antigas não enviam tenant.
  // Nesse caso, cai no tenant do host e, se não resolver, no tenant padrão NextLead.
  if (!supabase) return getTenantContext(request.headers.get("host"));

  if (requested) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requested,
      );
    let query = supabase
      .from("tenants")
      .select(
        "id,slug,name,app_name,tagline,logo_url,mark_url,primary_color,secondary_color,custom_domain,plan,active",
      )
      .eq("active", true)
      .limit(1);

    query = isUuid ? query.eq("id", requested) : query.eq("slug", requested);
    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      return {
        id: data.id || DEFAULT_TENANT_ID,
        slug: data.slug || DEFAULT_TENANT_SLUG,
        name: data.name || "NextLead",
        appName: data.app_name || data.name || "NextLead CRM",
        tagline: data.tagline || "Páginas que convertem",
        logoUrl: data.logo_url || "/nextlead-logo.png",
        markUrl: data.mark_url || data.logo_url || "/nextlead-mark.png",
        primaryColor: data.primary_color || "#2f6bff",
        secondaryColor: data.secondary_color || "#00d8ff",
        customDomain: data.custom_domain || undefined,
        plan: data.plan || undefined,
        isDefault:
          data.id === DEFAULT_TENANT_ID || data.slug === DEFAULT_TENANT_SLUG,
        tenantTableReady: true,
      };
    }
  }

  const hostTenant = await getTenantContext(request.headers.get("host"));
  if (hostTenant.tenantTableReady) return hostTenant;

  const { data } = await supabase
    .from("tenants")
    .select(
      "id,slug,name,app_name,tagline,logo_url,mark_url,primary_color,secondary_color,custom_domain,plan,active",
    )
    .eq("id", DEFAULT_TENANT_ID)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  return data
    ? {
        id: data.id,
        slug: data.slug || DEFAULT_TENANT_SLUG,
        name: data.name || "NextLead",
        appName: data.app_name || data.name || "NextLead CRM",
        tagline: data.tagline || "Páginas que convertem",
        logoUrl: data.logo_url || "/nextlead-logo.png",
        markUrl: data.mark_url || data.logo_url || "/nextlead-mark.png",
        primaryColor: data.primary_color || "#2f6bff",
        secondaryColor: data.secondary_color || "#00d8ff",
        customDomain: data.custom_domain || undefined,
        plan: data.plan || undefined,
        isDefault: true,
        tenantTableReady: true,
      }
    : hostTenant;
}

async function getPipelineIdFromStage(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  stageId: string,
  tenant: TenantContext,
) {
  let query = supabase
    .from("pipeline_stages")
    .select("pipeline_id")
    .eq("id", stageId)
    .limit(1);
  if (tenant.tenantTableReady) query = query.eq("tenant_id", tenant.id);
  const { data } = await query.maybeSingle();
  return data?.pipeline_id || null;
}

function maybeMissingColumn(error: any, column: string) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes(column.toLowerCase()) &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

function maybeOnConflictIssue(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("on conflict") ||
    message.includes("unique or exclusion constraint") ||
    message.includes("constraint matching")
  );
}

function withoutTenant<T extends Record<string, any>>(record: T) {
  const copy = { ...record } as Record<string, any>;
  delete copy.tenant_id;
  return copy as T;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  if (!hasValidLeadAccess(request)) {
    return json(
      request,
      { error: "Chave de integração inválida." },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const name = text(payload.name);
  const phone = normalizeBrazilWhatsAppPhone(
    payload.phone ||
      payload.whatsapp ||
      payload.whatsApp ||
      payload.telefone ||
      payload.celular ||
      payload.mobile ||
      payload.number ||
      "",
  );
  const source = text(payload.source, "Landing Page");
  const interest = text(
    payload.interest ||
      payload.service ||
      payload.projectType ||
      payload.tipoProjeto ||
      payload.tipo_projeto ||
      payload.project ||
      payload.product,
    "Novo orçamento",
  );
  const company = text(
    payload.company ||
      payload.business ||
      payload.empresa ||
      payload.negocio ||
      payload.companyName ||
      "",
  );
  const email = text(payload.email || "");
  const owner = text(payload.owner || payload.responsible || "NextLead");
  const rawTemperature = text(payload.temperature, "morno").toLowerCase();
  const temperature = allowedTemperatures.has(rawTemperature)
    ? rawTemperature
    : "morno";
  const value = parseMoney(payload.value || payload.valor || 0);
  const tags = parseTags(payload.tags);
  const notes = text(
    payload.notes ||
      payload.message ||
      payload.observacao ||
      payload.observation ||
      payload.comments ||
      "",
  );
  const expectedClose = cleanDate(
    payload.expectedCloseDate ||
      payload.expectedClose ||
      payload.expected_close,
  );

  if (!name || !phone) {
    return json(
      request,
      { error: "Nome e telefone são obrigatórios." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return json(request, {
      ok: true,
      demo: true,
      message: "Lead recebido. Configure Supabase para salvar.",
    });
  }

  const tenant = await resolveLeadTenant(request, payload, supabase);
  const firstStageId = await ensureDefaultPipeline(supabase, tenant);
  const firstPipelineId = await getPipelineIdFromStage(
    supabase,
    firstStageId,
    tenant,
  );

  const contactPayload: Record<string, any> = withTenant(
    {
      name,
      phone,
      email: email || null,
      company: company || null,
      source,
      temperature,
      tags,
      notes: notes || null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    tenant,
  );

  const contactPayloadWithOwner = { ...contactPayload, owner };

  const variants = brazilPhoneVariants(phone);
  let possibleContactsResult = await applyTenantFilter(
    supabase
      .from("contacts")
      .select("id,phone")
      .in("phone", variants.length ? variants : [phone])
      .limit(10),
    tenant,
  );

  // Hotfix: em alguns deploys o cache do Supabase/PostgREST ainda não reconhece tenant_id
  // imediatamente depois da migration. Para não derrubar entrada de lead, consulta sem tenant
  // apenas como fallback. O banco mantém default tenant_id para registros novos.
  if (maybeMissingColumn(possibleContactsResult.error, "tenant_id")) {
    possibleContactsResult = await supabase
      .from("contacts")
      .select("id,phone")
      .in("phone", variants.length ? variants : [phone])
      .limit(10);
  }

  const possibleContacts = possibleContactsResult.data;
  const existingContact =
    possibleContacts?.find((item: any) => item.phone === phone) ||
    possibleContacts?.[0];

  let contactResult: any;

  if (existingContact?.id) {
    contactResult = await supabase
      .from("contacts")
      .update(contactPayloadWithOwner)
      .eq("id", existingContact.id)
      .select("id")
      .single();

    if (contactResult.error?.message.toLowerCase().includes("owner")) {
      contactResult = await supabase
        .from("contacts")
        .update(contactPayload)
        .eq("id", existingContact.id)
        .select("id")
        .single();
    }

    if (maybeMissingColumn(contactResult.error, "tenant_id")) {
      contactResult = await supabase
        .from("contacts")
        .update(withoutTenant(contactPayloadWithOwner))
        .eq("id", existingContact.id)
        .select("id")
        .single();
    }

    // Fallback se o telefone normalizado conflitar com algum contato duplicado antigo.
    if (
      contactResult.error?.message.toLowerCase().includes("duplicate") ||
      contactResult.error?.message.toLowerCase().includes("unique")
    ) {
      const safePayload = { ...contactPayload };
      delete (safePayload as any).phone;
      contactResult = await supabase
        .from("contacts")
        .update(safePayload)
        .eq("id", existingContact.id)
        .select("id")
        .single();
    }
  } else {
    contactResult = await supabase
      .from("contacts")
      .upsert(contactPayloadWithOwner, {
        onConflict: tenant.tenantTableReady ? "tenant_id,phone" : "phone",
      })
      .select("id")
      .single();

    if (contactResult.error?.message.toLowerCase().includes("owner")) {
      contactResult = await supabase
        .from("contacts")
        .upsert(contactPayload, {
          onConflict: tenant.tenantTableReady ? "tenant_id,phone" : "phone",
        })
        .select("id")
        .single();
    }

    if (
      maybeMissingColumn(contactResult.error, "tenant_id") ||
      maybeOnConflictIssue(contactResult.error)
    ) {
      const safeContactPayloadWithOwner = withoutTenant(
        contactPayloadWithOwner,
      );
      const safeContactPayload = withoutTenant(contactPayload);

      // Primeiro tenta atualizar por telefone para evitar duplicar lead antigo.
      const { data: legacyContact } = await supabase
        .from("contacts")
        .select("id")
        .in("phone", variants.length ? variants : [phone])
        .limit(1)
        .maybeSingle();

      if (legacyContact?.id) {
        contactResult = await supabase
          .from("contacts")
          .update(safeContactPayloadWithOwner)
          .eq("id", legacyContact.id)
          .select("id")
          .single();

        if (contactResult.error?.message.toLowerCase().includes("owner")) {
          contactResult = await supabase
            .from("contacts")
            .update(safeContactPayload)
            .eq("id", legacyContact.id)
            .select("id")
            .single();
        }
      } else {
        contactResult = await supabase
          .from("contacts")
          .insert(safeContactPayloadWithOwner)
          .select("id")
          .single();

        if (contactResult.error?.message.toLowerCase().includes("owner")) {
          contactResult = await supabase
            .from("contacts")
            .insert(safeContactPayload)
            .select("id")
            .single();
        }
      }
    }
  }

  const contact = contactResult.data;
  const contactError = contactResult.error;

  if (contactError || !contact) {
    return json(
      request,
      {
        error: contactError?.message || "Erro ao salvar contato.",
        step: "contact",
      },
      { status: 500 },
    );
  }

  let existingDealResult = await applyTenantFilter(
    supabase
      .from("deals")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("status", "aberto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    tenant,
  );

  if (maybeMissingColumn(existingDealResult.error, "tenant_id")) {
    existingDealResult = await supabase
      .from("deals")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("status", "aberto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const existingDeal = existingDealResult.data;

  let dealId = existingDeal?.id || null;

  const dealPayload = {
    title: interest,
    value,
    source,
    expected_close: expectedClose,
    status: "aberto",
    updated_at: new Date().toISOString(),
  };

  if (existingDeal) {
    // Não troca a etapa/funil de uma oportunidade já aberta.
    // Assim um lead que foi movido para Pós-venda, OS ou outro pipeline não volta
    // para o funil comercial só porque entrou novo formulário/mensagem.
    let { error: dealUpdateError } = await supabase
      .from("deals")
      .update(dealPayload)
      .eq("id", existingDeal.id);

    if (maybeMissingColumn(dealUpdateError, "tenant_id")) {
      ({ error: dealUpdateError } = await supabase
        .from("deals")
        .update(dealPayload)
        .eq("id", existingDeal.id));
    }

    if (dealUpdateError) {
      return json(
        request,
        {
          error: `Contato salvo, mas falhou ao atualizar oportunidade: ${dealUpdateError.message}`,
        },
        { status: 500 },
      );
    }
  } else {
    const fullDealPayload = withTenant(
      {
        ...dealPayload,
        contact_id: contact.id,
        stage_id: firstStageId,
        ...(firstPipelineId ? { pipeline_id: firstPipelineId } : {}),
      },
      tenant,
    );

    let dealResult = await supabase
      .from("deals")
      .insert(fullDealPayload)
      .select("id")
      .single();

    // Compatibilidade com bancos/cache que ainda não reconhecem pipeline_id ou tenant_id.
    if (
      maybeMissingColumn(dealResult.error, "pipeline_id") ||
      maybeMissingColumn(dealResult.error, "tenant_id")
    ) {
      const safeDealPayload = { ...fullDealPayload } as Record<string, any>;
      if (maybeMissingColumn(dealResult.error, "pipeline_id"))
        delete safeDealPayload.pipeline_id;
      if (maybeMissingColumn(dealResult.error, "tenant_id"))
        delete safeDealPayload.tenant_id;
      dealResult = await supabase
        .from("deals")
        .insert(safeDealPayload)
        .select("id")
        .single();
    }

    if (dealResult.error) {
      return json(
        request,
        {
          error: `Contato salvo, mas falhou ao criar oportunidade: ${dealResult.error.message}`,
        },
        { status: 500 },
      );
    }

    dealId = dealResult.data.id;
  }

  await upsertInitialContactActivity({
    supabase,
    contactId: contact.id,
    temperature,
    tenant,
  });

  return json(request, {
    ok: true,
    contactId: contact.id,
    dealId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  });
}
