# Agenda Fenasoja — remover a faixa branca acima do mês e enxugar a navegação

## 1. Remover o card vazio acima do mês

A faixa clara logo acima de "Agosto de 2026 / Estruturação" é a antiga barra temporal da timeline. Depois que os filtros e os chips de ano foram movidos para a slide bar lateral, ela ficou praticamente vazia — sobraram só "Ir para hoje" e as setas, flutuando numa faixa branca larga.

Mudança:
- Eliminar essa faixa da timeline (e da visão "Histórico concluído", que usa a mesma barra).
- O cabeçalho principal do mês passa a ser o único cabeçalho: "Agosto de 2026 · Estruturação · Mês atual", com destaque tipográfico maior e selo de mês atual quando aplicável.
- A timeline sobe na dobra, sem espaço morto entre o topo e o primeiro mês.

## 2. "Ir para hoje" e setas bem pequenos no topo

- Mover "Ir para hoje" e as setas de período para a barra superior azul, à direita, imediatamente antes do ícone de Sair.
- Formato compacto: botão pequeno com ícone de calendário e rótulo curto ("Hoje" em telas menores), setas em botões-ícone reduzidos, na mesma altura dos demais controles do topo.
- Estados desabilitados preservados quando não há mês anterior/próximo; foco e rótulos acessíveis mantidos.
- No mobile, os mesmos controles ficam na linha compacta do topo, com alvos de toque adequados (sem faixa extra na timeline).

## 3. Alinhamento lateral (esquerda e direita)

- Padronizar o mesmo gutter horizontal para barra superior, slide bar e conteúdo, para que a lateral esquerda da slide bar e a lateral direita da timeline encostem no mesmo eixo do topo.
- Remover os limites de largura remanescentes que ainda geram faixas brancas em telas largas e em zoom 80%.
- Aplicar o mesmo alinhamento em todas as visões internas: Timeline, Dashboard, Pendências, Calendário e Histórico concluído — hoje elas herdam containers diferentes.
- Garantir ausência de rolagem horizontal em 1280, 1440, 1185, 1024 e 390px.

## 4. Validação

Playwright em 1440, 1185, 1024 e 390px, com zoom 80% e 100%: screenshots de cada visão, checagem de que não existe mais a faixa vazia, que "Ir para hoje" e as setas funcionam a partir do topo, e que não há overflow lateral nem erros de console.

## Detalhes técnicos

- `CronogramaShellContext.tsx`: adicionar um slot de navegação temporal (registro de `goToToday`, `goToMonth`, `previousMonth`, `nextMonth`) no mesmo padrão do `createAction`.
- `CronogramaTimelineBoard.tsx`: remover o `<nav class="cronograma-temporal-nav">` e registrar a navegação no shell; reforçar o cabeçalho principal do mês.
- `CronogramaModuleShell.tsx`: renderizar os controles compactos de período antes do botão Sair (desktop) e na linha mobile.
- CSS: limpar as regras de `.cronograma-temporal-nav` em `cronograma-refino.css`, `cronograma-timeline-recovery.css`, `cronograma-timeline-flagship.css`, `cronograma-operational-overrides.css` e `cronograma-command-layer.css`; remover `max-width: 1760px` da camada de comando e unificar os gutters do `cronograma-workbench` e das demais visões.
