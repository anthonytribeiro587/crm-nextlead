import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mask(value?: string) {
  if (!value) return null;
  if (value.length <= 8) return "configurado";
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const callbackUrl = appUrl ? `${appUrl}/api/whatsapp/webhook` : null;

  return NextResponse.json({
    ok: true,
    whatsapp: {
      graphVersion: process.env.META_GRAPH_VERSION || "v20.0",
      hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
      hasWabaId: Boolean(process.env.WHATSAPP_WABA_ID),
      hasVerifyToken: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      phoneNumberId: mask(process.env.WHATSAPP_PHONE_NUMBER_ID),
      wabaId: mask(process.env.WHATSAPP_WABA_ID),
      callbackUrl,
      readyToSend: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      readyToVerifyWebhook: Boolean(callbackUrl && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    },
  });
}
