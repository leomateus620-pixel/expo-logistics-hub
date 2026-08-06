# Filtros dentro do ícone e busca no topo

Reorganização da área de comando do módulo "Cronograma e Eventos": o card de filtros deixa de ocupar espaço próprio, os atalhos de período passam a viver dentro do botão "Filtros", e o buscador sobe para o cabeçalho, ao lado de "Cronograma e Eventos".

## 1. Buscador no cabeçalho

- O campo de busca sai da barra de filtros e passa a ficar no cabeçalho escuro do módulo, à direita do título.
- Visual translúcido sobre o fundo navy: vidro leve, borda sutil, brilho dourado suave que se move sob o texto no foco (animação lenta e discreta, respeitando `prefers-reduced-motion`).
- Ícone de lupa, placeholder curto ("Buscar evento, pessoa, comissão…"), botão de limpar quando há texto.
- Desktop: campo expandido ao lado do título. Mobile: linha própria abaixo do título, largura total, altura 44px.
- Mesmo comportamento atual (debounce de 220ms, chip "Busca:" na linha de status).

## 2. Filtros concentrados no botão "Filtros"

- Os atalhos "Todo o ciclo, Hoje, Semana atual, Próximos 30 dias, Atrasados" saem da barra e entram no painel do botão "Filtros", como primeira seção ("Período"), mantendo exatamente o design atual das pílulas (ícone + rótulo, estado ativo dourado/navy).
- O painel abre lateralmente a partir do ícone (alinhado à direita, deslizando de fora para dentro), com transição de entrada/saída suave (~200ms, escala + deslocamento horizontal).
- Abaixo do período, o conteúdo avançado atual permanece: ano, mês, categoria, status, prioridade, comissão, responsável, recorte temporal, datas e os dois interruptores.
- O botão em si ganha tratamento próprio: pílula com profundidade discreta, tipografia mais firme, contador de filtros ativos em badge dourado, ícone que gira/inclina levemente ao abrir, estado aberto destacado.
- Mobile: o painel abre como drawer inferior (padrão já usado no módulo), com as mesmas seções e alvos de toque de 44px.

## 3. Card de comando mais enxuto

- A barra de filtros perde a linha principal (busca + pílulas) e fica reduzida a: botão "Filtros" + linha de status (`X de Y`, sincronizando, chips ativos, "Limpar tudo").
- O espaço liberado é entregue ao card dos seletores de visão (Dashboard, Linha do tempo, Concluídos, Pendências, Calendário), que passa a respirar mais dentro do dock fixo.
- Nenhuma mudança na lógica de filtragem, contagem ou nos resultados.

## Detalhes técnicos

- Novo contexto leve `CronogramaSearchProvider` em `CronogramaModuleShell.tsx` (o shell é o wrapper de rota em `App.tsx`), com `query`/`setQuery`; `CronogramaEventosPage.tsx` consome e sincroniza com `filters.query`. Fallback silencioso se o contexto não existir.
- Novo componente `CronogramaHeaderSearch.tsx` renderizado no shell (desktop ao lado do título, mobile em linha própria, junto do `WeeklySummaryPill`).
- `CronogramaFiltersBar.tsx`: remover `cronograma-filter-main-row` (busca + pílulas), mover `periodOptions` para dentro do `PopoverContent` como seção "Período"; manter `buildActiveChips` e a linha de status intactos.
- `MobileCronogramaFilters` recebe a mesma reorganização (período dentro do drawer).
- Estilos: novo bloco em `src/styles/cronograma-operational-header.css` para a busca translúcida; ajustes de `.cronograma-filter-surface`, `.cronograma-advanced-filter-trigger` e novas animações do painel em `src/index.css`, revisando também os overrides em `cronograma-timeline-flagship.css`.
- Validação com Playwright em 390x844 e 1440x900: abrir/fechar o painel, aplicar período, buscar pelo cabeçalho e conferir ausência de overflow horizontal.
