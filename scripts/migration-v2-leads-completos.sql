-- NextLead CRM - Migration v2
-- Rode este arquivo UMA VEZ no SQL Editor do Supabase caso seu banco tenha sido criado antes desta versão.

alter table public.contacts
add column if not exists owner text not null default 'NextLead';

alter table public.contacts
add column if not exists email text;

alter table public.contacts
add column if not exists company text;

alter table public.contacts
add column if not exists source text not null default 'Manual';

alter table public.contacts
add column if not exists temperature text not null default 'morno';

alter table public.contacts
add column if not exists tags text[] not null default '{}';

alter table public.contacts
add column if not exists notes text;

alter table public.contacts
add column if not exists last_message_at timestamptz;

alter table public.deals
add column if not exists expected_close date;

alter table public.deals
add column if not exists lost_reason text;

alter table public.deals
add column if not exists source text;

-- Políticas simples para leitura em MVP. Depois, quando tiver login, troque por políticas autenticadas.
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.messages enable row level security;
alter table public.pipeline_stages enable row level security;

drop policy if exists "Permitir leitura publica contacts" on public.contacts;
create policy "Permitir leitura publica contacts"
on public.contacts for select
using (true);

drop policy if exists "Permitir leitura publica deals" on public.deals;
create policy "Permitir leitura publica deals"
on public.deals for select
using (true);

drop policy if exists "Permitir leitura publica activities" on public.activities;
create policy "Permitir leitura publica activities"
on public.activities for select
using (true);

drop policy if exists "Permitir leitura publica messages" on public.messages;
create policy "Permitir leitura publica messages"
on public.messages for select
using (true);

drop policy if exists "Permitir leitura publica pipeline_stages" on public.pipeline_stages;
create policy "Permitir leitura publica pipeline_stages"
on public.pipeline_stages for select
using (true);
