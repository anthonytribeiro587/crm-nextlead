import { NextResponse } from "next/server";
import { getCrmData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getCrmData();
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
