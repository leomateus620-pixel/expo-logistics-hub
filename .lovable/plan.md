

## Diagnóstico

No `ExpenseDetailSheet.tsx` (linhas ~108–113), os links contextuais de **Veículo** e **Transporte** mostram apenas `ID: 7cfacb28...` em vez do nome real:

```tsx
{expense.vehicle_id && (
  <InfoRow label="Veículo" value={`ID: ${expense.vehicle_id.slice(0, 8)}...`} icon={Car} />
)}
```

A query atual em `useExpenses.ts` traz apenas `expense_categories(...)` e `expense_documents(...)` — não faz join com `vehicles` nem `transports`.

## Solução

### 1. `useExpenses.ts` — incluir joins

Adicionar à `select` da query principal:

```ts
.select(`
  *,
  expense_categories(name, icon),
  expense_documents(...),
  vehicles(id, modelo, placa, marca),
  transports(id, titulo, destino, inicio_em)
`)
```

### 2. `ExpenseDetailSheet.tsx` — exibir nome real

Substituir os dois `InfoRow` por:

```tsx
{expense.vehicles && (
  <InfoRow
    label="Veículo"
    value={`${expense.vehicles.modelo}${expense.vehicles.placa ? ` • ${expense.vehicles.placa}` : ''}`}
    icon={Car}
  />
)}
{expense.transports && (
  <InfoRow
    label="Transporte"
    value={expense.transports.titulo || 'Sem título'}
    icon={Truck}
  />
)}
```

Fallback: se o join vier `null` (ex.: veículo deletado), mostrar "Veículo removido" em vez do ID cru.

### 3. `ExpenseCard.tsx` — mesma melhoria nas badges

Atualizar as pílulas pequenas "Transporte" / "Veículo" para mostrar o nome curto:

```tsx
{expense.vehicles && (
  <span className="text-[9px] ..."><Car /> {expense.vehicles.modelo}</span>
)}
{expense.transports && (
  <span className="text-[9px] ..."><Truck /> {expense.transports.titulo}</span>
)}
```

## Arquivos a editar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useExpenses.ts` | Joins com `vehicles` e `transports` na query |
| `src/components/expenses/ExpenseDetailSheet.tsx` | Mostrar `modelo • placa` (veículo) e `titulo` (transporte) |
| `src/components/expenses/ExpenseCard.tsx` | Mesmo nome nas badges contextuais |

## Critério de aceite

1. Detalhe da despesa mostra "DEFENDER 4X4 • ABC-1234" no campo Veículo.
2. Detalhe mostra título do transporte (ex.: "Aeroporto → Hotel") em vez de ID.
3. Card também exibe nomes em vez de placeholders de ID.
4. Se o veículo/transporte tiver sido deletado, mostra "removido" sem quebrar.

