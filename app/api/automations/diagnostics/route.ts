import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { applyTenantFilter, getTenantContext } from "@/lib/tenant";
import { getAutomationsData, testGeminiConnection } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mask(value?: string) {
  if (!value) return null;
  if (value.length <= 10) return "configurado";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function GET() {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin pode acessar diagnóstico de automações." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const tenant = await getTenantContext();
  const data = await getAutomationsData();
  const sdr = data.automations.find((automation) => automation.type === "sdr_nextlead") || null;
  let recentWebhooks: any[] = [];

  if (supabase) {
    const result = await applyTenantFilter(
      supabase.from("webhook_events").select("id,provider,payload,created_at").order("created_at", { ascending: false }).limit(5),
      tenant,
    );
    const parseFromMe = (value: unknown) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      if (typeof value === "string") return ["true", "1", "yes", "sim"].includes(value.trim().toLowerCase());
      return false;
    };
    const normalizeJid = (value: unknown) => String(value || "").replace(/@.+$/, "").replace(/\D/g, "");
    const previewPayload = (payload: any) => {
      const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data || payload;
      const key = data?.key || data?.data?.key || {};
      const msg = data?.message || data?.data?.message || {};
      const body = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || (msg?.audioMessage ? "[áudio]" : "");
      const phone = normalizeJid(key?.remoteJid || data?.remoteJid || data?.sender || data?.from || data?.number);
      return {
        phone: phone ? `${phone.slice(0, 4)}...${phone.slice(-4)}` : null,
        fromMe: parseFromMe(key?.fromMe) || parseFromMe(data?.fromMe),
        hasText: Boolean(body),
        textPreview: body ? String(body).slice(0, 80) : null,
        messageType: data?.messageType || data?.type || Object.keys(msg || {})[0] || null,
      };
    };
    recentWebhooks = (result.data || []).map((event: any) => ({
      id: event.id,
      provider: event.provider,
      event: event.payload?.event || null,
      instance: event.payload?.instance || null,
      createdAt: event.created_at,
      preview: previewPayload(event.payload),
    }));
  }

  let recentRuns = data.runs.slice(0, 8);
  let recentRunsFallback: any[] = [];
  if (supabase && recentRuns.length === 0) {
    const fallbackRuns = await supabase
      .from("automation_runs")
      .select("id,tenant_id,automation_id,contact_id,deal_id,status,summary,error,created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    recentRunsFallback = fallbackRuns.error ? [{ error: fallbackRuns.error.message }] : (fallbackRuns.data || []);
  }

  const gemini = await testGeminiConnection("Responda apenas: OK Gemini NextLead.");

  return NextResponse.json({
    ok: true,
    env: {
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      geminiApiKeyMasked: mask(process.env.GEMINI_API_KEY),
      geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
      autoSdrEnabled: String(process.env.NEXTLEAD_ENABLE_AUTO_SDR || "").toLowerCase() === "true",
      whatsappSecret: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
      evolutionReady: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE),
    },
    sdr,
    tableReady: data.tableReady,
    tableError: data.error || null,
    recentRuns,
    recentRunsFallback,
    recentWebhooks,
    gemini,
  }, { headers: { "Cache-Control": "no-store" } });
}
