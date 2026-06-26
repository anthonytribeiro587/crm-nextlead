import { NextResponse } from "next/server";
import { getEvolutionConnectionState, getWhatsAppProvider } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mask(value?: string) {
  if (!value) return null;
  if (value.length <= 8) return "configurado";
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const callbackUrl = appUrl ? `${appUrl}/api/whatsapp/webhook${process.env.WHATSAPP_WEBHOOK_SECRET ? "?secret=configurado" : ""}` : null;
  const provider = getWhatsAppProvider();
  let evolutionStatus: any = null;

  if (provider === "evolution") {
    try {
      evolutionStatus = await getEvolutionConnectionState();
    } catch (error: any) {
      evolutionStatus = { ok: false, error: error?.message || "Erro ao consultar Evolution API." };
    }
  }

  return NextResponse.json({
    ok: true,
    provider,
    evolution: {
      hasApiUrl: Boolean(process.env.EVOLUTION_API_URL),
      apiUrl: process.env.EVOLUTION_API_URL || null,
      hasApiKey: Boolean(process.env.EVOLUTION_API_KEY),
      apiKey: mask(process.env.EVOLUTION_API_KEY),
      instance: process.env.EVOLUTION_INSTANCE || null,
      hasWebhookSecret: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
      readyToSend: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE),
      status: evolutionStatus,
    },
    meta: {
      graphVersion: process.env.META_GRAPH_VERSION || "v20.0",
      hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      hasWabaId: Boolean(process.env.WHATSAPP_WABA_ID),
      hasVerifyToken: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      phoneNumberId: mask(process.env.WHATSAPP_PHONE_NUMBER_ID),
      wabaId: mask(process.env.WHATSAPP_WABA_ID),
    },
    callbackUrl,
  });
}
