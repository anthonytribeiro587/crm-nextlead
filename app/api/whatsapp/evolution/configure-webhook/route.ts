import { NextResponse } from "next/server";
import { configureEvolutionWebhook } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getWebhookUrl() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!appUrl) throw new Error("Configure NEXT_PUBLIC_APP_URL na Vercel.");

  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const suffix = secret ? `?secret=${encodeURIComponent(secret)}` : "";
  return `${appUrl}/api/whatsapp/webhook${suffix}`;
}

export async function POST() {
  try {
    const webhookUrl = getWebhookUrl();
    const result = await configureEvolutionWebhook(webhookUrl);
    return NextResponse.json({ ok: true, webhookUrl, result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Erro ao configurar webhook." }, { status: 500 });
  }
}
