import { NextRequest, NextResponse } from "next/server";

function cleanBaseUrl(value?: string) {
  return (value || "").trim().replace(/\/$/, "");
}

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const number = onlyDigits(body.number);
  const apiUrl = cleanBaseUrl(process.env.EVOLUTION_API_URL);
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "nextlead";

  if (!number) return NextResponse.json({ ok: false, error: "Número inválido." }, { status: 400 });
  if (!apiUrl || !apiKey || !instance) return NextResponse.json({ ok: false, error: "Evolution API não configurada." }, { status: 200 });

  try {
    const response = await fetch(`${apiUrl}/chat/fetchProfilePictureUrl/${instance}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    const url =
      payload?.profilePictureUrl ||
      payload?.profilePicture ||
      payload?.picture ||
      payload?.url ||
      payload?.data?.profilePictureUrl ||
      payload?.data?.picture ||
      payload?.data?.url ||
      null;

    return NextResponse.json({ ok: response.ok, url, payload: url ? undefined : payload });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao buscar foto." }, { status: 200 });
  }
}
