

# Corrigir métricas de distância/tempo/chegada no Dynamic Island

## Problema

As métricas abaixo do mapa (km, minutos, chegada) estão usando os dados do **retorno à origem** (`returnData`) em vez da **rota ao vivo até o destino** (`liveData`). Resultado: mostra 0.3 km e 1 min quando o motorista está perto de Santa Rosa, não a distância real até o destino (ex: Santo Ângelo).

Além disso, quando a viagem inicia e ainda não houve fetch ao vivo, os valores de fallback (`estimatedKm`, `duracao_estimada_min`) podem estar zerados ou incorretos.

## Causa raiz

Linha 160-163 do `TransportDynamicIsland.tsx`: o `liveEta` é populado com `returnData` (motorista → Santa Rosa), mas os badges de km/min/chegada usam esse mesmo objeto para mostrar distância até o **destino**.

## Solução

Separar em dois estados:

1. **`liveDestRoute`** — dados da rota motorista → destino (km, minutos, horário de chegada ao destino) — alimentado por `liveData`
2. **`liveReturnEta`** — ETA de retorno à base — alimentado por `returnData` (para exibição separada se desejado)

### Alterações em `src/components/TransportDynamicIsland.tsx`

1. Substituir o state `liveEta` por dois states:
   - `liveDestRoute: { minutes, km, arrivalTime }` — preenchido com `liveData` (rota ao destino)
   - `liveReturnEta: { minutes, arrivalTime }` — preenchido com `returnData` (retorno à origem)

2. No `useEffect` de fetch (linhas 148-164):
   - Usar `liveData.duration_minutes` e `liveData.distance_km` para `liveDestRoute`
   - Usar `returnData.duration_minutes` para `liveReturnEta`

3. Na seção de métricas (linhas 386-402):
   - Badge de km: usar `liveDestRoute.km`
   - Badge de minutos: usar `liveDestRoute.minutes`
   - Badge de chegada: usar `liveDestRoute.arrivalTime` (chegada ao destino)
   - Opcionalmente exibir retorno: `liveReturnEta.arrivalTime`

4. Nos textos colapsados (`etaText`, `arrivalText`): usar `liveDestRoute` em vez de `liveEta`

5. Fazer um fetch inicial imediato ao iniciar a viagem (quando `isActive` muda para true e `location` está disponível), sem esperar os 2 minutos do throttle — resetar `lastFetchRef.current = 0` quando `isActive` muda

| Arquivo | Ação |
|---|---|
| `src/components/TransportDynamicIsland.tsx` | Separar liveEta em liveDestRoute + liveReturnEta; corrigir métricas |

