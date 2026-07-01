import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PIPELINE_TEMPLATES, type PipelineTemplateKey } from "@/lib/pipeline-templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanName(value: unknown) {
  const name = String(value || "").trim();
  return name || "Novo pipeline";
}

function cleanStages(value: unknown, templateStages: Array<{ title: string; color: string }>) {
  if (!Array.isArray(value)) return templateStages;

  const stages = value
    .map((item) => {
      const title = String(item?.title || "").trim();
      const color = String(item?.color || "#06b6d4").trim();
      return {
        title,
        color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#06b6d4",
      };
    })
    .filter((stage) => stage.title.length > 0)
    .slice(0, 12);

  return stages.length ? stages : templateStages;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const name = cleanName(payload.name);
  const templateKey = String(payload.template || "personalizado") as PipelineTemplateKey;
  const template = PIPELINE_TEMPLATES[templateKey] || PIPELINE_TEMPLATES.personalizado;
  const selectedStages = cleanStages(payload.stages, template.stages);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const pipeline = { id: `demo-${Date.now()}`, name };
    const stages = selectedStages.map((stage, index) => ({
      id: `demo-stage-${Date.now()}-${index}`,
      pipelineId: pipeline.id,
      title: stage.title,
      order: index + 1,
      color: stage.color,
    }));
    return NextResponse.json({ ok: true, demo: true, pipeline, stages });
  }

  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .insert({ name })
    .select("id,name,created_at")
    .single();

  if (pipelineError || !pipeline) {
    return NextResponse.json({ error: pipelineError?.message || "Erro ao criar pipeline." }, { status: 500 });
  }

  const stageRows = selectedStages.map((stage, index) => ({
    pipeline_id: pipeline.id,
    title: stage.title,
    position: index + 1,
    color: stage.color,
  }));

  const { data: createdStages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .insert(stageRows)
    .select("id,pipeline_id,title,position,color")
    .order("position", { ascending: true });

  if (stagesError) {
    return NextResponse.json({ error: stagesError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pipeline: { id: pipeline.id, name: pipeline.name, createdAt: pipeline.created_at },
    stages: (createdStages || []).map((stage: any) => ({
      id: stage.id,
      pipelineId: stage.pipeline_id,
      title: stage.title,
      order: stage.position,
      color: stage.color || "#4f8cff",
    })),
  });
}
