export const INITIAL_ACTIVITY_TITLES = ["Abordar lead quente agora", "Fazer primeiro contato"];

type SupabaseClientLike = {
  from: (table: string) => any;
};

export async function completeInitialContactActivities(supabase: SupabaseClientLike, contactId?: string | null) {
  if (!contactId) return;

  await supabase
    .from("activities")
    .update({ done: true, updated_at: new Date().toISOString() })
    .eq("contact_id", contactId)
    .eq("done", false)
    .in("title", INITIAL_ACTIVITY_TITLES);
}

export async function upsertInitialContactActivity(input: {
  supabase: SupabaseClientLike;
  contactId: string;
  temperature?: string;
}) {
  const { supabase, contactId, temperature } = input;
  const isHot = temperature === "quente";
  const title = isHot ? "Abordar lead quente agora" : "Fazer primeiro contato";
  const dueAt = new Date(Date.now() + 1000 * 60 * 60 * (isHot ? 1 : 2)).toISOString();

  const { data: existing } = await supabase
    .from("activities")
    .select("id,title,done")
    .eq("contact_id", contactId)
    .eq("done", false)
    .in("title", INITIAL_ACTIVITY_TITLES)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("activities")
      .update({ title, due_at: dueAt, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data } = await supabase
    .from("activities")
    .insert({ contact_id: contactId, title, due_at: dueAt })
    .select("id")
    .single();

  return data?.id;
}
