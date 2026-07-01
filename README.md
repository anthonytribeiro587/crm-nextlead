# NextLead CRM

Pacote: inbox com anexos separados, microfone estilo WhatsApp, leitura de novas mensagens, mídia recebida resolvida sob demanda e dashboard repaginada.

## Deploy

Suba os arquivos no GitHub e aguarde o deploy da Vercel.

## Testes principais

1. Abra `/inbox`.
2. Clique em uma conversa com etiqueta verde de mensagem nova: a bolinha deve sumir após abrir.
3. Clique no `+` do campo de mensagem: deve aparecer somente anexo de imagem/vídeo/arquivo.
4. Clique no botão de microfone: inicia gravação e mostra contador; clique novamente para enviar.
5. Em áudio recebido, clique em `Carregar áudio` quando aparecer. O CRM tenta buscar o base64 pela Evolution para o player tocar corretamente.
6. Abra `/` e confira a dashboard nova.

## Observações

Mídia recebida antiga só toca/abre se a Evolution conseguir resolver a mensagem via `getBase64FromMediaMessage`. Mídias enviadas pelo CRM continuam salvas no histórico como data URL.

## Atualização v6 - Funil com múltiplos pipelines

- O funil agora permite escolher o pipeline ativo.
- É possível criar novos pipelines por modelo: Comercial, Protótipos, Ordem de Serviço ou Personalizado.
- Cada pipeline possui etapas próprias, sem misturar protótipos com venda comercial.
- O botão `+ Oportunidade` cria uma oportunidade no pipeline selecionado.

Antes de usar em produção, rode no Supabase:

```sql
scripts/migration-v4-multiple-pipelines.sql
```
