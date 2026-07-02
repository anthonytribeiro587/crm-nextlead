# NextLead CRM — Funil operacional v9

Commit sugerido: `funil operacional visual v9`

Alterações:
- Funil com leitura mais operacional e menos poluída.
- Resumo do pipeline reorganizado em KPIs compactos.
- Filtros mais claros e opção Kanban/Lista.
- Card de “próximo movimento” para priorizar atendimento.
- Cards do Kanban mais compactos, com ações organizadas.
- Preparação visual para o próximo módulo de pipelines por processo.

Depois do deploy, testar:
1. Abrir `/funil`.
2. Mover uma oportunidade entre etapas.
3. Abrir atendimento pelo card.
4. Editar valor/previsão.
5. Alternar Kanban/Lista.
6. Filtrar por responsável, temperatura e prazo.

## Patch: funil operacional + múltiplos pipelines

1. Suba este pacote no repositório `crm-nextlead`.
2. Rode `scripts/migration-v4-multiple-pipelines.sql` no Supabase.
3. Faça deploy na Vercel.
4. Teste `/funil`: criar pipeline, alternar pipeline, criar oportunidade e mover card.

## Commit sugerido v11

```txt
funil pipelines editaveis v11
```

Depois do deploy, testar:
1. Abrir `/funil`.
2. Conferir se as colunas ficam lado a lado.
3. Clicar em `+ Pipeline`.
4. Editar nomes e cores das etapas.
5. Adicionar/remover etapas.
6. Criar pipeline e trocar no seletor.

## Patch v12 obrigatório para múltiplos pipelines no Inbox

1. Suba o código atualizado.
2. No Supabase, rode `scripts/migration-v5-deals-pipeline-context.sql` depois da migration v4.
3. Faça o deploy na Vercel.
4. Teste um lead em pipeline personalizado pelo `/inbox`.

O objetivo é impedir que o Inbox use etapas fixas do Comercial quando a oportunidade estiver em outro pipeline.

## v14.4 — Automações

Após deploy, rode a migration:

```sql
scripts/migration-v7-automations-sdr.sql
```

Depois acesse **Administração > Automações** e deixe o SDR inicialmente em **Sugerir resposta**. Só use **Automático SDR** depois de testar bastante e configurar:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
NEXTLEAD_ENABLE_AUTO_SDR=true
```
