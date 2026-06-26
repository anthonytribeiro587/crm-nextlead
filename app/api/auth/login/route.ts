import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, validateLogin } from "@/lib/auth-server";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const user = validateLogin(String(payload.user || ""), String(payload.password || ""));

  if (!user) {
    return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = createSessionToken(user);
  const response = NextResponse.json({ ok: true, user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
