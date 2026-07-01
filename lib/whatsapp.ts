export interface SendWhatsAppTextInput {
  to: string;
  body: string;
}

export type WhatsAppProvider = "evolution" | "meta" | "demo";

function cleanBaseUrl(value?: string) {
  return (value || "").trim().replace(/\/$/, "");
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const configured = (process.env.WHATSAPP_PROVIDER || "").toLowerCase().trim();
  if (configured === "evolution") return "evolution";
  if (configured === "meta" || configured === "cloud") return "meta";

  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) return "evolution";
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) return "meta";
  return "demo";
}

function getEvolutionConfig() {
  const apiUrl = cleanBaseUrl(process.env.EVOLUTION_API_URL);
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "nextlead";

  if (!apiUrl || !apiKey || !instance) {
    throw new Error("Credenciais da Evolution API não configuradas. Preencha EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.");
  }

  return { apiUrl, apiKey, instance };
}

function extractProviderMessageId(payload: any) {
  return (
    payload?.key?.id ||
    payload?.message?.key?.id ||
    payload?.data?.key?.id ||
    payload?.id ||
    payload?.messageId ||
    payload?.messages?.[0]?.id ||
    undefined
  );
}

async function sendEvolutionText({ to, body }: SendWhatsAppTextInput) {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  const response = await fetch(`${apiUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: to,
      text: body,
      options: {
        delay: 900,
        presence: "composing",
        linkPreview: false,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload?.response?.message || payload?.message || payload?.error || "Erro ao enviar mensagem pela Evolution API.";
    throw new Error(Array.isArray(detail) ? detail.join(" | ") : detail);
  }

  return {
    provider: "evolution" as const,
    payload,
    providerMessageId: extractProviderMessageId(payload),
  };
}

async function sendMetaText({ to, body }: SendWhatsAppTextInput) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_VERSION || "v20.0";

  if (!token || !phoneNumberId) {
    throw new Error("Credenciais do WhatsApp Cloud API não configuradas. Preencha WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.");
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar mensagem pela Cloud API.");
  }

  return {
    provider: "meta" as const,
    payload,
    providerMessageId: extractProviderMessageId(payload),
  };
}

export async function sendWhatsAppText(input: SendWhatsAppTextInput) {
  const provider = getWhatsAppProvider();
  if (provider === "evolution") return sendEvolutionText(input);
  if (provider === "meta") return sendMetaText(input);
  throw new Error("Nenhum provedor WhatsApp configurado. Configure Evolution API ou Meta Cloud API.");
}


export interface SendWhatsAppMediaInput {
  to: string;
  media: string;
  mimetype: string;
  fileName?: string;
  caption?: string;
  mediaType?: "image" | "video" | "audio" | "document";
}

function inferMediaType(mimetype: string, mediaType?: SendWhatsAppMediaInput["mediaType"]) {
  if (mediaType) return mediaType;
  const mime = String(mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function stripDataUrl(value: string) {
  return String(value || "").includes(",") ? String(value).split(",").pop() || "" : String(value || "");
}

async function sendEvolutionMedia(input: SendWhatsAppMediaInput) {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();
  const media = stripDataUrl(input.media);
  const mediatype = inferMediaType(input.mimetype, input.mediaType);
  const caption = input.caption || "";
  const fileName = input.fileName || `arquivo-${Date.now()}`;

  async function parseResponse(response: Response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.response?.message || payload?.message || payload?.error || "Erro ao enviar mídia pela Evolution API.";
      throw new Error(Array.isArray(detail) ? detail.join(" | ") : detail);
    }
    return payload;
  }

  if (mediatype === "audio") {
    try {
      const response = await fetch(`${apiUrl}/message/sendWhatsAppAudio/${instance}`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: input.to,
          audio: media,
          options: { delay: 900, presence: "recording" },
        }),
      });
      const payload = await parseResponse(response);
      return { provider: "evolution" as const, payload, providerMessageId: extractProviderMessageId(payload) };
    } catch {
      // Algumas instalações aceitam áudio apenas pelo endpoint genérico de mídia.
    }
  }

  const response = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: input.to,
      mediatype,
      mimetype: input.mimetype,
      caption,
      media,
      fileName,
      options: {
        delay: 900,
        presence: mediatype === "audio" ? "recording" : "composing",
      },
    }),
  });

  const payload = await parseResponse(response);
  return { provider: "evolution" as const, payload, providerMessageId: extractProviderMessageId(payload) };
}

export async function sendWhatsAppMedia(input: SendWhatsAppMediaInput) {
  const provider = getWhatsAppProvider();
  if (provider === "evolution") return sendEvolutionMedia(input);
  if (provider === "meta") throw new Error("Envio de mídia pela Meta Cloud API ainda não foi configurado neste CRM.");
  throw new Error("Nenhum provedor WhatsApp configurado. Configure Evolution API para envio real de mídia.");
}

export async function getEvolutionConnectionState() {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  const response = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    payload,
    state: payload?.instance?.state || payload?.state || payload?.connectionStatus || null,
  };
}

export async function configureEvolutionWebhook(webhookUrl: string) {
  const { apiUrl, apiKey, instance } = getEvolutionConfig();

  const body = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        "APPLICATION_STARTUP",
        "QRCODE_UPDATED",
        "CONNECTION_UPDATE",
        "MESSAGES_SET",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "SEND_MESSAGE",
      ],
    },
  };

  const response = await fetch(`${apiUrl}/webhook/set/${instance}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload?.response?.message || payload?.message || payload?.error || "Erro ao configurar webhook na Evolution API.";
    throw new Error(Array.isArray(detail) ? detail.join(" | ") : detail);
  }

  return payload;
}

