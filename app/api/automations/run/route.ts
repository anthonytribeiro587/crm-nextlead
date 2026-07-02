import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { runSdrAutomationForContact, type AutomationMode } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanMode(value: unknown): AutomationMode | undefined {
  const mode = String(value || "").trim();
  return mode === "off" || mode === "auto" || mode === "suggest" ? mode : undefined;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const contactId = String(payload.contactId || "").trim();

  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório." }, { status: 400 });
  }

  const result = await runSdrAutomationForContact({
    contactId,
    requestedMode: cleanMode(payload.mode),
    tenant: await getTenantContext(request.headers.get("host")),
    source: "manual",
  });

  if (!result.ok && "status" in result) {
    return NextResponse.json(result, { status: Number(result.status) || 500 });
  }

  return NextResponse.json(result);
}
