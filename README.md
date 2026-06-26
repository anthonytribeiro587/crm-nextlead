# NextLead CRM + Evolution API

Versão com integração de WhatsApp via Evolution API rodando fora da Vercel.

## Fluxo atual

Landing Page -> `/api/leads` -> Supabase -> CRM/Funil -> Inbox -> Evolution API -> WhatsApp.

## Variáveis principais na Vercel

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://147.15.89.173:8080
EVOLUTION_API_KEY=nextlead_api_2026
EVOLUTION_INSTANCE=nextlead
WHATSAPP_WEBHOOK_SECRET=nextlead_webhook_2026
```

Mantenha também as variáveis que já existiam:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://nextlead-crm.vercel.app
NEXT_PUBLIC_DEFAULT_PIPELINE_ID=00000000-0000-0000-0000-000000000001
NEXTLEAD_AUTH_SECRET=
NEXTLEAD_ANTHONY_PASSWORD=
NEXTLEAD_FELIPE_PASSWORD=
NEXTLEAD_ALLOWED_ORIGINS=*
```

## Depois do deploy

1. Entre no CRM.
2. Vá em `Setup`.
3. Clique em `Configurar webhook Evolution`.
4. Teste envio pelo painel de teste.
5. Envie uma mensagem para o WhatsApp conectado e confira se ela aparece no Inbox.

## Rotas úteis

```txt
/api/debug/whatsapp
/api/whatsapp/evolution/status
/api/whatsapp/send
/api/whatsapp/webhook
```

## Observação

A Evolution API não oficial depende da sessão do WhatsApp Web. Use para atendimento manual/comercial e evite disparos em massa para reduzir risco de bloqueio.
