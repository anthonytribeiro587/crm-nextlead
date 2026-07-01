import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const { contactId } = await request.json().catch(() => ({}));
  if (!contactId) return NextResponse.json({ error: "Informe o contato." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  const { error } = await supabase
    .from("messages")
    .update({ status: "read", updated_at: new Date().toISOString() })
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .neq("status", "read");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
