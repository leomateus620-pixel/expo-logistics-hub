# Pendências — só atrasados, limpeza de feriados e header sem scroll preso

## Objetivo

A visão **Pendências** (Agenda Fenasoja → Cronograma e Eventos) hoje gera uma rolagem gigante porque lista tudo: atrasados, programados futuros e os 28 eventos sem data. O menu deve voltar ao objetivo original: mostrar o que está **atrasado e exige ação agora**. Em paralelo, remover do sistema todas as datas de **feriados** (30 eventos semeados em 2026/2027/2028) e corrigir o **card azul do cabeçalho** ("Visão operacional / Pendências") que hoje fica grudado no topo acompanhando a rolagem.

## Mudanças

### 1. Visão Pendências — apenas eventos atrasados

Arquivo: `src/components/cronograma-eventos/CronogramaBoards.tsx` (`UndatedBoard`)

- **Remover a seção "Programados"** (grupos por ano/mês com collapses) — eventos futuros não são pendência.
- **Remover a seção "Sem data definida"** — eventos sem data não aparecem mais neste menu.
- Manter apenas a seção **"Atrasados"**: eventos com data passada, status diferente de concluído/cancelado, ordenados do mais antigo (maior atraso) para o mais recente, com o acento vermelho de alerta já existente.
- **Cabeçalho simplificado**: título "Pendências", descrição ajustada para "Eventos passados que ainda não foram concluídos nem cancelados" e um único contador em destaque ("N atrasados"). Saem os blocos "pendentes" e "sem data", que perdiam o sentido sem as seções.
- **Estado vazio**: quando não houver atrasados, mostrar "Nenhum evento atrasado — tudo em dia" em vez de seções vazias.
- Limpar o código morto resultante: memos `scheduled`, `undated`, `scheduledByYear`, estado de collapse `openMonths` e imports não usados (`CalendarClock`, `CalendarX2`, etc.).

Sem mudanças em `CronogramaEventosPage.tsx`: a página já entrega a lista completa e o `todayKey`; o board passa a filtrar só atrasados.

### 2. Limpeza de todas as datas de feriados

Confirmado no banco: 30 eventos de feriado ("Feriado municipal, estadual ou federal"), categoria `Feriados e datas especiais` / tipo `feriado`, espalhados por 2026, 2027 e 2028. Todas as tabelas filhas (subeventos, responsáveis, comissões, anexos, logs, lembretes) têm exclusão em cascata — apagar o evento remove tudo automaticamente.

- **Migração no banco**: apagar todos os eventos com `event_type = 'feriado'` ou categoria `Feriados e datas especiais` (30 registros, com cascata automática nas tabelas filhas).
- **Impedir retorno**: remover os três blocos de feriados (2026, 2027 e 2028) do seed `src/data/fenasoja2028CronogramaSeed.ts`, para que nunca sejam recriados.
- **Remover o tipo do formulário**: tirar `feriado` do seletor de tipos (rótulo "Feriado" em `src/lib/cronograma-eventos.ts`, união de tipos em `types.ts` e mapeamento em `modelAdapter.ts`), impedindo novos cadastros desse tipo.

Resultado: feriados somem da timeline, do calendário, das pendências, do dashboard e de qualquer contagem do módulo.

### 3. Card azul do cabeçalho não acompanha mais a rolagem

Causa confirmada: `.cronograma-module-bar` em `src/index.css` (linha ~1750) está com `position: sticky; top: 0`, o que mantém o card azul ("Visão operacional / Pendências" + Filtros + ciclo) grudado no topo ao rolar a página.

- Remover o comportamento fixo: o card passa a rolar junto com o conteúdo, ficando apenas no topo da página.
- Manter intactos o visual 3D, gradientes, Filtros e o seletor de ciclo — muda apenas o comportamento na rolagem.
- Verificar que nenhum outro elemento da página dependia do espaço/posição do header fixo.

## Detalhes técnicos

- **Board**: `UndatedBoard` em `CronogramaBoards.tsx` passa a computar apenas `overdue = events.filter(status ∉ {completed, cancelled} && isCronogramaEventOverdue(event, todayKey))`, reutilizando `CronogramaEventCard` e o estilo `.cronograma-pending-group.is-overdue` já existentes.
- **Migração SQL** (submetida para aprovação):
  ```sql
  DELETE FROM cronograma_eventos
  WHERE event_type = 'feriado'
     OR category = 'Feriados e datas especiais';
  ```
- **Limpeza de código**: remover `feriado` de `CronogramaEventType` (`types.ts`), de `typeLabels` (`src/lib/cronograma-eventos.ts`), do mapa de adapter (`modelAdapter.ts`) e os 3 spreads `...dated('AAAA-feriados', ...)` do seed.
- **CSS**: em `.cronograma-module-bar`, trocar `position: sticky` por fluxo normal (remover `top`/`z-index` associados).
- `event-reminders` já excluía feriados — nenhum ajuste necessário.

## Validação

1. Typecheck limpo após remover o tipo `feriado` das unions.
2. Playwright em `/cronograma-eventos?view=undated`: conferir que só a seção **Atrasados** aparece (8 eventos hoje), sem "Programados" e sem "Sem data definida"; rolar a página e confirmar que o card azul sobe junto com o conteúdo.
3. Confirmar no banco que nenhum registro de feriado permanece e que timeline/calendário não exibem mais essas datas.
