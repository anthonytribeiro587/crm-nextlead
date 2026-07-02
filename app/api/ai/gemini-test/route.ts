import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { testGeminiConnection } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin pode testar Gemini." }, { status: 403 });
  }
  const result = await testGeminiConnection();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin pode testar Gemini." }, { status: 403 });
  }
  const payload = await request.json().catch(() => ({}));
  const result = await testGeminiConnection(String(payload.prompt || "Responda apenas: Gemini conectado."));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
