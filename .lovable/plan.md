

## Filtro por pessoa no menu Despesas

### Problema
Não há opção para filtrar despesas pelo nome da pessoa responsável (`paid_by_name`). O usuário quer ver todas as despesas vinculadas a uma pessoa específica.

### Solução

Adicionar um filtro do tipo **Select/dropdown** abaixo dos chips de status, listando todas as pessoas distintas com despesas registradas. Ao selecionar uma pessoa, as despesas são filtradas no backend via `paid_by_name`.

### Alterações

**1. `src/hooks/useExpenses.ts`**
- Adicionar `paid_by_name?: string` à interface `ExpenseFilters`
- Adicionar filtro na query: `if (filters?.paid_by_name) q = q.eq('paid_by_name', filters.paid_by_name);`

**2. `src/pages/ExpensesPage.tsx`**
- Novo estado `personFilter` (string, default `''`)
- Extrair lista de nomes únicos: buscar todas despesas sem filtro de pessoa para montar a lista de opções (usar uma query separada leve ou extrair do resultado completo)
- Renderizar um `<Select>` compacto (ou chips horizontais) logo abaixo dos chips de status, com placeholder "Filtrar por pessoa"
- Passar `paid_by_name` nos filtros do `useExpenses`:
  ```ts
  useExpenses({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(personFilter ? { paid_by_name: personFilter } : {}),
  })
  ```
- Opção "Todos" para limpar o filtro

**3. Abordagem para lista de nomes**
- Usar uma segunda chamada `useExpenses()` sem filtros apenas para extrair nomes distintos seria redundante
- Melhor: adicionar um hook/query dedicado que faz `SELECT DISTINCT paid_by_name FROM expenses WHERE org_id = ? AND paid_by_name IS NOT NULL`
- Ou, mais simples: buscar os nomes distintos do array `expenses` carregado sem filtro de pessoa (carregar todas e filtrar client-side para pessoa, mantendo server-side para status)
- **Escolha**: filtro client-side para pessoa (sem nova query), pois já carregamos até 500 registros. Carregar com filtro de status apenas, e filtrar por `paid_by_name` no frontend

### Fluxo final
1. Carregar despesas filtradas apenas por `status` (como hoje)
2. Extrair `distinctNames` via `useMemo` do array completo
3. Se `personFilter` estiver ativo, filtrar `expenses` client-side antes do `groupByDate`
4. Renderizar Select com os nomes disponíveis + opção "Todos"

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/pages/ExpensesPage.tsx` | Estado `personFilter`, Select de pessoas, filtro client-side |

Nenhuma alteração no hook necessária — filtro será 100% client-side para simplicidade.

