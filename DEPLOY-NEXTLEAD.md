# Deploy NextLead CRM

## Antes do deploy

Não altere as variáveis que já estão funcionando:

- Supabase URL
- Supabase Service Role Key
- Evolution API URL
- Evolution API Key
- Evolution Instance
- Webhook Secret

## Novo módulo: Ordens de Serviço

Depois de subir este pacote, rode no Supabase SQL Editor o arquivo:

```txt
scripts/migration-v3-service-orders.sql
```

Isso cria a tabela `service_orders` usada pela tela `/ordens`, pela ficha do contato no `/crm` e pelo botão “Criar OS” no Inbox.

## Testes rápidos

1. Abrir `/crm` e selecionar um contato.
2. Clicar em “Criar OS”.
3. Abrir `/ordens` e alterar o status da OS.
4. Voltar ao `/crm` e conferir se o histórico registrou o evento.
5. Abrir no mobile e conferir a navbar inferior.
