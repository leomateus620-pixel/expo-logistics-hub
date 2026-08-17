# Agenda Fenasoja — refino visual e estrutural (desktop + mobile)

Objetivo: timeline como protagonista, com barra superior coerente, seletor de anos com destaque e identidade (azul, laranja, ouro), filtros com aparência premium e mobile realmente derivado dos componentes atuais do desktop.

## 1. Anos 2026 / 2027 / 2028 na mesma linha de "Concluídos"

Hoje os chips de ano ficam na barra do mês (abaixo), e a linha superior tem só a navegação de ícones + "Histórico concluído".

Mudança:
- Mover o seletor de ciclo para a barra de trabalho superior, alinhado à direita, na mesma linha de "Histórico concluído".
- Manter o tamanho atual dos chips; mudar apenas posição, hierarquia e acabamento.
- Estado ativo: fundo navy profundo, borda em ouro, contagem em ouro/laranja e um sublinhado/indicador animado que desliza entre os anos.
- Microinterações: transição suave de cor/borda (~180ms), leve elevação no hover, contagem "x/total" com peso tipográfico diferenciado do ano. Tudo desativado em `prefers-reduced-motion`.
- A barra do mês (mês focado, "Ir para hoje", setas) permanece, agora sem os chips — ganha respiro e o nome do mês fica mais destacado.

## 2. Bloco "Filtros" premium

O trigger atual é uma pílula cinza que parece desativada.

Mudança:
- Superfície clara com leve gradiente e borda definida; ícone em laranja/ouro; rótulo "Filtros" em peso forte e o recorte atual ("Todo o ciclo") como texto secundário com separador sutil.
- Estados claros: hover, aberto (navy + ouro) e com filtros ativos (contador em badge ouro).
- Sem sombras exageradas nem novo card — apenas contraste e tipografia corretos.

## 3. Seletores de menus/ícones (bug de labels)

Causa: o texto dos itens fica oculto por padrão e só aparece para o item ativo acima de 1100px, gerando alternância de largura e rótulos "sumindo" (visível no anexo, onde só "Timeline" tem texto).

Correção:
- Regra única e previsível: em telas largas todos os itens mostram ícone + rótulo; abaixo do ponto de corte, todos ficam apenas com ícone (tooltip mantido). Nada de mistura.
- Largura estável (sem "pulo" ao trocar de aba), altura, gaps e alinhamento padronizados com o botão "Histórico concluído".
- Indicador ativo consistente com a identidade (navy + acento ouro), foco visível preservado.

## 4. Mobile

Hoje o mobile usa navegação e bloco de filtros próprios, com estrutura antiga (bloco "Progresso do ciclo" grande, filtros em card separado, muito espaço antes da timeline).

Mudança:
- Uma única barra superior enxuta e rolável: navegação de visões (ícone + rótulo curto) na primeira linha; segunda linha com Filtros + seletor de anos compacto, ambos derivados dos componentes do desktop.
- Remover o card grande "Progresso do ciclo" da timeline mobile — o ano vira chip, e a etapa (Estruturação/Consolidação/Realização) aparece como legenda curta.
- Mês, "Mês atual" e setas condensados em uma linha só.
- Alvos de toque ≥44px, sem overflow horizontal, timeline começando bem mais acima na dobra.

## 5. Validação

- Playwright em 1440, 1185, 1024, 768 e 390px: screenshots antes/depois, checagem de labels visíveis, troca de ano, abertura do popover de filtros, troca de visão e ausência de erros no console.

## Detalhes técnicos

- `CronogramaTimelineBoard.tsx`: remover `CronogramaCycleChips` da nav temporal; expor as summaries/seleção de ano para a barra superior (via contexto de shell, mesmo padrão do slot de filtros já existente).
- `src/pages/CronogramaEventosPage.tsx`: `cronograma-workbench-bar` passa a hospedar nav secundária, "Histórico concluído" e o seletor de anos; mobile passa a montar a nova barra unificada.
- `CronogramaCycleChips.tsx`, `CronogramaSecondaryNav.tsx`, `CronogramaFiltersTrigger.tsx`: ajustes de markup/estados.
- `MobileCronogramaNavigation.tsx`, `MobileCronogramaFilters.tsx`, `MobileCronogramaTimeline.tsx`: reaproveitar componentes do desktop e retirar blocos legados.
- CSS: `src/styles/cronograma-command-layer.css` como fonte principal; limpar sobreposições conflitantes em `cronograma-timeline-flagship.css`, `cronograma-timeline-recovery.css`, `cronograma-operational-overrides.css` e `cronograma-mobile.css`. Somente tokens semânticos (navy/ouro/laranja) — sem cores fixas.
