import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveWhatsAppMedia } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function extractExistingMedia(raw: any) {
  if (!raw) return undefined;
  return firstString(
    raw?.mediaUrl,
    raw?.media_url,
    raw?.fileUrl,
    raw?.file_url,
    raw?.resolvedMediaUrl,
    raw?.downloadUrl,
  );
}

function extractMime(raw: any, type?: string) {
  const msg = raw?.message || raw?.data?.message || raw;
  return firstString(
    raw?.mimetype,
    raw?.mimeType,
    msg?.imageMessage?.mimetype,
    msg?.videoMessage?.mimetype,
    msg?.audioMessage?.mimetype,
    msg?.documentMessage?.mimetype,
    type === "audio" ? "audio/ogg" : undefined,
    type === "image" ? "image/jpeg" : undefined,
    type === "video" ? "video/mp4" : undefined,
    "application/octet-stream",
  );
}

function extractFileName(raw: any, fallback?: string) {
  const msg = raw?.message || raw?.data?.message || raw;
  return firstString(raw?.fileName, raw?.filename, msg?.documentMessage?.fileName, msg?.document?.fileName, fallback);
}

function normalizeMediaType(type?: string, mimetype?: string): "image" | "video" | "audio" | "document" {
  const cleanType = String(type || "").toLowerCase();
  const mime = String(mimetype || "").toLowerCase();
  if (cleanType.includes("image") || mime.startsWith("image/")) return "image";
  if (cleanType.includes("video") || mime.startsWith("video/")) return "video";
  if (cleanType.includes("audio") || mime.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(request: NextRequest) {
  const { messageId } = await request.json().catch(() => ({}));
  if (!messageId) return NextResponse.json({ error: "Informe o ID da mensagem." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const { data: message, error } = await supabase
    .from("messages")
    .select("id,type,body,raw_payload")
    .eq("id", messageId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });

  const rawPayload = message.raw_payload || {};
  const existing = extractExistingMedia(rawPayload);
  const mimetype = extractMime(rawPayload, message.type);
  const mediaType = normalizeMediaType(message.type, mimetype);
  const fileName = extractFileName(rawPayload, message.body);

  if (existing) {
    return NextResponse.json({ ok: true, mediaUrl: existing, mimetype, mediaType, fileName });
  }

  try {
    const resolved = await resolveWhatsAppMedia({ rawPayload, mediaType, mimetype });
    const nextRawPayload = {
      ...rawPayload,
      mediaUrl: resolved.mediaUrl,
      mimetype: resolved.mimetype || mimetype,
      fileName: resolved.fileName || fileName,
    };

    await supabase.from("messages").update({ raw_payload: nextRawPayload }).eq("id", messageId);

    return NextResponse.json({
      ok: true,
      mediaUrl: resolved.mediaUrl,
      mimetype: resolved.mimetype || mimetype,
      mediaType,
      fileName: resolved.fileName || fileName,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não foi possível carregar a mídia." }, { status: 500 });
  }
}
