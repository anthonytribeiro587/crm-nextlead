# NextLead CRM WhatsApp + Funil

CRM próprio da NextLead em Next.js, com Supabase, login, funil comercial, entrada de leads por landing page e preparação para WhatsApp Cloud API oficial da Meta.

## Onde paramos nesta versão

Versão v5: próximo passo focado em WhatsApp Meta.

Fluxo principal já funcionando:

```txt
Landing Page -> /api/leads -> Supabase -> CRM -> Funil
```

Incluído até aqui:

- Login protegido para Anthony e Felipe.
- CRM lendo contatos reais do Supabase.
- Funil lendo oportunidades reais do Supabase.
- Arrastar cards entre etapas.
- Editar oportunidade.
- Fechar oportunidade.
- Excluir lead de teste.
- Endpoint `/api/leads` com CORS para receber leads de landing pages reais.
- Landing real da NextLead já validada com o CRM.
- Inbox com envio manual via `/api/whatsapp/send`.
- Webhook `/api/whatsapp/webhook` para validação e recebimento de mensagens da Meta.
- Página de Setup com status das variáveis, callback URL e teste de envio.
- Rota `/api/debug/whatsapp` para diagnosticar credenciais da Meta na Vercel.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Variáveis da Vercel

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_KEY_LEGACY
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY_LEGACY
NEXT_PUBLIC_APP_URL=https://nextlead-crm.vercel.app
NEXT_PUBLIC_DEFAULT_PIPELINE_ID=00000000-0000-0000-0000-000000000001

NEXTLEAD_AUTH_SECRET=troque-por-uma-frase-secreta-grande
NEXTLEAD_ANTHONY_PASSWORD=sua-senha-anthony
NEXTLEAD_FELIPE_PASSWORD=sua-senha-felipe

NEXTLEAD_ALLOWED_ORIGINS=*
NEXTLEAD_LEADS_API_KEY=

META_GRAPH_VERSION=v20.0
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

## Supabase

Se o projeto é novo, rode:

```txt
scripts/schema.sql
```

Se você já tinha rodado o schema anterior, rode também:

```txt
scripts/migration-v2-leads-completos.sql
```

A versão v5 não exige SQL novo.

## WhatsApp Cloud API

Após configurar as variáveis de WhatsApp na Vercel e fazer redeploy, abra:

```txt
https://nextlead-crm.vercel.app/configuracoes
```

Use o Callback URL informado na página:

```txt
https://nextlead-crm.vercel.app/api/whatsapp/webhook
```

No painel da Meta, o Verify Token precisa ser exatamente o mesmo valor de:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

Depois assine o evento `messages` no webhook da Meta.

Para conferir se as variáveis subiram na Vercel:

```txt
https://nextlead-crm.vercel.app/api/debug/whatsapp
```

## Endpoint para landing pages

```js
fetch("https://nextlead-crm.vercel.app/api/leads", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Nome do Lead",
    phone: "51999999999",
    company: "Academia Exemplo",
    source: "Landing Page Academia",
    interest: "Orçamento de Landing Page",
    value: 1200,
    temperature: "quente",
    owner: "Anthony",
    expectedCloseDate: "2026-07-05",
    tags: "site, orçamento",
    notes: "Lead veio pelo formulário da página."
  })
});
```

## Próximas etapas recomendadas

1. Configurar app da Meta e validar webhook.
2. Testar envio real pelo Setup ou Inbox.
3. Testar recebimento real no Inbox.
4. Criar templates aprovados para mensagens fora da janela de atendimento.
5. Criar automações de follow-up.
