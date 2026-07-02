-- NextLead CRM v13.1 - Base SaaS / White Label
-- Rode depois das migrations anteriores. Mantém compatibilidade com os dados atuais.

create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  app_name text not null default 'NextLead CRM',
  tagline text not null default 'Páginas que convertem',
  logo_url text not null default '/nextlead-logo.png',
  mark_url text not null default '/nextlead-mark.png',
  primary_color text not null default '#2f6bff',
  secondary_color text not null default '#00d8ff',
  custom_domain text unique,
  plan text not null default 'internal',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (
  id, slug, name, app_name, tagline, logo_url, mark_url, primary_color, secondary_color, plan, active
) values (
  '00000000-0000-0000-0000-000000000001',
  'nextlead',
  'NextLead',
  'NextLead CRM',
  'Páginas que convertem',
  '/nextlead-logo.png',
  '/nextlead-mark.png',
  '#2f6bff',
  '#00d8ff',
  'agency',
  true
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  app_name = excluded.app_name,
  tagline = excluded.tagline,
  logo_url = excluded.logo_url,
  mark_url = excluded.mark_url,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  updated_at = now();

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  user_name text,
  role text not null default 'atendente',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, profile_id),
  unique (tenant_id, user_name)
);

create table if not exists public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'evolution',
  instance_name text,
  api_url text,
  api_key_encrypted text,
  webhook_secret text,
  status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, instance_name)
);

alter table if exists public.profiles add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.pipelines add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.pipeline_stages add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.contacts add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.deals add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.messages add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.activities add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.webhook_events add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table if exists public.service_orders add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

update public.profiles set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.pipelines set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.pipeline_stages set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.contacts set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.deals set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.messages set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.activities set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.webhook_events set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.service_orders set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

alter table if exists public.profiles alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.pipelines alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.pipeline_stages alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.contacts alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.deals alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.messages alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.activities alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.webhook_events alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table if exists public.service_orders alter column tenant_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists idx_profiles_tenant_id on public.profiles(tenant_id);
create index if not exists idx_pipelines_tenant_id on public.pipelines(tenant_id);
create index if not exists idx_pipeline_stages_tenant_id on public.pipeline_stages(tenant_id);
create index if not exists idx_contacts_tenant_id on public.contacts(tenant_id);
create index if not exists idx_deals_tenant_id on public.deals(tenant_id);
create index if not exists idx_messages_tenant_id on public.messages(tenant_id);
create index if not exists idx_activities_tenant_id on public.activities(tenant_id);
create index if not exists idx_service_orders_tenant_id on public.service_orders(tenant_id);
create index if not exists idx_webhook_events_tenant_id on public.webhook_events(tenant_id);

-- Ajusta unicidades globais para unicidades por empresa.
do $$
begin
  alter table public.contacts drop constraint if exists contacts_phone_key;
  alter table public.messages drop constraint if exists messages_provider_message_id_key;
  alter table public.service_orders drop constraint if exists service_orders_code_key;
exception when undefined_table then
  null;
end $$;

create unique index if not exists ux_contacts_tenant_phone on public.contacts(tenant_id, phone);
create unique index if not exists ux_messages_tenant_provider_message_id
  on public.messages(tenant_id, provider_message_id)
  where provider_message_id is not null;
create unique index if not exists ux_service_orders_tenant_code on public.service_orders(tenant_id, code);
create unique index if not exists ux_pipelines_tenant_name on public.pipelines(tenant_id, name);
create unique index if not exists ux_pipeline_stages_tenant_pipeline_position on public.pipeline_stages(tenant_id, pipeline_id, position);

create or replace function public.sync_deal_tenant_pipeline_from_stage()
returns trigger
language plpgsql
as $$
declare
  stage_pipeline_id uuid;
  stage_tenant_id uuid;
begin
  if new.contact_id is not null and new.tenant_id is null then
    select tenant_id into new.tenant_id from public.contacts where id = new.contact_id;
  end if;

  if new.stage_id is not null then
    select pipeline_id, tenant_id into stage_pipeline_id, stage_tenant_id
    from public.pipeline_stages
    where id = new.stage_id;

    new.pipeline_id := stage_pipeline_id;

    if new.tenant_id is null then
      new.tenant_id := stage_tenant_id;
    end if;

    if stage_tenant_id is not null and new.tenant_id <> stage_tenant_id then
      raise exception 'Etapa pertence a outra empresa/tenant.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_deal_pipeline_from_stage on public.deals;
drop trigger if exists trg_sync_deal_tenant_pipeline_from_stage on public.deals;
create trigger trg_sync_deal_tenant_pipeline_from_stage
before insert or update of contact_id, stage_id, tenant_id
on public.deals
for each row
execute function public.sync_deal_tenant_pipeline_from_stage();

-- Função utilitária para duplicar a estrutura básica de funil em um novo tenant.
create or replace function public.create_tenant_defaults(p_tenant_id uuid)
returns void
language plpgsql
as $$
declare
  p_pipeline_id uuid;
begin
  insert into public.pipelines (tenant_id, name)
  values (p_tenant_id, 'Comercial')
  on conflict (tenant_id, name) do nothing;

  select id into p_pipeline_id from public.pipelines where tenant_id = p_tenant_id and name = 'Comercial' limit 1;

  insert into public.pipeline_stages (tenant_id, pipeline_id, title, position, color) values
    (p_tenant_id, p_pipeline_id, 'Novo lead', 1, '#3b82f6'),
    (p_tenant_id, p_pipeline_id, 'Contato feito', 2, '#06b6d4'),
    (p_tenant_id, p_pipeline_id, 'Diagnóstico', 3, '#8b5cf6'),
    (p_tenant_id, p_pipeline_id, 'Proposta enviada', 4, '#f59e0b'),
    (p_tenant_id, p_pipeline_id, 'Negociação', 5, '#ec4899'),
    (p_tenant_id, p_pipeline_id, 'Fechado', 6, '#22c55e')
  on conflict (tenant_id, pipeline_id, position) do nothing;
end;
$$;

select public.create_tenant_defaults('00000000-0000-0000-0000-000000000001');

-- RLS fica preparada para quando trocar o backend para JWT de usuário/tenant.
-- Por enquanto o app usa service role nas APIs, então os filtros por tenant também foram adicionados no código.
