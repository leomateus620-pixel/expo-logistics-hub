# ETA Dinâmico em Tempo Real — Análise e Refinamento

## Resposta direta

**Sim, a lógica já está implementada.** O sistema recalcula a chegada estimada em tempo real conforme o motorista se desloca:

1. `useLocationTracking` faz `navigator.geolocation.watchPosition` (alta precisão), atualizando lat/lng continuamente.
2. `TransportDynamicIsland` (linhas 148–201) detecta cada nova posição e chama a Edge Function `estimate-return` no modo `LIVE_ROUTE`.
3. A Edge Function consulta o **Google Routes v2** com `routingPreference: 'TRAFFIC_AWARE'`, recebendo distância + duração reais a partir da posição **atual** do motorista até o destino, considerando:
   - Distância restante (não a estimativa inicial).
   - Trânsito vigente.
   - Velocidade implícita pelo deslocamento real (o ponto de origem se move).
4. O ETA é recalculado: `arrivalTime = Date.now() + duration_minutes`, exibido como "Chegada ~22:37".

Ou seja: se o motorista corre mais, a próxima medição parte mais perto do destino e o ETA se antecipa; se vai devagar ou pega trânsito, o Google retorna duração maior e o ETA se atrasa.

## O que pode melhorar

A lógica funciona, mas o **throttle atual é conservador (120 s entre chamadas)**, o que pode dar a sensação de que "nada muda". Também não há comparação visual entre a estimativa original e a atualizada.

### Mudanças propostas

1. **Throttle adaptativo em `TransportDynamicIsland.tsx`**
   - Atual: 30 s na primeira chamada, depois 120 s fixos.
   - Proposto:
     - 60 s quando o trajeto é longo (> 60 min restantes) — economiza quota Google.
     - 30 s quando faltam < 30 min para chegar — atualiza com mais frequência na reta final.
     - Forçar recálculo se a posição mudou > 2 km desde a última chamada (movimento rápido).

2. **Indicador visual de variação do ETA**
   - Guardar a estimativa inicial (`t.duracao_estimada_min` ou primeira `LIVE_ROUTE`).
   - Mostrar delta ao lado de "Chegada ~22:37":
     - `↓ 8 min adiantado` (verde) se ETA atual < estimativa.
     - `↑ 12 min atrasado` (âmbar) se ETA atual > estimativa.
     - Sem indicador se diferença < 3 min.

3. **Validação**
   - Testar manualmente com uma rota ativa: verificar nos logs da Edge Function `estimate-return` se há chamadas `LIVE_ROUTE` periódicas e se `duration_minutes` varia conforme a posição muda.
   - Confirmar que o ETA exibido na Dynamic Island reflete o valor retornado.

## Detalhes técnicos

**Arquivo único alterado:** `src/components/TransportDynamicIsland.tsx`

```text
useEffect (linhas 148–201)
  ├── lastFetchRef (timestamp)
  ├── lastPositionRef (lat,lng) ← NOVO: detecta deslocamento >2km
  ├── initialEtaRef (minutes)   ← NOVO: baseline para o delta
  └── throttle dinâmico baseado em liveDestRoute.minutes

JSX badge ETA (linha 420)
  └── + <span> com delta (verde/âmbar) quando |delta| ≥ 3 min
```

Sem mudanças no backend, no banco ou em outras telas. Sem custo adicional perceptível de quota Google (throttle continua ≥ 30 s).

## Fora de escopo

- Não vou alterar a lógica do `useLocationTracking` (já funciona bem com `watchPosition`).
- Não vou alterar a Edge Function `estimate-return` (já usa `TRAFFIC_AWARE` corretamente).
- Não vou persistir o histórico de ETA no banco — apenas estado local em memória.
