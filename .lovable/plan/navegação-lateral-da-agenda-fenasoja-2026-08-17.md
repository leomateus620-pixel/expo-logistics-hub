# Navegação lateral da Agenda FenaSoja

Substituir a barra horizontal de navegação (Timeline, Dashboard, Pendências, Calendário, Histórico concluído) por uma slide bar lateral compacta à esquerda do conteúdo, reunindo também os anos 2026–2028 e o bloco Filtros. A timeline passa a ocupar toda a largura e altura restante.

## Desktop

Nova coluna fixa à esquerda (largura ~208px, colapsável para ~64px só com ícones), alinhada ao topo da área de conteúdo e sticky ao rolar:

```text
┌────────────┬──────────────────────────────────┐
│ NAVEGAÇÃO  │  Agosto de 2026 · ESTRUTURAÇÃO   │
│ Timeline   │  ┌────────────────────────────┐  │
│ Dashboard  │  │ eventos ...                │  │
│ Pendências │  │                            │  │
│ Calendário │  │                            │  │
│ Concluídos │  │                            │  │
│ ─────────  │  │                            │  │
│ CICLO      │  │                            │  │
│ 2026 47/104│  │                            │  │
│ 2027 51/66 │  │                            │  │
│ 2028 40/49 │  │                            │  │
│ ─────────  │  │                            │  │
│ [Filtros]  │  └────────────────────────────┘  │
└────────────┴──────────────────────────────────┘
```

- Itens de menu: ícone + label, altura confortável, estado ativo com fundo navy sólido, texto claro e barra de acento dourada à esquerda; hover suave; foco visível.
- "Histórico concluído" vira o quinto item da lista (mesmo toggle de hoje).
- Anos: bloco "Ciclo" logo abaixo, cada ano em linha própria com contagem `filtrados/total` e etapa; ativo em destaque navy/ouro; anos indisponíveis desabilitados.
- Filtros: bloco ao final da sidebar, com rótulo, contador de resultados e o popover atual — visual premium (vidro claro, borda dourada quando há filtro ativo), sem cinza apagado.
- Botão de recolher/expandir a sidebar no topo dela, com preferência guardada em `localStorage`.
- Cabeçalho de mês, "Ir para hoje" e as setas de navegação permanecem no topo da timeline, agora sem os chips de ano.

## Mobile

- Sidebar vira um painel deslizante (drawer da esquerda) acionado por um botão compacto "Navegação" na barra de comando, com os mesmos blocos (menus, ciclo, filtros) e fechamento ao selecionar.
- Fora do drawer permanece apenas uma linha enxuta: botão de navegação + rótulo da visão ativa + ano atual, liberando altura para a timeline.
- Filtros continuam acessíveis também pelo drawer; o overlay atual de filtros mobile é reaproveitado.

## Detalhes técnicos

- Novo componente `CronogramaSideNav.tsx` (desktop) e `MobileCronogramaNavDrawer.tsx`, ambos consumindo a mesma lista `CRONOGRAMA_VIEW_DEFINITIONS` mais o item "Histórico concluído".
- `CronogramaEventosPage.tsx`: trocar `cronograma-workbench-bar` por um layout de duas colunas (`grid` com coluna fixa + `min-w-0`), mantendo `CronogramaFiltersSlotProvider` e `CronogramaCycleSlotProvider`; o alvo do slot de ciclo e o slot de filtros passam a ficar dentro da sidebar.
- `CronogramaTimelineBoard.tsx`: remover o portal de chips de ciclo e o slot de filtros do cabeçalho interno (passam a ser renderizados pela sidebar), mantendo mês/etapa e navegação.
- `CronogramaSecondaryNav.tsx` e `MobileCronogramaNavigation.tsx` são aposentados; o teste `src/test/cronogramaMobilePresentation.test.tsx` será atualizado para o novo componente mobile.
- Estilos novos em `src/styles/cronograma-command-layer.css` / `cronograma-refino.css` usando tokens navy/ouro/laranja já existentes; limpar as regras órfãs da barra horizontal.
- Validação com Playwright em 1440px, 1185px, 1024px e 390px: estados ativo/hover, cliques em cada visão, troca de ano, abertura do popover de filtros e ausência de erros de console.
