import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "./tenant";

export const SESSION_COOKIE = "nextlead_session";

export type SessionUser = {
  name: "Anthony" | "Felipe";
  role: "admin" | "vendas";
  tenantId: string;
  tenantSlug: string;
  exp: number;
};

function getSecret() {
  const secret = process.env.NEXTLEAD_AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTLEAD_AUTH_SECRET/AUTH_SECRET não configurado em produção.");
  }
  return "nextlead-dev-secret-change-me";
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payloadBase64: string) {
  return createHmac("sha256", getSecret()).update(payloadBase64).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function createSessionToken(user: Omit<SessionUser, "exp">) {
  const payload: SessionUser = {
    ...user,
    tenantId: user.tenantId || DEFAULT_TENANT_ID,
    tenantSlug: user.tenantSlug || DEFAULT_TENANT_SLUG,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const payloadBase64 = base64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token?: string | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = signPayload(payloadBase64);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as SessionUser;
    if (!payload?.name || !payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, tenantId: payload.tenantId || DEFAULT_TENANT_ID, tenantSlug: payload.tenantSlug || DEFAULT_TENANT_SLUG };
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

export function validateLogin(user: string, password: string) {
  const normalized = user.toLowerCase().trim();
  const anthonyPassword = process.env.NEXTLEAD_ANTHONY_PASSWORD || "";
  const felipePassword = process.env.NEXTLEAD_FELIPE_PASSWORD || "";

  if (["anthony", "miguel", "miguelito"].includes(normalized) && Boolean(anthonyPassword) && password === anthonyPassword) {
    return { name: "Anthony" as const, role: "admin" as const, tenantId: DEFAULT_TENANT_ID, tenantSlug: DEFAULT_TENANT_SLUG };
  }

  if (normalized === "felipe" && Boolean(felipePassword) && password === felipePassword) {
    return { name: "Felipe" as const, role: "vendas" as const, tenantId: DEFAULT_TENANT_ID, tenantSlug: DEFAULT_TENANT_SLUG };
  }

  return null;
}
