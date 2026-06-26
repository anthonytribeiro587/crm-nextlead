import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PIPELINE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_PIPELINE_ID || "00000000-0000-0000-0000-000000000001";

export const DEFAULT_STAGES = [
  { id: "00000000-0000-0000-0000-000000000101", title: "Novo lead", position: 1, color: "#3b82f6" },
  { id: "00000000-0000-0000-0000-000000000102", title: "Contato feito", position: 2, color: "#06b6d4" },
  { id: "00000000-0000-0000-0000-000000000103", title: "Diagnóstico", position: 3, color: "#8b5cf6" },
  { id: "00000000-0000-0000-0000-000000000104", title: "Proposta enviada", position: 4, color: "#f59e0b" },
  { id: "00000000-0000-0000-0000-000000000105", title: "Negociação", position: 5, color: "#ec4899" },
  { id: "00000000-0000-0000-0000-000000000106", title: "Fechado", position: 6, color: "#22c55e" },
];

export async function ensureDefaultPipeline(supabase: SupabaseClient) {
  await supabase
    .from("pipelines")
    .upsert({ id: DEFAULT_PIPELINE_ID, name: "Funil principal" }, { onConflict: "id" });

  await supabase
    .from("pipeline_stages")
    .upsert(
      DEFAULT_STAGES.map((stage) => ({ ...stage, pipeline_id: DEFAULT_PIPELINE_ID })),
      { onConflict: "id" }
    );

  return DEFAULT_STAGES[0].id;
}
