-- NextLead CRM - Migration v3: Ordens de Serviço
-- Rode uma vez no SQL Editor do Supabase antes de usar o módulo /ordens.

create extension if not exists "pgcrypto";

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
