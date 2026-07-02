# NextLead CRM v13.1 — SaaS / White Label Foundation

Esta versão prepara o CRM para virar multiempresa sem mudar o fluxo atual da NextLead.

## Ordem de atualização

1. Suba o código v13.1 na Vercel.
2. Rode no Supabase:

```sql
scripts/migration-v6-saas-whitelabel-foundation.sql
```

3. Faça redeploy na Vercel.
4. Teste o fluxo normal: Dashboard, Inbox, Funil, CRM, OS e Setup.

## O que foi adicionado

- Tabela `tenants` para empresas/clientes.
- Tabela `tenant_memberships` para vínculo futuro de usuários por empresa.
- Tabela `tenant_integrations` para WhatsApp/Evolution por empresa.
- Coluna `tenant_id` nas tabelas principais:
  - `profiles`
  - `pipelines`
  - `pipeline_stages`
  - `contacts`
  - `deals`
  - `messages`
  - `activities`
  - `service_orders`
  - `webhook_events`
- Unicidades por tenant, como telefone e provider message id.
- Branding dinâmico por tenant:
  - nome do app;
  - tagline;
  - logo;
  - marca lateral;
  - cor principal;
  - cor secundária.
- Endpoint técnico:

```txt
GET /api/tenant
PATCH /api/tenant
```

## White label rápido

Para alterar a marca principal da NextLead, edite a linha da tabela `tenants`:

```sql
update public.tenants
set
  app_name = 'Nome do Cliente CRM',
  tagline = 'Atendimento e vendas',
  logo_url = '/nextlead-logo.png',
  mark_url = '/nextlead-mark.png',
  primary_color = '#7c3cff',
  secondary_color = '#00d8ff'
where slug = 'nextlead';
```

Depois faça refresh no app.

## Novo tenant de exemplo

```sql
insert into public.tenants (
  slug, name, app_name, tagline, primary_color, secondary_color, plan
) values (
  'voltagym',
  'VoltaGym',
  'VoltaGym Leads',
  'Atendimento e matrículas',
  '#8b5cf6',
  '#06b6d4',
  'pro'
)
returning id;

-- Troque o UUID pelo id retornado acima:
select public.create_tenant_defaults('COLE-O-ID-DO-TENANT-AQUI');
```

Para resolver subdomínio automaticamente, configure no Vercel/DNS e use:

```txt
voltagym.nextlead.com.br
```

com `NEXTLEAD_ROOT_DOMAIN=nextlead.com.br`.

## Observação de segurança

Esta é a base SaaS. O backend ainda usa service role em APIs internas, então o isolamento também foi aplicado no código por `tenant_id`. Para vender como SaaS público em escala, o próximo passo é trocar autenticação estática por Supabase Auth + RLS com JWT contendo `tenant_id`.
