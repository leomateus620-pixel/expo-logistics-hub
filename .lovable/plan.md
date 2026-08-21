# Upgrade dos 5 cards de indicadores — Dashboard Agenda Fenasoja

Reconstrução completa da faixa superior de KPIs (`ExecutiveKpis` em `CronogramaDashboardBoard.tsx`) em cinco cards de duas camadas, com física de rolagem real, dados reais e atualização imediata.

## Fonte de dados (sem mock, sem segunda verdade)

Todos os indicadores derivam do mesmo array de eventos já carregado pela Agenda (`useCronogramaEventos` → `useCronogramaDashboardData` → `buildCronogramaDashboardModel`), com os mesmos IDs, RLS e regras. Reaproveito as funções já existentes:

- elegibilidade / concluído / ativo / atrasado / sem data: `isOperationallyEligible`, `isCompletedEvent`, `isActiveEvent`, `isOverdueEvent`, `getEventDeadline`
- comissões: `commissionKeysOf`, `normalizeKey`, `UNASSIGNED_KEY` de `cronograma-commission-distribution.ts` (mesma regra do gráfico de comissões), apenas com recorte no mês atual e exclusão de "sem comissão"
- pessoas: `responsiblesRel` (agrupamento por `userId`, com fallback por nome canônico via `memberIdentity`) e avatares por `PersonAvatar`
- locais: campo `location` normalizado (acentos/caixa/espaços) para não duplicar por variação textual
- datas: timezone América/São_Paulo já usado pelo módulo (`getTodayKey`, chaves `YYYY-MM-DD`), semana de segunda a domingo

## Camada de agregação

Novo arquivo `src/lib/cronograma-kpi-metrics.ts` + hook `src/hooks/useAgendaDashboardMetrics.ts` (memoizado sobre os eventos já em cache), entregando:

```text
progress   { global, currentMonth }
events     { completed, overdue }
people     { mostAssigned, nextEvents }
calendar   { currentWeekCount, weekRangeLabel, busiestDaysCurrentMonth }
commissions{ topCurrentMonth }
locations  { topCurrentMonth }
```

Cada bloco carrega também os `eventIds` para manter o drill-down atual para a timeline.

## Os cinco cards (primária ↓ secundária)

1. Progresso geral (%, concluídos/elegíveis, arco de progresso) ↓ Progresso do mês (% do mês, concluídos/total, delta discreto vs. geral)
2. Eventos concluídos (total + concluídos no mês) ↓ Eventos atrasados (regra real: ativo, com prazo válido, prazo vencido)
3. Pessoas com mais eventos (top 3 com avatar real/iniciais + contagem) ↓ Próximo evento futuro de cada uma (título, data, hora quando existir)
4. Eventos nesta semana (número + intervalo "17–23 AGO") ↓ Top 5 dias do mês com mais eventos, com barras proporcionais e desempate cronológico
5. Top 5 comissões do mês (barras proporcionais, sem "Sem comissão") ↓ Locais com mais eventos no mês

Clique no conteúdo continua abrindo o drill-down existente na timeline; o gesto vertical não dispara clique.

## Interação física (núcleo da feature)

Hook próprio `src/hooks/useCardLayerScroll.ts`, sem nova dependência (não há framer-motion no projeto):

- track de velocidade por ponteiro/roda, integração spring-damper em `requestAnimationFrame`
- snap para 0 ou 1 por posição + velocidade, resistência no overscroll, elasticidade mínima
- apenas `transform: translate3d` e `opacity`; conteúdo de saída perde levemente nitidez/opacidade
- captura do gesto só com intenção vertical clara e quando ainda há camada para revelar — caso contrário o scroll da página segue normal (`touch-action` ajustado, sem `preventDefault` agressivo)
- suporte a teclado (setas/Tab) e `prefers-reduced-motion` (transição curta sem física)
- indicador de camada em dois pontinhos, clicável, como único controle de retorno

## Design

Novo arquivo `src/styles/cronograma-kpi-cards.css` (tokens existentes do design system, sem cores hardcoded): stroke sutil + highlight superior, sombra ambiente difusa e contact shadow, variação leve em hover/press, tipografia em três níveis (métrica / título / contexto), grid de 5 colunas no desktop, 2–3 no tablet e cards mais altos no mobile. Entrada com stagger de ~40 ms e contadores animados apenas quando o valor muda.

## Estados

Skeletons com a mesma altura/estrutura dos cards (sem layout shift) e empty states compactos ("Nenhum evento neste período") por camada, nunca `NaN`/`0/0`.

## Atualização

Reutiliza o cache/invalidância já existente da Agenda; nenhuma consulta nova, nenhum polling. As métricas recalculam via memo quando a lista de eventos muda (criação, edição, exclusão, mudança de data/status/responsável/comissão/local).

## Arquivos

- novos: `src/lib/cronograma-kpi-metrics.ts`, `src/hooks/useAgendaDashboardMetrics.ts`, `src/hooks/useCardLayerScroll.ts`, `src/components/cronograma-eventos/dashboard/kpi/*` (card base + 5 cards), `src/styles/cronograma-kpi-cards.css`
- alterado: `CronogramaDashboardBoard.tsx` (substitui `ExecutiveKpis`)
- inalterado: seletores existentes, painéis de Volume, Horários e Comissões, RLS e banco

## Validação

Testes unitários dos agregadores (mês atual, semana seg–dom, empates, exclusão de "sem comissão", pessoas por ID, próximo evento não concluído), typecheck e verificação visual em desktop e mobile.
