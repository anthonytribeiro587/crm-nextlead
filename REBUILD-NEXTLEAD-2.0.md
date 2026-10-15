# NextLead CRM 2.0 — Reconstrução segura

## Situação
O código do CRM está no repositório `anthonytribeiro587/crm-nextlead`.
A branch `feat/nextlead-2-refresh` traz uma nova navegação, dashboard de trabalho
e tema claro por padrão. Não altera o banco nem a produção.

O banco original não está acessível nesta conta Supabase. A reconstrução de
**estrutura** é viável a partir de SQL versionado; dados de clientes, mensagens,
anexos e usuários não retornam sem um backup do banco antigo.

## Novo projeto Supabase (pendente de escolha da organização e custo)
Criar um projeto **dedicado ao NextLead**, preferencialmente na região
`sa-east-1` para uso brasileiro, após confirmar organização e preço.
Não usar o banco Placasgo.

No SQL Editor do novo projeto, executar na ordem:
1. `scripts/schema.sql`
2. `scripts/migration-v2-leads-completos.sql`
3. `scripts/migration-v3-service-orders.sql`
4. `scripts/migration-v4-multiple-pipelines.sql`
5. `scripts/migration-v5-deals-pipeline-context.sql`
6. `scripts/migration-v6-saas-whitelabel-foundation.sql`
7. `scripts/migration-v7-automations-sdr.sql`
8. `scripts/migration-v8-sdr-state-machine.sql`
9. `scripts/migration-v9-private-access.sql`

ATENÇÃO: migrations v2/v4 contêm políticas legadas de SELECT público.
A etapa 9 **é obrigatória**, remove as políticas públicas e revoga acesso
anon/authenticated às tabelas do aplicativo. Não abandonar a instalação
entre as etapas sem aplicar o endurecimento.

O serviço atual usa chave `service_role` no servidor, que ignora RLS.
Portanto, o endurecimento acima não substitui a auditoria de autorização
das rotas e filtros de tenant. **Não vender contas multiempresa com essa
autenticação legada.**

## Conectar um preview isolado
- Usar o projeto Vercel `crm-nextlead`, não a landing `nextlead`.
- Configurar apenas a branch/ambiente Preview para apontar ao novo Supabase.
- Consultar `.env.example` para os nomes das variáveis; registrar secrets
  somente no painel Vercel (nunca em commits, prints ou mensagens).
- Gerar novos segredos e senhas. Não copiar chaves do banco perdido.
- Deixar `NEXTLEAD_ENABLE_AUTO_SDR=false`; não habilitar disparos automáticos.
- Não apontar o webhook de produção da Evolution API a este preview.
- Só atualizar produção após testes completos, autorização e backup.

## Pendências antes de lançar a nova versão como SaaS
- Migrar login fixo (Anthony/Felipe) para Supabase Auth, contas e equipes.
- Implementar políticas RLS por `tenant_id` e associação de usuários
  verificada no servidor; revisar todas as rotas com `service_role`.
- Revisar origem confiável de `tenant_id`, webhooks e proteção contra
  leitura/gravação de recursos de outra empresa.
- Validar isolamento entre empresas (contatos, mensagens, funis, anexos, OS).
- Remover/desabilitar endpoints de debug em produção; testar rate limiting.
- Validar banco vazio, cadastros, funis, Inbox, propostas e ordens de serviço.
- Testar uso em celular real e laptop (larguras 375px, 768px, 1366px).
- Revisar backup, retenção de dados e LGPD.

## Comandos locais
```bash
npm ci
npx tsc --noEmit
npm run build
```

## Escopo visual desta branch
A primeira etapa redesenha menu, cabeçalho, dashboard e estilos gerais.
Os formulários e componentes de atendimento existentes são preservados
para uma segunda etapa de UX, com QA dos fluxos antes de cada substituição.
