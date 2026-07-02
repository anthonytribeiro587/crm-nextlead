import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { applyTenantFilter, getTenantContext, withTenant } from "@/lib/tenant";
import { defaultSdrAgentInstructions, defaultSdrAutomation, ensureDefaultAutomations, getAutomationsData } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function boolFromForm(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function cleanMode(value: unknown) {
  const mode = String(value || "suggest").trim();
  return mode === "off" || mode === "auto" || mode === "suggest" ? mode : "suggest";
}

function missingColumn(error: any, tableOrColumn: string) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(tableOrColumn.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

export async function GET() {
  const data = await getAutomationsData();
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  const payload: Record<string, any> = {};

  if (isForm) {
    const form = await request.formData();
    payload.automationId = form.get("automationId");
    payload.type = form.get("type");
    payload.mode = form.get("mode");
    payload.enabled = boolFromForm(form.get("enabled"));
    payload.agentInstructions = form.get("agentInstructions");
  } else {
    Object.assign(payload, await request.json().catch(() => ({})));
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return isForm ? NextResponse.redirect(new URL("/automacoes", request.url), 303) : NextResponse.json({ ok: true, demo: true });
  }

  const tenant = await getTenantContext(request.headers.get("host"));
  const mode = cleanMode(payload.mode);
  const enabled = payload.enabled !== false && payload.enabled !== "false";
  const agentInstructions = String(payload.agentInstructions || "").trim() || defaultSdrAgentInstructions;
  let automationId = String(payload.automationId || "").trim();

  try {
    if (!automationId || automationId === defaultSdrAutomation.id) {
      automationId = (await ensureDefaultAutomations(supabase, tenant)) || automationId;
    }

    const update = {
      enabled,
      mode,
      actions: { ...defaultSdrAutomation.actions, agentInstructions },
      updated_at: new Date().toISOString(),
    };

    let result = await applyTenantFilter(supabase.from("automations").update(update).eq("id", automationId), tenant).select("id,name,mode,enabled").maybeSingle();

    if (!result.data?.id && payload.type === "sdr_nextlead") {
      const record = withTenant({
        name: defaultSdrAutomation.name,
        description: defaultSdrAutomation.description,
        type: defaultSdrAutomation.type,
        enabled,
        mode,
        trigger_type: defaultSdrAutomation.triggerType,
        conditions: defaultSdrAutomation.conditions,
        actions: { ...defaultSdrAutomation.actions, agentInstructions },
      }, tenant);
      result = await supabase.from("automations").insert(record).select("id,name,mode,enabled").single();
    }

    if (result.error) {
      if (missingColumn(result.error, "automations")) {
        return isForm
          ? NextResponse.redirect(new URL("/automacoes?setup=missing", request.url), 303)
          : NextResponse.json({ error: "Tabela automations não existe. Rode a migration v7." }, { status: 409 });
      }
      throw result.error;
    }

    return isForm ? NextResponse.redirect(new URL("/automacoes?saved=1", request.url), 303) : NextResponse.json({ ok: true, automation: result.data });
  } catch (error: any) {
    if (isForm) return NextResponse.redirect(new URL(`/automacoes?error=${encodeURIComponent(error.message || "erro")}`, request.url), 303);
    return NextResponse.json({ error: error.message || "Erro ao salvar automação." }, { status: 500 });
  }
}
