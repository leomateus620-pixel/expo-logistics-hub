# Pendências — nova regra e nova UI (Cronograma e Eventos)

## Objetivo
A visão **Pendências** passa a registrar **todos os eventos que não foram concluídos nem cancelados** (`status ≠ completed` e `status ≠ cancelled`), com ou sem data. A UI atual de "decisões" (bloco âmbar "Decisão pendente" + caixa "Motivo", agrupada por categoria, contagem "N decisões") é removida dessa visão e substituída por um fluxo organizado por urgência.

## Nova regra de negócio
- Entram na Pendências: `confirmed`, `planned`, `in_progress`, `overdue`, `rescheduled`, `undated`, `in_definition`, `blocked`.
- Nunca entram: `completed` e `cancelled`.
- Os filtros globais da página (busca, ano, status, comissão etc.) continuam valendo — a regra de exclusão de concluídos/cancelados é aplicada **depois** deles, sempre.

## Nova estrutura da visão (desktop e mobile — mesmo componente)
1. **Cabeçalho "Pendências"** com contadores: total de eventos pendentes, quantos atrasados, quantos sem data definida.
2. **Seção "Atrasados"** — eventos com data passada não concluídos/cancelados (detecção via `isCronogramaEventOverdue`), ordenados do mais antigo ao mais recente, com acento visual de alerta.
3. **Seção "Programados"** — eventos com data futura, agrupados por **ano → mês** (grupos de mês recolhíveis, no mesmo padrão da Timeline), ordenados por data.
4. **Seção "Sem data definida"** — eventos sem data, ordenados por prioridade (crítica → baixa), exibindo a linha de motivo (`pendingReason` / `decisionNeeded`) de forma discreta no card.
5. **Estado vazio** elegante quando não houver pendências com os filtros atuais.

## Card utilizado
- Reuso do `CronogramaEventCard` padrão do módulo (data/hora, categoria, status, prioridade, responsável, ações Detalhes/Editar) — mesma linguagem visual da Timeline e do Dashboard, sem a UI "decisão/motivo" atual.
- Extensão mínima: prop opcional `contextNote` para exibir o motivo nos cards da seção "Sem data definida".
- O card antigo `UndatedDecisionCard` deixa de ser usado nesta visão (permanece apenas no atalho "Pendências sem data" do Dashboard, que continua correto).

## O que não muda
- Rota/valor da visão `?view=undated` e o rótulo "Pendências" no seletor.
- Demais visões (Dashboard, Timeline, Concluídos, Calendário).

## Detalhes técnicos
- `src/components/cronograma-eventos/CronogramaBoards.tsx`: reescrever `UndatedBoard` com a nova regra (`status !== 'completed' && status !== 'cancelled'`), seções Atrasados/Programados/Sem data, contadores e empty state; removidos os textos "decisões"/"Decisão pendente"/"Motivo" desta visão.
- `src/components/cronograma-eventos/EventCards.tsx`: adicionar prop opcional `contextNote` em `CronogramaEventCard`.
- `src/pages/CronogramaEventosPage.tsx`: passar `todayKey` ao `UndatedBoard` (necessário para separar atrasados de programados).
- Reuso de `isCronogramaEventOverdue` (`src/lib/cronograma-timeline.ts`) e `compareEventDates` (`dateUtils`).
- Verificação: build + abrir `?view=undated` no preview confirmando que concluídos/cancelados não aparecem e que as três seções renderizam corretamente.
