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

## Ajuste v11 - Funil com pipelines editáveis

- Kanban voltou a manter as colunas lado a lado com rolagem horizontal quando necessário.
- Criação de pipeline permite editar etapas antes de salvar.
- Cada etapa pode ter nome e cor próprios.
- É possível adicionar, remover e reordenar etapas no modal de criação.

## Ajuste v12 - Inbox respeitando o pipeline do lead

- O select de etapa dentro do Inbox não usa mais uma lista fixa do funil comercial.
- A etapa exibida agora vem do funil da oportunidade selecionada.
- O cabeçalho do atendimento mostra `Funil / etapa`.
- O painel lateral ganhou o campo `Funil`, permitindo mover a oportunidade para outro processo.
- Ao trocar de funil, a oportunidade entra automaticamente na primeira etapa daquele pipeline.
- O envio de proposta move o lead para a etapa de proposta/orçamento do próprio funil atual, quando existir.
- Novas entradas vindas de formulário/WhatsApp não jogam uma oportunidade aberta de volta para o funil comercial.

Antes de usar em produção com banco real, rode também:

```sql
scripts/migration-v5-deals-pipeline-context.sql
```

## Commit sugerido v12

```txt
inbox pipeline context v12
```

Depois do deploy, testar:
1. Criar um novo pipeline em `/funil` com etapas diferentes do Comercial.
2. Criar/mover uma oportunidade para esse pipeline.
3. Abrir o lead no `/inbox`.
4. Conferir se aparece o nome do funil correto no topo.
5. Alterar a etapa dentro do Inbox e confirmar que só aparecem etapas daquele funil.
6. Trocar o campo `Funil` no painel lateral e confirmar que o lead foi para a primeira etapa do novo pipeline.

## v14.4 — Automações + SDR Foundation

Esta versão adiciona a aba **Automações** no menu de Administração e cria a base do Agente SDR NextLead.

Antes de usar em produção, rode no Supabase:

```sql
scripts/migration-v7-automations-sdr.sql
```

Variáveis opcionais para IA externa com Gemini:

```env
GEMINI_API_KEY=sua_chave_do_gemini
GEMINI_MODEL=gemini-1.5-flash
```

Por segurança, o modo automático só envia mensagens se esta variável estiver explicitamente ativa:

```env
NEXTLEAD_ENABLE_AUTO_SDR=true
```

Sem `GEMINI_API_KEY`, o SDR funciona com análise local simples e modo sugestão.

## v14.5 — Automações SDR UX

A tela de Automações foi simplificada para o uso do Agente SDR NextLead.

### Ativar banco de automações

Rode no Supabase:

```sql
scripts/migration-v7-automations-sdr.sql
```

### Ativar Gemini

No Google AI Studio, gere uma chave de API e adicione na Vercel:

```env
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-1.5-flash
```

Depois faça redeploy.

### Modos do SDR

- Desligado: não analisa nem sugere.
- Sugerir resposta: recomendado para testes. A IA gera a sugestão e o atendente envia manualmente.
- Responder automático: exige `NEXTLEAD_ENABLE_AUTO_SDR=true` e deve ser usado só depois de validar a qualidade das respostas.


### v15.8 SDR State Machine

Depois da v15.8, rode no Supabase:

```sql
scripts/migration-v8-sdr-state-machine.sql
```

Essa migration cria `sdr_states`, que guarda o estado do agente SDR por contato e evita perguntas repetidas.
