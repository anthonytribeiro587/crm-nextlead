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
