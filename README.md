# NextLead CRM

CRM com landing page, WhatsApp Inbox, funil comercial, propostas, follow-ups, histórico e ordens de serviço.

## Deploy

1. Suba os arquivos para o GitHub.
2. No Vercel, mantenha as variáveis de ambiente do Supabase e Evolution API.
3. Rode o deploy normalmente.

## Banco de dados

Para ativar o novo módulo de Ordens de Serviço, rode uma vez no SQL Editor do Supabase:

```sql
-- copiar e executar o conteúdo de scripts/migration-v3-service-orders.sql
```

Sem essa migration, o CRM continua funcionando, mas a tela `/ordens` mostra um aviso pedindo a criação da tabela.

## Rotas principais

- `/` — Dashboard comercial e operacional
- `/inbox` — Atendimento WhatsApp
- `/funil` — Pipeline comercial
- `/crm` — Ficha do contato, histórico e origem
- `/ordens` — Ordens de serviço
- `/configuracoes` — Setup e diagnóstico
