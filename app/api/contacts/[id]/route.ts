import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const contactId = params.id;

  if (!contactId) {
    return NextResponse.json({ error: "ID do contato é obrigatório." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { error } = await supabase.from("contacts").delete().eq("id", contactId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
