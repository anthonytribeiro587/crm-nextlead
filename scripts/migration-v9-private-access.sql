-- NextLead CRM 2.0 — endurecimento para banco NOVO e dedicado.
-- Executar DEPOIS de schema.sql e migrations v2 a v8.
-- Não executar em outros projetos Supabase.
--
-- O NextLead legado acessa dados via servidor usando service_role.
-- Até migrarmos para Supabase Auth com RLS por empresa, nenhum usuário
-- anônimo/autenticado deve consultar estas tabelas diretamente pela Data API.
--
-- Este script NÃO resolve sozinho os riscos de autorização nas rotas API.
-- Auditar autenticação, isolamento por tenant e todos os endpoints antes
-- de disponibilizar o CRM como SaaS multiempresa.

do $$
declare app_table text;
begin
  for app_table in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = any(array[
        'profiles', 'pipelines', 'pipeline_stages', 'contacts', 'deals',
        'messages', 'activities', 'webhook_events', 'service_orders',
        'tenants', 'tenant_memberships', 'tenant_integrations',
        'automations', 'automation_runs', 'sdr_states'
      ])
  loop
    execute format('alter table public.%I enable row level security', app_table);
    execute format('revoke all on table public.%I from anon, authenticated', app_table);
  end loop;
end $$;

-- Policies antigas de SELECT público incluídas nas migrations históricas.
drop policy if exists "Permitir leitura publica contacts" on public.contacts;
drop policy if exists "Permitir leitura publica deals" on public.deals;
drop policy if exists "Permitir leitura publica activities" on public.activities;
drop policy if exists "Permitir leitura publica messages" on public.messages;
drop policy if exists "Permitir leitura publica pipeline_stages" on public.pipeline_stages;
drop policy if exists "Permitir leitura publica pipelines" on public.pipelines;

-- Confirmação esperada: todas as tabelas do CRM com RLS ativo.
select schemaname, tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename = any(array[
    'profiles', 'pipelines', 'pipeline_stages', 'contacts', 'deals',
    'messages', 'activities', 'webhook_events', 'service_orders',
    'tenants', 'tenant_memberships', 'tenant_integrations',
    'automations', 'automation_runs', 'sdr_states'
  ])
order by tablename;
