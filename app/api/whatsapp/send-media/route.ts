import { NextRequest, NextResponse } from "next/server";
import { completeInitialContactActivities } from "@/lib/activities";
import { brazilPhoneVariants, normalizeBrazilWhatsAppPhone } from "@/lib/format";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWhatsAppProvider, sendWhatsAppMedia } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MediaType = "image" | "video" | "audio" | "document";

function inferMediaType(mimeType: string, mediaType?: string): MediaType {
  if (["image", "video", "audio", "document"].includes(String(mediaType))) return mediaType as MediaType;
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function mediaLabel(mediaType: MediaType, fileName?: string, caption?: string) {
  if (caption?.trim()) return caption.trim();
  const suffix = fileName ? ` ${fileName}` : "";
  if (mediaType === "image") return `[imagem]${suffix}`;
  if (mediaType === "video") return `[vídeo]${suffix}`;
  if (mediaType === "audio") return `[áudio]${suffix}`;
  return `[arquivo]${suffix}`;
}

async function resolveContactId(input: { to: string; contactId?: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  if (input.contactId) {
    await supabase
      .from("contacts")
      .update({ phone: input.to, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", input.contactId);
    return input.contactId;
  }

  const variants = brazilPhoneVariants(input.to);
  const { data: existing } = await supabase
    .from("contacts")
    .select("id,phone")
    .in("phone", variants.length ? variants : [input.to])
    .limit(10);

  const resolved = (existing?.find((item: any) => item.phone === input.to) || existing?.[0])?.id;
  if (resolved) return resolved;

  const { data: contact } = await supabase
    .from("contacts")
    .upsert({ phone: input.to, name: input.to, source: "WhatsApp", owner: "NextLead", updated_at: new Date().toISOString() }, { onConflict: "phone" })
    .select("id")
    .single();

  return contact?.id || null;
}

async function saveOutboundMedia(input: {
  to: string;
  contactId?: string;
  body: string;
  type: MediaType;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  provider?: string;
  rawPayload?: any;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const contactId = await resolveContactId({ to: input.to, contactId: input.contactId });
  if (!contactId) return null;

  const record = {
    contact_id: contactId,
    direction: "outbound",
    body: input.body,
    type: input.type,
    status: input.status,
    provider: input.provider || "whatsapp",
    provider_message_id: input.providerMessageId,
    raw_payload: input.rawPayload || null,
  };

  if (input.providerMessageId) {
    await supabase.from("messages").upsert(record, { onConflict: "provider_message_id" });
  } else {
    await supabase.from("messages").insert(record);
  }

  await supabase.from("contacts").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", contactId);
  if (input.status !== "failed") await completeInitialContactActivities(supabase, contactId);
  return contactId;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const to = normalizeBrazilWhatsAppPhone(payload.to || "");
  const contactId = String(payload.contactId || "").trim() || undefined;
  const media = String(payload.media || "");
  const mimeType = String(payload.mimeType || payload.mimetype || "application/octet-stream");
  const fileName = String(payload.fileName || payload.filename || "").trim() || undefined;
  const caption = String(payload.caption || "").trim();
  const mediaType = inferMediaType(mimeType, payload.mediaType);
  const body = mediaLabel(mediaType, fileName, caption);
  const provider = getWhatsAppProvider();

  if (!to || !media) {
    return NextResponse.json({ error: "Informe telefone e mídia." }, { status: 400 });
  }

  const rawPayload = {
    mediaUrl: media.startsWith("data:") ? media : `data:${mimeType};base64,${media}`,
    fileName,
    mimetype: mimeType,
    caption,
    mediaType,
  };

  if (provider === "demo") {
    const providerMessageId = `local-media-${Date.now()}`;
    await saveOutboundMedia({ to, contactId, body, type: mediaType, status: "queued", providerMessageId, provider: "demo", rawPayload: { ...rawPayload, demo: true } });
    return NextResponse.json({ ok: true, demo: true, provider: "demo", providerMessageId, message: "Mídia salva no CRM. Configure a Evolution API para envio real." });
  }

  try {
    const result = await sendWhatsAppMedia({ to, media, mimetype: mimeType, fileName, caption, mediaType });
    await saveOutboundMedia({
      to,
      contactId,
      body,
      type: mediaType,
      status: "sent",
      providerMessageId: result.providerMessageId,
      provider: result.provider,
      rawPayload: { ...rawPayload, result: result.payload },
    });
    return NextResponse.json({ ok: true, provider: result.provider, providerMessageId: result.providerMessageId, result: result.payload });
  } catch (error: any) {
    await saveOutboundMedia({ to, contactId, body, type: mediaType, status: "failed", provider, rawPayload: { ...rawPayload, error: error.message } });
    return NextResponse.json({ error: error.message || "Erro ao enviar mídia." }, { status: 500 });
  }
}
