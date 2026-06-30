-- NextLead CRM WhatsApp - Supabase/PostgreSQL schema
-- Rode este arquivo no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role text not null default 'atendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Funil principal',
  created_at timestamptz not null default now()
);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references pipelines(id) on delete cascade,
  title text not null,
  position int not null,
  color text not null default '#4f8cff',
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  company text,
  source text not null default 'Manual',
  owner_id uuid references profiles(id) on delete set null,
  owner text not null default 'NextLead',
  temperature text not null default 'morno' check (temperature in ('frio', 'morno', 'quente')),
  tags text[] not null default '{}',
  notes text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  stage_id uuid references pipeline_stages(id) on delete set null,
  title text not null,
  value numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  source text,
  expected_close date,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  type text not null default 'text',
  status text not null default 'queued',
  provider text not null default 'whatsapp',
  provider_message_id text unique,
  provider_phone_number_id text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_phone on contacts(phone);
create index if not exists idx_deals_stage_id on deals(stage_id);
create index if not exists idx_deals_contact_id on deals(contact_id);
create index if not exists idx_messages_contact_id_created on messages(contact_id, created_at desc);
create index if not exists idx_messages_provider_message_id on messages(provider_message_id);

insert into pipelines (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Funil principal')
on conflict (id) do nothing;

insert into pipeline_stages (id, pipeline_id, title, position, color) values
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Novo lead', 1, '#3b82f6'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Contato feito', 2, '#06b6d4'),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Diagnóstico', 3, '#8b5cf6'),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Proposta enviada', 4, '#f59e0b'),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Negociação', 5, '#ec4899'),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'Fechado', 6, '#22c55e')
on conflict (id) do nothing;

-- Segurança: para MVP rápido, o backend usa service role key em rotas API.
-- Antes de expor telas com dados reais para múltiplos usuários, configure Auth + RLS por usuário/empresa.

-- Módulo operacional: ordens de serviço vinculadas ao contato/oportunidade.
create table if not exists service_orders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  code text not null unique,
  title text not null,
  description text,
  status text not null default 'aberta' check (status in ('aberta','diagnostico','aguardando_aprovacao','aprovada','execucao','aguardando_material','concluida','entregue','cancelada')),
  priority text not null default 'morno' check (priority in ('frio','morno','quente')),
  owner text not null default 'NextLead',
  estimated_value numeric(12,2) not null default 0,
  final_value numeric(12,2) not null default 0,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_orders_contact_id on service_orders(contact_id);
create index if not exists idx_service_orders_deal_id on service_orders(deal_id);
create index if not exists idx_service_orders_status on service_orders(status);