export interface ResolveWhatsAppMediaInput {
  rawPayload: any;
  mediaType?: "image" | "video" | "audio" | "document" | string;
  mimetype?: string;
}

function pickFirstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function extractResolvedBase64(payload: any) {
  return pickFirstString(
    payload?.base64,
    payload?.data?.base64,
    payload?.data?.media,
    payload?.media,
    payload?.result?.base64,
    payload?.response?.base64,
  );
}

function extractResolvedMime(payload: any, fallback?: string) {
  return pickFirstString(
    payload?.mimetype,
    payload?.mimeType,
    payload?.data?.mimetype,
    payload?.data?.mimeType,
    payload?.result?.mimetype,
    payload?.response?.mimetype,
    fallback,
    "application/octet-stream",
  );
}

function extractResolvedFileName(payload: any) {
  return pickFirstString(
    payload?.fileName,
    payload?.filename,
    payload?.data?.fileName,
    payload?.data?.filename,
    payload?.result?.fileName,
    payload?.response?.fileName,
  );
}

function payloadForMediaDownload(rawPayload: any) {
  const data = rawPayload?.data || rawPayload;
  const message = data?.message || rawPayload?.message || data;
  const key = data?.key || rawPayload?.key;
  return {
    key,
    message,
    messageTimestamp: data?.messageTimestamp || rawPayload?.messageTimestamp,
    pushName: data?.pushName || rawPayload?.pushName,
  };
}

export async function resolveWhatsAppMedia(input: ResolveWhatsAppMediaInput) {
  const provider = getWhatsAppProvider();
  if (provider !== "evolution") {
    throw new Error("Carregamento de mídia está disponível apenas com Evolution API neste momento.");
  }

  const { apiUrl, apiKey, instance } = getEvolutionConfig();
  const messagePayload = payloadForMediaDownload(input.rawPayload);
  const requestBodies = [
    { message: messagePayload, convertToMp4: false },
    { message: input.rawPayload, convertToMp4: false },
    { ...messagePayload, convertToMp4: false },
  ];

  let lastError = "Não foi possível baixar a mídia pela Evolution API.";

  for (const body of requestBodies) {
    try {
      const response = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = payload?.response?.message || payload?.message || payload?.error || lastError;
        continue;
      }
      const base64 = extractResolvedBase64(payload);
      const mimetype = extractResolvedMime(payload, input.mimetype);
      if (base64) {
        const cleanBase64 = String(base64).includes(",") ? String(base64).split(",").pop() || "" : String(base64);
        const cleanMime = String(mimetype || "application/octet-stream").replace(/;\s*/g, ";");
        return {
          mediaUrl: String(base64).startsWith("data:") ? String(base64) : `data:${cleanMime};base64,${cleanBase64}`,
          mimetype: cleanMime,
          fileName: extractResolvedFileName(payload),
          payload,
        };
      }
      lastError = "A Evolution respondeu, mas não retornou base64 da mídia.";
    } catch (error: any) {
      lastError = error?.message || lastError;
    }
  }

  throw new Error(Array.isArray(lastError) ? lastError.join(" | ") : lastError);
}
