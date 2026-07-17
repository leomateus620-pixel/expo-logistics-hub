## Bug identificado — Linha do tempo trava em dez/2026 e "salta" para jun/2026

### Causa raiz (verificada nos arquivos)
- `src/lib/cronograma-cycle.ts` calcula `availableYears` a partir de `summary.available = total.total > 0`. Como só há eventos cadastrados em 2026, `availableYears = [2026]`.
- `src/hooks/useTimelineCycleNavigation.ts`:
  - Effect de deep-link (linhas ~314-345): sempre que a URL muda para `timelineYear=2027` (via clique no `TimelineCycleNavigator` ou via `onPositionChange` emitido pelo `IntersectionObserver`), chama `resolveAvailableYear(2027, [2026])` que retorna 2026. Como `2026 !== state.selectedYear (2027)`, dispara `commitFocus(2026, firstMonthByYear[2026], 'reconcile', { immediate: true })` → `scrollIntoView({ behavior: 'auto' })` no mês retornado por `getFirstRelevantMonthForYear` (jun/2026), causando o snap-back instantâneo.
  - Effect de reconciliação por contexto (linhas ~371-374): tem o mesmo `resolveAvailableYear` como fallback e reforça o snap quando `availableSignature` muda.
  - `resolveInitialState` (linhas ~99-117): também filtra o estado inicial pelos anos disponíveis, escondendo 2027/2028 mesmo quando explicitamente pedidos na URL.
- Consequência: rolagem/click para 2027 e 2028 é rejeitada porque o cronograma trata "ano sem eventos" como "ano indisponível para foco", embora o próprio stream (`CronogramaTimelineBoard.tsx`) já renderize um placeholder (`TimelineYearEmptyState`) preparado para anos vazios.

### Correção proposta (mínima, sem quebrar contratos)
Manter `availableYears` para o navegador visual (mostrar contagens, ícones de "ano indisponível"), mas **não** usá-lo como filtro para foco. Anos 2026/2027/2028 são todos foco-legítimos porque o stream já lida com vazios via placeholder.

Arquivos alterados:

1. **`src/hooks/useTimelineCycleNavigation.ts`**
   - Criar helper local `resolveFocusYear(preferred, availableYears)` que:
     - Se `preferred` é um `CronogramaCycleYear` válido → retorna `preferred` (independente de estar em `availableYears`).
     - Só cai no vizinho mais próximo se `preferred` estiver fora de 2026-2028 (proteção contra URL corrompida).
   - Substituir os três usos de `resolveAvailableYear` por `resolveFocusYear`:
     - `resolveInitialState` (~linha 106).
     - Effect de deep-link (~linha 322).
     - Effect de reconciliação por contexto (~linha 372) — remover totalmente o ramo "reconcile por availableChanged" quando o ano atual continua sendo um cycle year válido (o placeholder cobre o caso).
   - Manter `resolveAvailableYear` disponível para uso futuro (não remover a função) — apenas parar de aplicá-la na trajetória de foco.

2. **`src/hooks/useTimelineCycleNavigation.ts` — proteção anti-loop do observer**
   - No effect do `IntersectionObserver` (~linhas 275-306), evitar redespachar quando o `visible` top é o mesmo do estado atual (comparar `key` contra `focusKey(state.selectedYear, state.focusedMonth)`). Isso reduz emissões redundantes de `onPositionChange('observer')` que hoje refazem toda a cadeia URL → effect 314 → commitFocus a cada frame de rolagem.

### Verificação
- `bunx tsgo --noEmit` para garantir que o refactor não quebra tipos.
- Playwright headless: abrir `/cronograma-eventos`, clicar no ano 2027 no `TimelineCycleNavigator`, capturar screenshot e confirmar que o placeholder de 2027 permanece em foco (sem snap para junho/2026); repetir clicando em 2028. Rolar até o final e confirmar que o topo do stream continua acessível sem retornos automáticos.
- Rodar `bunx vitest run src/lib/__tests__/cronogramaRpc.test.ts` para garantir que a suíte existente segue verde.

### Fora de escopo (não alterar nesta passagem)
- Regras do `IntersectionObserver` (`rootMargin`, thresholds) — só ajustar se o Playwright detectar oscilação residual.
- Cálculo de `getFirstRelevantMonthForYear` (comportamento correto por si só).
- Layout/CSS do stream — nenhuma mudança visual necessária além de destravar a navegação.