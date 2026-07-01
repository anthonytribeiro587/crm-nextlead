# NextLead CRM — Inbox tempo quase real + mídias

Pacote incremental focado no Inbox:

- Atualização automática das conversas sem precisar F5.
- Botão `+` do campo de mensagem agora abre anexos/mídia.
- Envio de imagem, vídeo, áudio e arquivos via Evolution API.
- Gravação de áudio pelo navegador e envio para o cliente.
- Botão `+` da lista de conversas continua criando contato rápido.
- Ajuste de altura do Inbox no desktop para o botão Enviar ficar visível.

## Arquivos alterados

- `components/InboxClient.tsx`
- `app/inbox/page.tsx`
- `app/api/inbox/route.ts`
- `app/api/whatsapp/send-media/route.ts`
- `lib/whatsapp.ts`
- `app/globals.css`

## Observações

O envio de mídia usa a Evolution API. A visualização de mídias recebidas depende do webhook da Evolution entregar URL/base64 no payload. Se a Evolution não enviar a mídia no webhook, o CRM ainda mostra o marcador `[áudio]`, `[imagem]`, `[vídeo]` etc.
