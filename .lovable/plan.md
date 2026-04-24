## Correção end-to-end do "Retorno" dos transportes

### 🎯 Diagnóstico confirmado
- **DB**: 10 de 12 transportes ativos têm `duracao_estimada_min` NULL ou inválido (≤ 5 min). 
- **Sintoma**: Para Passo Fundo (desembarque 09:10), o sistema calcula Retorno = 09:10 + 30m + (120/2 = 60m) = **10:40** ❌. O correto é ~13:40 (4h de viagem real).
- **Causa raiz**: o helper `airportOneWayMin` cai no default de 120m sempre que `duracao_estimada_min` está vazio, gerando 60m de viagem só de ida — irreal para destinos a 250–400 km.
- **Semântica**: "Retorno" significa **chegada de volta em Santa Rosa** (não saída do destino).

### 🛠️ Plano de correção

#### 1. Backfill via Google Routes API + fallbacks canônicos
- **Migração de dados (data-only INSERT/UPDATE)** preenche `duracao_estimada_min` dos 10 transportes ativos com NULL/inválido usando valores canônicos baseados em rotas reais Google Maps:
  - Passo Fundo: **480 min** round-trip (240 ida)
  - Chapecó: **480 min** (240 ida)
  - Santo Ângelo: **160 min** (80 ida)
  - Porto Alegre: **780 min** (390 ida)
  - Parque/Hotel/Centro: mantém defaults curtos
- Para transportes futuros, a Edge Function `estimate-return` já chama Google Routes; reforçaremos o salvamento de `duracao_estimada_min` no submit do formulário.

#### 2. Helper canônico `getEffectiveOneWayMin` em `src/lib/utils.ts`
```ts
export const KNOWN_ONE_WAY_MIN: Record<string, number> = {
  'Aeroporto_Passo Fundo': 240,
  'Aeroporto_Chapecó': 240,
  'Aeroporto_Santo Ângelo': 80,
  'Aeroporto_Porto Alegre': 390,
};
export function getEffectiveOneWayMin(saved, titulo, vooCidade) {
  const key = titulo === 'Aeroporto' && vooCidade ? `Aeroporto_${vooCidade}` : titulo;
  const known = KNOWN_ONE_WAY_MIN[key];
  if (known) return known; // valor canônico vence default ruim
  if (saved && saved > 10) return Math.round(saved / 2);
  return 60;
}
```

#### 3. Refatorar `airportOneWayMin` nos 3 pontos
- **`src/components/transport/TransportCard.tsx`** (linha 25-28)
- **`src/pages/TransportsPage.tsx`** (linha 164-167) — também afeta detecção de conflito
- **`src/pages/AgendaPage.tsx`** (linha 183-184) — `computeAgendaTimes`

Todos passam a usar `getEffectiveOneWayMin(t.duracao_estimada_min, t.titulo, t.voo_cidade)`.

#### 4. Lógica final mantida (já implementada na rodada anterior)
- **Desembarque**: `Retorno = voo_chegada + 30m buffer + oneWay`
- **Embarque**: `Retorno = voo_checkin + oneWay`
- **Não-aeroporto**: `Retorno = inicio_em + duração total`

#### 5. Reforço na criação/edição
- Em `TransportsPage.tsx` (submit), se a Edge Function `estimate-return` retornar `duration_minutes`, salvar como `duracao_estimada_min` (já faz parcialmente — garantir que o round-trip seja persistido).
- Se a API falhar, aplicar fallback canônico de `KNOWN_ONE_WAY_MIN * 2`.

### 📊 Resultado esperado (Passo Fundo, desembarque 09:10)
| Etapa | Antes | Depois |
|---|---|---|
| Saída | 04:40 ✅ | 04:40 ✅ |
| Desembarque | 09:10 ✅ | 09:10 ✅ |
| **Retorno (chegada SR)** | **10:40 ❌** | **13:40 ✅** (09:10 + 30m + 240m) |

### ✅ Critérios de aceite
1. Todos transportes ativos exibem horário de Retorno coerente com a distância real
2. Novos transportes para Aeroportos persistem `duracao_estimada_min` real do Google Routes
3. Detecção de conflito de veículos usa o mesmo cálculo coerente
4. Agenda e card de Transportes mostram horários idênticos
5. Zero alteração em RLS, schema ou outros módulos

### 📁 Arquivos modificados
- `src/lib/utils.ts` — novo helper canônico
- `src/components/transport/TransportCard.tsx` — usa helper
- `src/pages/TransportsPage.tsx` — usa helper + persiste duração no submit
- `src/pages/AgendaPage.tsx` — usa helper em `computeAgendaTimes`
- **Data-only**: UPDATE em `transports` ativos com `duracao_estimada_min` correto
