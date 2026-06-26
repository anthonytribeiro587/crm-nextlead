import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    console.info("Webhook recebido em modo demo. Configure Supabase para persistir:", JSON.stringify(payload));
    return json({ received: true, persisted: false });
  }

  await supabase.from("webhook_events").insert({ provider: "whatsapp", payload });

  const entries = payload?.entry ?? [];

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const contacts = value?.contacts ?? [];
      const messages = value?.messages ?? [];
      const statuses = value?.statuses ?? [];

      for (const status of statuses) {
        if (!status?.id) continue;
        await supabase
          .from("messages")
          .update({ status: status.status, updated_at: new Date().toISOString() })
          .eq("provider_message_id", status.id);
      }

      for (const message of messages) {
        const from = message?.from;
        if (!from) continue;

        const profileName = contacts.find((contact: any) => contact?.wa_id === from)?.profile?.name;
        const body = message?.text?.body || `[${message?.type || "mensagem"}]`;

        const { data: contact } = await supabase
          .from("contacts")
          .upsert(
            {
              phone: from,
              name: profileName || from,
              source: "WhatsApp",
              last_message_at: new Date(Number(message.timestamp || Date.now() / 1000) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" }
          )
          .select("id")
          .single();

        if (!contact?.id) continue;

        const { data: existingDeal } = await supabase
          .from("deals")
          .select("id")
          .eq("contact_id", contact.id)
          .eq("status", "aberto")
          .limit(1)
          .maybeSingle();

        if (!existingDeal) {
          const { data: firstStage } = await supabase
            .from("pipeline_stages")
            .select("id")
            .order("position", { ascending: true })
            .limit(1)
            .single();

          if (firstStage?.id) {
            await supabase.from("deals").insert({
              contact_id: contact.id,
              stage_id: firstStage.id,
              title: `Atendimento WhatsApp - ${profileName || from}`,
              status: "aberto",
              value: 0,
              source: "WhatsApp",
            });
          }
        }

        await supabase.from("messages").insert({
          contact_id: contact.id,
          direction: "inbound",
          body,
          type: message?.type || "text",
          status: "received",
          provider: "whatsapp",
          provider_message_id: message?.id,
          provider_phone_number_id: phoneNumberId,
          raw_payload: message,
          created_at: new Date(Number(message.timestamp || Date.now() / 1000) * 1000).toISOString(),
        });
      }
    }
  }

  return json({ received: true, persisted: true });
}
