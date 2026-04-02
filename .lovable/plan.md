

# Fix: Inconsistências entre Transportes e Agenda

## Problemas Identificados

### 1. Dados duplicados entre `transports` e `events` (Causa raiz)
Quando um transporte é criado, a edge function `transport-lifecycle` cria automaticamente um registro duplicado na tabela `events` com `tipo_tag = 'transporte'`. Esses eventos duplicados têm **horários diferentes** dos transportes originais (offset de ~3h), causando inconsistências:

| Transport ID | Hora real (UTC) | Hora no evento (UTC) | Diferença |
|---|---|---|---|
| 9da9dd3c | 04:45 | 07:45 | +3h |
| b4fd11d3 | 03:15 | 09:45 | +6.5h |
| f429362c | 03:55 | 10:25 | +6.5h |

A Agenda já filtra esses eventos duplicados corretamente (`tipo_tag !== 'transporte'`), mas o Dashboard os exibe com horários errados.

### 2. Edge function: bug de timezone no schedule
Linha 411: `inicioEm?.slice(0, 10)` extrai a data UTC, atribuindo turnos e escalas ao dia errado para transportes noturnos no horário de Brasília.

### 3. Dashboard lê eventos com horários errados
O Dashboard mostra eventos da tabela `events` (incluindo os duplicados de transporte com horas erradas) em vez de ler diretamente da tabela `transports`.

### 4. Hook `useTransportGuests` instável
`getGuestsForTransport` cria uma nova referência a cada render, forçando recomputação desnecessária do `useMemo` de `allItems` na Agenda.

## Plano de Correção

### 1. Edge function: remover criação de eventos duplicados
Remover a chamada `createEventAndShift` de dentro de `handleCreate`. Manter apenas a criação de **schedule shifts** (necessários para a página de escalas), extraída em função separada `createShiftForTransport`. Corrigir a extração de data com timezone:

```typescript
// Antes (UTC - errado)
const transportDate = inicioEm?.slice(0, 10);

// Depois (BRT - correto)  
const transportDate = new Date(inicioEm).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
```

### 2. Migration: limpar eventos órfãos de transporte
Deletar todos os 15 eventos com `tipo_tag = 'transporte'` da tabela `events`, pois são duplicatas com horários incorretos. A Agenda e o Dashboard passarão a ler diretamente da tabela `transports`.

```sql
DELETE FROM events WHERE tipo_tag = 'transporte';
```

### 3. Dashboard: usar transports diretamente na seção Agenda
Refatorar a seção "Agenda" do Dashboard para mesclar `events` (sem tipo_tag='transporte') + `transports` (pendentes/em andamento), exatamente como a Agenda page faz. Isso garante horários corretos e consistência entre as telas.

### 4. Estabilizar `useTransportGuests`
Envolver `getGuestsForTransport` com `useCallback` para evitar recomputação desnecessária do memo de `allItems` na Agenda:

```typescript
const getGuestsForTransport = useCallback((transportId: string): string[] => {
  return transportGuests
    .filter((tg: any) => tg.transport_id === transportId)
    .map((tg: any) => tg.guest_id);
}, [transportGuests]);
```

## Arquivos Alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/transport-lifecycle/index.ts` | Remover `createEventAndShift`, criar `createShiftForTransport` com timezone corrigido |
| SQL migration | Deletar eventos órfãos com `tipo_tag = 'transporte'` |
| `src/pages/Dashboard.tsx` | Mesclar transports + events na seção Agenda |
| `src/hooks/useTransportGuests.ts` | Estabilizar `getGuestsForTransport` com `useCallback` |

