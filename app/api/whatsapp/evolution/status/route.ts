import { NextResponse } from "next/server";
import { getEvolutionConnectionState } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await getEvolutionConnectionState();
    return NextResponse.json({ routeOk: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Erro ao consultar Evolution API." }, { status: 500 });
  }
}
