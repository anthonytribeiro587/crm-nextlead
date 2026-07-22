import { NextRequest, NextResponse } from "next/server";
import {
  configureEvolutionWebhook,
  getEvolutionConnectionState,
  getWhatsAppProvider,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function configured(value?: string) {
  return Boolean(String(value || "").trim());
}

function providedSecret(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get("secret") ||
    request.headers.get("x-nextlead-webhook-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

function expectedWebhookUrl(request: NextRequest) {
  return new URL("/api/whatsapp/webhook", request.nextUrl.origin).toString();
}

async function inspectEvolution() {
  try {
    const connection = await getEvolutionConnectionState();
    return {
      checked: true,
      reachable: connection.ok,
      httpStatus: connection.status,
      state: connection.state,
      connected: String(connection.state || "").toLowerCase() === "open",
      error: connection.ok ? null : "A Evolution respondeu com erro.",
    };
  } catch (error) {
    return {
      checked: false,
      reachable: false,
      httpStatus: null,
      state: null,
      connected: false,
      error: error instanceof Error ? error.message : "Não foi possível consultar a Evolution API.",
    };
  }
}

export async function GET(request: NextRequest) {
  const provider = getWhatsAppProvider();
  const environment = {
    whatsappProvider: configured(process.env.WHATSAPP_PROVIDER),
    evolutionApiUrl: configured(process.env.EVOLUTION_API_URL),
    evolutionApiKey: configured(process.env.EVOLUTION_API_KEY),
    evolutionInstance: configured(process.env.EVOLUTION_INSTANCE),
    webhookSecret: configured(process.env.WHATSAPP_WEBHOOK_SECRET),
    geminiApiKey: configured(process.env.GEMINI_API_KEY),
    supabaseUrl: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRole: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const evolution = provider === "evolution" ? await inspectEvolution() : null;
  const requiredVariablesPresent =
    environment.evolutionApiUrl &&
    environment.evolutionApiKey &&
    environment.evolutionInstance &&
    environment.supabaseUrl &&
    environment.supabaseServiceRole;

  return NextResponse.json(
    {
      ok: provider === "evolution" && requiredVariablesPresent && Boolean(evolution?.connected),
      project: "crm-nextlead",
      provider,
      environment,
      evolution,
      webhook: {
        endpoint: expectedWebhookUrl(request),
        secretConfigured: environment.webhookSecret,
        repairAvailable: true,
      },
      jrTrial: {
        enabled: true,
        activationCommand: "TESTE JR",
        testerConfiguredByEnvironment: configured(process.env.JR_TRIAL_TEST_PHONE) || configured(process.env.JR_TRIAL_TEST_PHONE_HASH),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const requiredSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!requiredSecret) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_WEBHOOK_SECRET não está configurado no projeto crm-nextlead." },
      { status: 503 },
    );
  }

  if (providedSecret(request) !== requiredSecret) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const webhookUrl = expectedWebhookUrl(request);
    const result = await configureEvolutionWebhook(webhookUrl);
    const evolution = await inspectEvolution();
    return NextResponse.json({ ok: true, webhookUrl, evolution, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Não foi possível configurar o webhook da Evolution.",
      },
      { status: 500 },
    );
  }
}
