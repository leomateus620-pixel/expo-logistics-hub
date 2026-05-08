# Correção do horário de retorno dos transportes

## Diagnóstico (causa-raiz confirmada via banco)

O transporte real para Passo Fundo está assim:

```
titulo                = 'Outros'      ← chave usada pelos cálculos
destino               = 'Passo Fundo'
inicio_em             = 17:00 (SP)
duracao_estimada_min  = NULL          ← campo vazio
distancia_estimada_km = 560
```

A função `getEffectiveTotalMin` em `src/lib/utils.ts` recebe `titulo='Outros'` e, como `duracao_estimada_min` é nulo, cai no `DEFAULT_TOTAL_MIN['Outros'] = 60`. Resultado: 17h + 60min → **18h**, exatamente o que o usuário viu.

A tabela canônica `KNOWN_ONE_WAY_MIN` só tem chaves de aeroporto (`Aeroporto_Passo Fundo: 240`); destinos personalizados ("Outros" + cidade) não são reconhecidos e **a distância real (560 km) salva no banco é completamente ignorada** pelo cálculo de tempo. Esse é o bug central — vale para qualquer trajeto longo cadastrado com destino customizado.

Adicionalmente:
- Quando o motorista está em rota, `TransportDynamicIsland` já chama `estimate-return` (Google Routes v2 com `TRAFFIC_AWARE`) — esse caminho está correto. O problema é o cálculo **estático** exibido em cards/agenda antes da viagem começar (e quando ela está pendente).
- O form salva `duracao_estimada_min` quando o usuário escolhe destinos conhecidos / "Outros" via Places, mas existem transportes legados com o campo nulo (como o caso reportado).
- Não há validação que rejeite uma duração impossível para a distância salva.

## O que será alterado

### 1. `src/lib/utils.ts` — cálculo derivado de distância + tabela por cidade

- Nova tabela `KNOWN_CITY_ONE_WAY_MIN` (Passo Fundo 240, Chapecó 240, Santo Ângelo 80, Porto Alegre 390) usada quando `titulo` não é "Aeroporto" mas o `destino` casa com uma cidade conhecida.
- `getEffectiveOneWayMin(saved, titulo, vooCidade, destino?, distanciaKm?)`:
  1. Se `titulo='Aeroporto'` → mantém lógica atual (canônico do aeroporto).
  2. Senão, tenta `KNOWN_CITY_ONE_WAY_MIN` pelo `destino`.
  3. Senão, se `distanciaKm > 30`, calcula `Math.round((distanciaKm/2) / 80 * 60)` (ida ≈ metade da distância salva, à 80 km/h média segura). Mínimo 20 min.
  4. Senão, usa `saved/2` (se plausível) ou o default atual.
- `getEffectiveTotalMin` ganha a mesma assinatura e segue:
  - Se `saved` plausível **e compatível com a distância** (ver §3) → usa `saved`.
  - Senão → `2 × oneWay`.
- Validação: `isReturnTimePlausible(departureIso, returnIso, distanciaKm?)` retorna `false` se `(return-departure) < distanciaKm/90*60` (velocidade máxima média 90 km/h, sem parada). Exportada para uso na UI e no form.

### 2. Propagar `destino` e `distancia_estimada_km` em todos os call-sites

Atualizar para passar os dois novos parâmetros nos arquivos que já usam essas funções:
- `src/components/transport/TransportCard.tsx`
- `src/pages/TransportsPage.tsx`
- `src/pages/AgendaPage.tsx`
- `src/lib/kmConsolidation.ts`
- `src/components/TransportDynamicIsland.tsx` (apenas leitura, não muda lógica de live)
- `src/components/transport/TransportForm.tsx`

### 3. Form: garantir `duracao_estimada_min` para destino "Outros"

Em `TransportForm.tsx`, quando o usuário seleciona um destino via Places (modo "Outros") ou edita destino/distância, chamar `estimate-return` em modo `ROUTE_PREVIEW` com `dest_lat/dest_lng` reais para preencher `duracao_estimada_min` e `distancia_estimada_km` (ida — multiplica por 2 para round-trip ao salvar). Se o Maps falhar, deriva de `distancia_estimada_km` via fórmula segura (§1.3) e marca como estimado.

### 4. Card / detalhe / agenda: rótulo de origem do cálculo

Em `TransportCard` e `TransportDetailView`, quando exibir "Retorno previsto":
- Se `status ∈ {em_andamento, em_retorno, chegou_destino}` e há ETA da live (já calculado pelo `DynamicIsland` via `transport_locations` + Routes v2) → "Atualizado pela localização em tempo real".
- Se tem `duracao_estimada_min` plausível → "Calculado pelo Google Maps".
- Se caiu na fórmula de distância → "Estimativa baseada na distância".
- Se `isReturnTimePlausible === false` → não mostra hora; mostra "Calculando retorno com base na rota real" e dispara recálculo via `estimate-return` (ROUTE_PREVIEW).

### 5. Logs de depuração

Adicionar `console.log('[RETURN_TIME_CALCULATION]', {...})` em `estimateReturnTime` (quando `import.meta.env.DEV` ou flag) com transportId, origem, destino, distancia, duracao_saved, oneWay efetivo, source.

### 6. Backfill leve (sem migração destrutiva)

Para o transporte 4e0933b0 (Passo Fundo, 08/05) e quaisquer outros com `duracao_estimada_min IS NULL` e `distancia_estimada_km > 50`, o próprio cálculo dinâmico já vai corrigir a UI assim que o §1 entrar. Não vou alterar o banco — se o usuário quiser persistir, basta abrir/salvar no form (que agora chama Maps e grava).

## Pontos que NÃO mudam

- Edge function `estimate-return` (já usa Google Routes v2 corretamente, com polyline e tráfego).
- `TransportDynamicIsland` live tracking (já é a fonte preferida quando em rota).
- Estados/máquina do transporte e RLS.
- Schema do banco.

## Caso de teste manual após o fix

Transporte `4e0933b0` (Passo Fundo, sai 17:00, 560 km):
- Esperado: card mostra retorno **≈ 01:00** (17h + 2 × 240min = 01:00 do dia seguinte) com rótulo "Estimativa baseada na distância" até o motorista iniciar a viagem; depois passa a "Atualizado pela localização em tempo real".
- 18:00 nunca mais aparece.
