# Agenda FenaSoja — realocação do "Novo evento", destaque da preparação e aproveitamento de tela

## 1. "Novo evento" sai do topo e vira ação primária da sidebar

- Remover o botão do cabeçalho azul (desktop e mobile).
- Passar a renderizá-lo no topo da slide bar lateral, acima do bloco "Navegação": botão largura total, laranja/ouro, altura confortável, ícone + rótulo.
- Sidebar recolhida: vira botão só com ícone (tooltip "Novo evento").
- Mobile: o botão aparece no topo do drawer de navegação, na mesma posição lógica, e fecha o drawer ao criar.

## 2. Barra de preparação 2026—2028 ganha o espaço liberado

- O indicador de preparação deixa de ser uma pílula estreita e passa a ocupar a faixa livre do topo: percentual em destaque, rótulo do ciclo e barra de progresso horizontal legível.
- Mantém o popover atual com data de abertura oficial.
- O botão do Google Agenda desloca-se levemente para a direita, com espaçamento equilibrado entre "Resumo da semana", preparação e sair.
- Em notebook/tablet a barra reduz de forma graciosa; em mobile continua compacta.

## 3. Remover o cabeçalho de mês duplicado

- Eliminar o bloco superior "Agosto de 2026 / ESTRUTURAÇÃO" que fica acima da timeline; permanecem ali apenas "Ir para hoje" e as setas de navegação, alinhadas à direita.
- O bloco principal do mês (dentro da timeline) assume o papel de cabeçalho: título maior, etapa como legenda, contadores (eventos / concluídos / pendentes) mais legíveis e "Recolher" à direita.

## 4. e 5. Eliminar as faixas brancas laterais

- A área de trabalho passa a usar toda a largura do viewport com paddings coerentes, removendo o limite central que hoje cria vazios nas laterais em zoom 80–100%.
- Sidebar encaixada à esquerda sem margem sobrando; a timeline expande no restante do espaço.
- Revisar paddings/margens dos containers internos para que cartões de evento cheguem próximos às bordas úteis, sem overflow horizontal.
- Aplicar a mesma correção às demais visões do módulo (Dashboard, Pendências, Calendário, Concluídos), para consistência.
- Mobile: mesma lógica de navegação, com respiro lateral único e sem rolagem horizontal.

## 6. Validação

- Playwright em 1920, 1440, 1185, 1024, 768 e 390px: capturas antes/depois, verificação de ausência de faixas vazias e de overflow, clique em "Novo evento" a partir da sidebar e do drawer, troca de visões e de ano, abertura dos filtros, console limpo.

## Detalhes técnicos

- `CronogramaModuleShell.tsx`: remover o `cronograma-command-create`; reordenar o lado direito da barra (resumo → preparação expandida → Google → sair).
- `CronogramaPreparationPill.tsx`: nova variante "bar" (percentual + trilho de progresso), mantendo o popover.
- `CronogramaSideNav.tsx` e `mobile/MobileCronogramaNavDrawer.tsx`: novo bloco de ação primária consumindo `useCronogramaShell().createAction`.
- `CronogramaTimelineBoard.tsx`: remover o cabeçalho `cronograma-temporal-nav` duplicado (mês + etapa), preservando navegação; refinar o cabeçalho do mês principal.
- `CronogramaEventosPage.tsx`: substituir `mx-auto max-w-[1680px]` por container fluido com paddings responsivos.
- CSS em `cronograma-refino.css` / `cronograma-command-layer.css`: ajustes de largura, gaps e limpeza das regras órfãs do botão do topo e do cabeçalho removido. Somente tokens navy/ouro/laranja.
