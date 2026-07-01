-- NextLead CRM - Migration v4: múltiplos pipelines
-- Rode este arquivo UMA VEZ no SQL Editor do Supabase antes de usar pipelines personalizados.

create extension if not exists "pgcrypto";

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Funil principal',
  created_at timestamptz not null default now()
);

alter table public.pipeline_stages
add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

insert into public.pipelines (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Comercial NextLead')
on conflict (id) do update set name = excluded.name;

update public.pipeline_stages
set pipeline_id = '00000000-0000-0000-0000-000000000001'
where pipeline_id is null;

create index if not exists idx_pipeline_stages_pipeline_id on public.pipeline_stages(pipeline_id);

alter table public.pipelines enable row level security;

drop policy if exists "Permitir leitura publica pipelines" on public.pipelines;
create policy "Permitir leitura publica pipelines"
on public.pipelines for select
using (true);

-- O app usa API server-side com service role para criar pipelines/etapas.
