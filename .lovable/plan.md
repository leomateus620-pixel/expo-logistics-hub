# Refino premium dos 5 cards da Dashboard — Agenda Fenasoja

Etapa exclusivamente visual e de interação. Todas as métricas, consultas, regras e drill-downs já implementados em `cronograma-kpi-metrics.ts` / `useAgendaDashboardMetrics.ts` permanecem intactos.

## 1. Navegação vertical (reescrita do mecanismo)

`useCardLayerScroll` é substituído por um controlador mais simples e previsível, com dois estados discretos (`primary` / `secondary`):

- Wheel capturado apenas quando o ponteiro está sobre o card e existe destino válido naquela direção. Em primary + scroll para cima, ou secondary + scroll para baixo, o evento não é consumido e a página rola normalmente.
- Threshold de intenção (acúmulo de `deltaY` mínimo) para ignorar micromovimentos de trackpad; `deltaY` horizontal dominante é ignorado.
- Cooldown de ~520 ms após cada troca, com reset apenas quando o gesto cessa — um único flick nunca gera duas transições.
- Touch: drag vertical com acompanhamento em tempo real, decisão por distância + velocidade, snap ao soltar; sem destino válido, o gesto não é capturado.
- Teclado: `ArrowDown` / `ArrowUp` com o card focado, `focus-visible` preservado.
- Nenhum `translateX`, nenhum wheel horizontal, nenhum indicador em orientação horizontal.

## 2. Animação física

Track interno único com as duas telas empilhadas (`translateY(0%)` / `translateY(100%)`), card como viewport `overflow: hidden`, altura idêntica nas duas camadas (sem layout shift).

- Integração spring-damper em `requestAnimationFrame` sobre um único valor de progresso, aplicado via `transform` e `opacity`.
- Durante o gesto o conteúdo acompanha o dedo/roda; ao soltar, encaixa com leve inércia e sem bounce perceptível.
- Camada que sai perde ~8% de opacidade e ~1% de escala; camada que entra chega exatamente alinhada.
- Estado local por card (nenhum re-render dos vizinhos), `will-change` aplicado só durante o movimento, `prefers-reduced-motion` com transição curta.

## 3. Design pass dos cards

Novo sistema tipográfico e de composição em `cronograma-kpi-cards.css`, usando apenas tokens do design system (verde profundo + dourado Fenasoja), com números tabulares, tracking negativo nas métricas, três níveis claros (métrica / título / contexto) e ritmo vertical consistente. Superfície com borda de baixa luminância, highlight superior de 1px e sombra de contato discreta; hover eleva 1–2 px, aumenta levemente a luminância da borda e move o indicador — sem "flutuar".

- **Card 01 — Progresso:** numeral display com `%` menor e mais leve, alinhado opticamente à baseline; barra fina com track discreto e preenchimento animado por `scaleX` suave. Secondary (mês) com o mesmo acabamento e delta como contexto refinado, não como badge.
- **Card 02 — Concluídos / Atrasados:** numeral dominante, contexto mensal em contraste secundário legível. Na secondary, atmosfera de atenção sutil: ícone, accent dourado e microindicador — sem vermelho de erro.
- **Card 03 — Pessoas:** linhas de ranking com avatar real (crop consistente, halo de 1px, fallback com iniciais), nome em peso médio, quantidade à direita em numeral forte tabular com micro-label "eventos" e microbarra proporcional. Secondary mostra o próximo evento de cada pessoa: data · hora em destaque e título truncado com elegância.
- **Card 04 — Semana:** numeral dominante, título com tracking e peso próprios, intervalo "17 — 23 AGO" como contextualizador temporal discreto com microindicador de dias. Secondary com Top 5 dias em ranking compacto (posição, dia, barra, contagem).
- **Card 05 — Comissões / Locais:** título em duas linhas (rótulo + mês como contextualizador), ranking compacto com #1 levemente destacado por peso e opacidade da barra — sem medalhas nem gamificação. Locais seguem o mesmo sistema com variação própria de acento.

## 4. Indicador de estado

Dois pontos empilhados verticalmente, encostados na borda interna direita, com deslocamento microanimado acompanhando a transição, ganho de contraste no hover e área clicável acessível. Não ocupa espaço de conteúdo.

## 5. Arquivos

- reescrito: `src/hooks/useCardLayerScroll.ts` (controlador vertical de duas telas)
- reescritos: `src/components/cronograma-eventos/dashboard/kpi/LayeredKpiCard.tsx`, `KpiPrimitives.tsx`, `src/styles/cronograma-kpi-cards.css`
- ajustado: `AgendaKpiStrip.tsx` (apenas composição/props dos novos primitivos)
- inalterados: `src/lib/cronograma-kpi-metrics.ts`, `src/hooks/useAgendaDashboardMetrics.ts`, seletores, rotas, banco e RLS

## 6. Validação

Teste real no navegador (desktop e viewport mobile): wheel curto e forte, flick de trackpad (uma única troca), swipe lento e rápido, continuidade do scroll da página nos extremos, ausência de layout shift e de clipping, e conferência final dos cinco cards como conjunto.
