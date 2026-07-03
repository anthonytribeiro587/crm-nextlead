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
    const maskJid = (value: unknown) => {
      const raw = String(value || "");
      if (!raw) return null;
      const [left, domain] = raw.split("@");
      const visible = left.length > 8 ? `${left.slice(0, 4)}...${left.slice(-4)}` : left;
      return domain ? `${visible}@${domain}` : visible;
    };
    const classifyJid = (value: unknown) => {
      const raw = String(value || "").toLowerCase();
      const left = raw.split("@")[0].replace(/\D/g, "");
      if (raw.includes("@g.us")) return "grupo";
      if (raw.includes("@broadcast") || raw.includes("status@broadcast")) return "broadcast/status";
      if (raw.includes("@newsletter")) return "newsletter";
      if (/^120\d{8,}$/.test(left)) return "provavel_grupo_120";
      return "contato";
    };
    const previewPayload = (payload: any) => {
      const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data || payload;
      const key = data?.key || data?.data?.key || {};
      const msg = data?.message || data?.data?.message || {};
      const body = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || (msg?.audioMessage ? "[áudio]" : "");
      const remoteJid = key?.remoteJid || data?.remoteJid || data?.sender || data?.from || data?.number;
      const phone = normalizeJid(remoteJid);
      const chatKind = classifyJid(remoteJid);
      const fromMe = parseFromMe(key?.fromMe) || parseFromMe(data?.fromMe);
      const hasText = Boolean(body);
      const messageType = data?.messageType || data?.type || Object.keys(msg || {})[0] || null;
      const sdrEligible = chatKind === "contato" && !fromMe && hasText && !String(messageType || "").toLowerCase().includes("sticker");
      return {
        phone: phone ? `${phone.slice(0, 4)}...${phone.slice(-4)}` : null,
        remoteJid: maskJid(remoteJid),
        chatKind,
        sdrEligible,
        skipReason: sdrEligible ? null : fromMe ? "from_me" : !hasText ? "sem_texto" : chatKind !== "contato" ? chatKind : "tipo_nao_suportado",
        fromMe,
        hasText,
        textPreview: body ? String(body).slice(0, 80) : null,
        messageType,
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
