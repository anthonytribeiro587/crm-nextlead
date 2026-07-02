import type { TenantContext } from "./tenant";
import { withTenant } from "./tenant";

export async function logCommercialActivity(supabase: any, input: { contactId?: string | null; title: string; dueAt?: string; done?: boolean; tenant?: TenantContext }) {
  const contactId = String(input.contactId || "").trim();
  const title = String(input.title || "").trim().slice(0, 160);

  if (!supabase || !contactId || !title) return null;

  const { data, error } = await supabase
    .from("activities")
    .insert(withTenant({
      contact_id: contactId,
      title,
      due_at: input.dueAt || new Date().toISOString(),
      done: input.done ?? true,
    }, input.tenant || ({ tenantTableReady: false } as TenantContext)))
    .select("id,contact_id,title,due_at,done")
    .single();

  if (error) {
    console.warn("Não foi possível registrar histórico comercial", error.message);
    return null;
  }

  return data;
}
