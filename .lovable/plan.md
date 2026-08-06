# Filtros dentro do card azul e dock mais enxuto

Reorganização da área de comando do módulo "Cronograma e Eventos": o card branco de filtros desaparece, o botão "Filtros" passa a viver dentro do card azul "Progresso do ciclo" e os seletores de visão descem um pouco para melhorar o respiro da tela.

## 1. Card branco de filtros removido

- A faixa branca que hoje contém apenas o botão "Filtros" e a linha "135 de 135" deixa de existir.
- A linha de status (contador, chips de filtros ativos, "Limpar tudo") sai desta visualização — conforme definido, não é necessária aqui. O contador de resultados continua visível dentro do painel de filtros quando aberto, e os filtros ativos seguem sinalizados pelo badge dourado no próprio botão.

## 2. Botão "Filtros" dentro do card azul

- O botão passa a ficar ancorado no card azul "Progresso do ciclo", à esquerda do bloco de título, na mesma linha de "PROGRESSO DO CICLO / Ciclo 2026–2028", com o indicador de etapa (1/3) permanecendo à direita.
- Tratamento visual adaptado ao fundo navy: pílula translúcida (vidro), borda dourada sutil, tipografia firme em creme, badge dourado com a contagem de filtros avançados ativos e o rótulo do período atual ("Todo o ciclo") como texto secundário.
- Estados: hover com leve elevação, aberto com destaque dourado e ícone inclinando/rotacionando suavemente. O painel continua abrindo lateralmente com a animação já existente.
- Nas visões sem o card do ciclo (Dashboard, Eventos concluídos, Pendências, Calendário), o mesmo card azul compacto é exibido no topo da área de conteúdo, mantendo o botão "Filtros" à esquerda e a identidade visual consistente entre todas as visões.

## 3. Seletores de visão mais baixos e melhor ajustados

- O dock fixo (Dashboard, Linha do tempo, Eventos concluídos, Pendências, Calendário) ganha um deslocamento vertical maior em relação ao cabeçalho, descendo alguns pixels e criando separação clara entre cabeçalho e conteúdo.
- Com o card branco removido, o dock fica com apenas uma linha, mais leve e alinhado à largura do conteúdo.

## Detalhes técnicos

- `CronogramaEventosPage.tsx`: remover `CronogramaFiltersBar` do `cronograma-command-dock`; ajustar `sticky top-[72px]`/paddings para o novo espaçamento. Passar `filters`, `events`, `onChange`, `onClear`, `resultCount`, `syncing` para o novo slot de filtros do card do ciclo.
- Extrair o gatilho + painel do `CronogramaFiltersBar.tsx` para `CronogramaFiltersTrigger.tsx` (mesmo `Popover`, mesmas seções "Período" e avançadas). `CronogramaFiltersBar` deixa de ser usado no desktop; a linha de status é descartada junto (mantendo `buildActiveChips` apenas para a contagem do badge).
- `TimelineCycleNavigator.tsx`: aceitar prop opcional `filtersSlot` renderizada no `cronograma-cycle-heading`, à esquerda do título; ajustar o header para `flex` em 3 blocos (filtros / título / etapa) com quebra em telas estreitas.
- Novo componente leve `CronogramaCycleBar.tsx` (mesma casca navy do card do ciclo, sem lista de anos) renderizado nas visões que não usam a timeline.
- Estilos: novo bloco em `src/styles/cronograma-timeline-flagship.css` para o gatilho sobre navy (`.cronograma-cycle-filter-trigger`), revisando conflitos em `cronograma-timeline-recovery.css` e `cronograma-operational-overrides.css`; remover regras órfãs de `.cronograma-filter-surface`/`.cronograma-filter-status-row` em `src/index.css`.
- Mobile permanece com `MobileCronogramaFilters` como está.
- Validação com Playwright em 1440x900 e 390x844: abrir/fechar o painel a partir do card azul, aplicar período, alternar entre as cinco visões e conferir ausência de overflow horizontal e de saltos de layout.
