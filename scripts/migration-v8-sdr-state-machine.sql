-- v8 - SDR State Machine
-- Rode depois da migration-v7-automations-sdr.sql.
-- Guarda a memória/estado do agente SDR por contato para evitar perguntas repetidas
-- e conduzir o fluxo até a entrega para vendedor/protótipo.

create extension if not exists "pgcrypto";

create table if not exists public.sdr_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  phase text not null default 'ask_business',
  business_type text,
  has_website text not null default 'nao_informado',
  current_channels jsonb not null default '[]'::jsonb,
  wants_whatsapp_leads text not null default 'nao_informado',
  urgency text not null default 'nao_informado',
  handoff_ready boolean not null default false,
  handoff_at timestamptz,
  last_inbound_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sdr_states_phase_check check (phase in ('ask_business','ask_presence','ask_goal','ask_urgency','handoff','paused')),
  constraint sdr_states_has_website_check check (has_website in ('sim','nao','nao_informado')),
  constraint sdr_states_wants_check check (wants_whatsapp_leads in ('sim','nao','nao_informado')),
  constraint sdr_states_urgency_check check (urgency in ('baixa','media','alta','nao_informado'))
);

create unique index if not exists idx_sdr_states_tenant_contact_unique
  on public.sdr_states(tenant_id, contact_id)
  where tenant_id is not null;

create index if not exists idx_sdr_states_contact on public.sdr_states(contact_id);
create index if not exists idx_sdr_states_handoff on public.sdr_states(tenant_id, handoff_ready, updated_at desc);

-- Atualiza automação SDR para usar o novo fluxo de estado.
update public.automations
set
  conditions = coalesce(conditions, '{}'::jsonb) || '{"onlyOpenDeals":false,"avoidHumanTakeover":true,"businessHoursOnly":false,"cooldownMinutes":0}'::jsonb,
  actions = coalesce(actions, '{}'::jsonb) || '{"stateMachine":true,"handoffToSeller":true,"prototypeHandoff":true,"generateReply":true,"classifyTemperature":true,"suggestStage":true,"logHistory":true,"autoSendRequiresEnv":true}'::jsonb,
  updated_at = now()
where type = 'sdr_nextlead';
