# Correção da tela azul do Mapa Comercial

## Diagnóstico (confirmado)

Reproduzi a rota `/mapa-comercial` no navegador: a tela fica azul porque o React derruba a árvore inteira com o erro em tempo de execução:

```text
PAGEERROR: LIVESTOCK_TENT_LAYOUT is not defined
The above error occurred in one of your React components: at Lazy > Suspense > CommercialMapRoute
```

A causa é um merge malfeito entre as duas PRs recentes. A branch da "Via Expressa" (D2) foi mesclada por cima da branch da "Tenda da Pecuária" (D4) **substituindo** o código em vez de somar. Comparando o commit anterior ao merge com o estado atual:

- `src/features/commercial-map/utils/landmarks.ts`: o import de `LIVESTOCK_TENT_LAYOUT` / `livestockTentVisualHeight` foi trocado pelo import de `viaExpressa`, e o membro `'livestock-tent'` sumiu da união `StrategicLandmarkKind` — mas a entrada `D4` que usa esses símbolos permaneceu no arquivo. Daí o `ReferenceError` em produção.
- `src/features/commercial-map/components/canvas/StrategicLandmarks.tsx`: perdeu o import de `LivestockTent`, a paleta, os ajustes de material, o orçamento de render e o ramo de `modelBounds`/render do kind `livestock-tent`.

O typecheck confirma exatamente esses pontos (`TS2304: Cannot find name 'LIVESTOCK_TENT_LAYOUT'`, `TS2322` no kind, `TS2367` no comparativo do StrategicLandmarks).

## O que será feito

Restaurar a coexistência dos dois marcos, sem reverter nada da Via Expressa nem das demais mudanças recentes (vias, Portão 5, Rua Brasília/Ubiretama continuam intactas).

1. `utils/landmarks.ts`
   - Reintroduzir o import de `LIVESTOCK_TENT_LAYOUT` e `livestockTentVisualHeight` mantendo o import da Via Expressa.
   - Reincluir `'livestock-tent'` na união `StrategicLandmarkKind` (D2 via-expressa e D4 livestock-tent passam a conviver).
   - Restaurar o clamp de altura do kind `livestock-tent` ao lado do clamp da Via Expressa.

2. `components/canvas/StrategicLandmarks.tsx`
   - Reimportar `LivestockTent`, `LIVESTOCK_TENT_LAYOUT`, `LIVESTOCK_TENT_RENDER_BUDGET` e `livestockTentModelBounds`.
   - Reincluir: paleta do kind, ajustes de rugosidade/metalness, o kind na lista de estruturas detalhadas, o multiplicador de distância de detalhe, o ramo de `modelBounds` e o render `{kind === 'livestock-tent' && <LivestockTent … />}` — tudo somado aos ramos equivalentes da Via Expressa.

3. `src/test/commercialMapLivestockTent.test.ts`
   - Corrigir o objeto de teste que passa `id` onde o tipo espera apenas `publicIdentifier` (erro TS2353 remanescente do mesmo merge).

## Validação

- `tsgo --noEmit` sem erros no módulo do mapa.
- Suítes `commercialMapLivestockTent`, `commercialMapViaExpressa` (se existir) e as suítes de vias/terreno posteriores verdes.
- Reabrir `/mapa-comercial` via navegador headless e confirmar render do parque (sem `pageerror`), além de checar que D2 (Via Expressa) e D4 (Tenda da Pecuária) aparecem.
