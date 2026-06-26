import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "nextlead_session";

function getSecret() {
  return process.env.NEXTLEAD_AUTH_SECRET || process.env.AUTH_SECRET || "nextlead-mvp-secret-change-me";
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/leads" ||
    pathname === "/api/whatsapp/webhook" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/nextlead-logo.png" ||
    pathname === "/nextlead-mark.png"
  );
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  const array = new Uint8Array(bytes);
  for (let i = 0; i < array.length; i++) binary += String.fromCharCode(array[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifySession(token?: string) {
  if (!token || !token.includes(".")) return false;
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64)));
  if (expected !== signature) return false;

  try {
    const payloadText = new TextDecoder().decode(base64UrlToBytes(payloadBase64));
    const payload = JSON.parse(payloadText) as { exp?: number };
    return Boolean(payload.exp && payload.exp > Date.now());
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const isValid = await verifySession(request.cookies.get(COOKIE_NAME)?.value);
  if (isValid) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
