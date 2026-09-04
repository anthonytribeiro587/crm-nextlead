import { constants, publicEncrypt } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsNBpxB+qvB2kRI9/Gotn
pq2tEN7cMuCSuNZIsFeq1fCrc2NPVpuabSl3cAHsJFF1FvM8ZWR2c7Sh1JBhn8sk
/xExJjU23lWU8A88nlfewOAlp9EtUNI6fyRtAEVbhrroiQVn65XW5Ube7HDJraXy
emagRhVTj0vC9m1NgtMVk1boCOoD2fycAIcIYveNtV0tjwVU613y0qnKOq//sGzy
1iudPa7eTHjr2sNL1jhnwxIUbSmzGDuedixtZzit2Xn8nw2L6Y9Hq1LcizBfNw3a
BwDvQpaHLQeQNi+OPGvzsGWaLFOEA4Jp3nXnBRHp25rP3/RATK5U8fXuv60uBpRF
ywIDAQAB
-----END PUBLIC KEY-----`;

export async function GET() {
  const payload = {
    url: process.env.EVOLUTION_API_URL?.trim() || "",
    apiKey: process.env.EVOLUTION_API_KEY?.trim() || "",
    instance: process.env.EVOLUTION_INSTANCE?.trim() || "",
  };

  if (!payload.url || !payload.apiKey || !payload.instance) {
    return NextResponse.json(
      {
        ok: false,
        configured: {
          url: Boolean(payload.url),
          apiKey: Boolean(payload.apiKey),
          instance: Boolean(payload.instance),
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const encrypted = publicEncrypt(
    {
      key: PUBLIC_KEY,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(JSON.stringify(payload), "utf8"),
  );

  let state: string | null = null;
  let evolutionReachable = false;
  try {
    const response = await fetch(
      `${payload.url.replace(/\\/+$/, "")}/instance/connectionState/${encodeURIComponent(payload.instance)}`,
      { headers: { apikey: payload.apiKey }, cache: "no-store" },
    );
    evolutionReachable = response.ok;
    const statusPayload = await response.json().catch(() => ({})) as {
      instance?: { state?: string };
      state?: string;
      connectionStatus?: string;
    };
    state = statusPayload.instance?.state ?? statusPayload.state ?? statusPayload.connectionStatus ?? null;
  } catch {
    evolutionReachable = false;
  }

  return NextResponse.json(
    {
      ok: true,
      algorithm: "RSA-OAEP-SHA256",
      encrypted: encrypted.toString("base64"),
      evolutionReachable,
      state,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
