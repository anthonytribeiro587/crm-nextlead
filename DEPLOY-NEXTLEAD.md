# NextLead CRM v6 — Evolution API

Esta versão inclui CRM + Funil + Login + Supabase + Landing API + Integração Evolution API.

## Variáveis principais na Vercel

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://nextlead-crm.vercel.app
NEXT_PUBLIC_DEFAULT_PIPELINE_ID=00000000-0000-0000-0000-000000000001
NEXTLEAD_AUTH_SECRET=
NEXTLEAD_ANTHONY_PASSWORD=
NEXTLEAD_FELIPE_PASSWORD=
NEXTLEAD_ALLOWED_ORIGINS=*
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://147.15.89.173:8080
EVOLUTION_API_KEY=nextlead_api_2026
EVOLUTION_INSTANCE=nextlead
WHATSAPP_WEBHOOK_SECRET=nextlead_webhook_2026

## Importante

Apague package-lock antigo, tsconfig.tsbuildinfo antigo e qualquer node_modules antes de subir. Esta versão já vem com package-lock novo e testado.

## Testado

npm install
npm run build
