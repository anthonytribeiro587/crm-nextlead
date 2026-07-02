import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantContext } from "./tenant";
import { withTenant } from "./tenant";

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

export async function ensureDefaultPipeline(supabase: SupabaseClient, tenant?: TenantContext) {
  const pipelineId = tenant?.isDefault ? DEFAULT_PIPELINE_ID : undefined;
  const pipelineRecord = withTenant(
    { ...(pipelineId ? { id: pipelineId } : {}), name: tenant?.isDefault ? "Comercial NextLead" : `Comercial ${tenant?.name || "NextLead"}` },
    tenant || ({ tenantTableReady: false } as TenantContext),
  );

  await supabase.from("pipelines").upsert(pipelineRecord, { onConflict: pipelineId ? "id" : "tenant_id,name" });

  let pipelineQuery = supabase.from("pipelines").select("id").eq("name", pipelineRecord.name);
  if (tenant?.tenantTableReady) pipelineQuery = pipelineQuery.eq("tenant_id", tenant.id);
  const { data: pipeline } = await pipelineQuery.maybeSingle();

  const resolvedPipelineId = pipeline?.id || pipelineId || DEFAULT_PIPELINE_ID;

  await supabase
    .from("pipeline_stages")
    .upsert(
      DEFAULT_STAGES.map((stage) =>
        withTenant(
          { ...(tenant?.isDefault ? { id: stage.id } : {}), title: stage.title, position: stage.position, color: stage.color, pipeline_id: resolvedPipelineId },
          tenant || ({ tenantTableReady: false } as TenantContext),
        ),
      ),
      { onConflict: tenant?.isDefault ? "id" : "tenant_id,pipeline_id,position" },
    );

  let firstStageQuery = supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", resolvedPipelineId)
    .eq("position", 1);
  if (tenant?.tenantTableReady) firstStageQuery = firstStageQuery.eq("tenant_id", tenant.id);
  const { data: firstStage } = await firstStageQuery.maybeSingle();

  return firstStage?.id || DEFAULT_STAGES[0].id;
}
