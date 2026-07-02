-- v7 - Automações + SDR Foundation
-- Rode depois da migration v6 SaaS/white label.

create extension if not exists "pgcrypto";

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  type text not null default 'custom',
  enabled boolean not null default true,
  mode text not null default 'suggest' check (mode in ('off', 'suggest', 'auto')),
  trigger_type text not null default 'manual',
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automations_tenant_type on public.automations(tenant_id, type);
create index if not exists idx_automations_enabled on public.automations(tenant_id, enabled, trigger_type);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  automation_id uuid references public.automations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  status text not null default 'success',
  summary text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_runs_tenant_created on public.automation_runs(tenant_id, created_at desc);
create index if not exists idx_automation_runs_contact on public.automation_runs(contact_id, created_at desc);

insert into public.automations (
  tenant_id,
  name,
  description,
  type,
  enabled,
  mode,
  trigger_type,
  conditions,
  actions
)
select
  t.id,
  'SDR NextLead',
  'Qualifica leads pelo WhatsApp: negócio, site/landing, intenção de captar clientes e entrega para atendimento humano quando estiver quente.',
  'sdr_nextlead',
  true,
  'suggest',
  'message_received',
  '{"onlyOpenDeals":true,"avoidHumanTakeover":true,"businessHoursOnly":false,"cooldownMinutes":5}'::jsonb,
  '{"generateReply":true,"classifyTemperature":true,"suggestStage":true,"logHistory":true,"autoSendRequiresEnv":true}'::jsonb
from public.tenants t
where t.active = true
  and not exists (
    select 1 from public.automations a
    where a.tenant_id = t.id and a.type = 'sdr_nextlead'
  );

-- Se usar RLS no futuro, crie policies por tenant_id antes de habilitar.
-- alter table public.automations enable row level security;
-- alter table public.automation_runs enable row level security;
