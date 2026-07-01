-- NextLead CRM - Migration v5: contexto de funil na oportunidade
-- Rode este arquivo UMA VEZ no SQL Editor do Supabase.
-- O app já consegue inferir o funil pela etapa, mas esta coluna deixa a regra explícita:
-- oportunidade.pipeline_id + oportunidade.stage_id.

create extension if not exists "pgcrypto";

alter table public.deals
add column if not exists pipeline_id uuid references public.pipelines(id) on delete set null;

update public.deals deal
set pipeline_id = stage.pipeline_id
from public.pipeline_stages stage
where deal.stage_id = stage.id
  and deal.pipeline_id is null;

create index if not exists idx_deals_pipeline_id on public.deals(pipeline_id);

create or replace function public.sync_deal_pipeline_from_stage()
returns trigger
language plpgsql
as $$
begin
  if new.stage_id is not null then
    select pipeline_id
      into new.pipeline_id
      from public.pipeline_stages
     where id = new.stage_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_deal_pipeline_from_stage on public.deals;
create trigger trg_sync_deal_pipeline_from_stage
before insert or update of stage_id on public.deals
for each row
execute function public.sync_deal_pipeline_from_stage();
