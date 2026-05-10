## Diagnóstico

**1. Por que o gráfico de carrinhos não mostra dados antes de 05/05**

`src/hooks/useElectricCarts.ts` busca `cart_history` com `.limit(100)` ordenado por `created_at desc`. Como o histórico recente (05/05 → 10/05) já passa de 250 linhas, o limite corta tudo o que veio antes. No banco existem retiradas em todos os dias do período (28/04 em diante) — o problema é puramente de fetch no client.

**2. "Tarefas" no dashboard**

Hoje o card e o `TasksProgressChart` usam `useTasks()` (menu Checklist). O usuário quer medir progresso pela operação de **transportes**: cada transporte = 1 tarefa; concluído = realizado, demais = pendente; críticas = pendentes vencidos / sem motorista.

**3. Despesas de combustível**

`fuel_records` já existe (campos `litros`, `valor`, `km_abastecimento`, `vehicle_id`, `created_at`). Não há flag "Botolli" nos veículos — entendo que o pedido é mostrar os abastecimentos cadastrados no módulo Veículos. Vamos exibir gasto diário (R$) + barras por veículo dentro do período Fenasoja.

---

## Plano de implementação

### A. Corrigir histórico de carrinhos
- `src/hooks/useElectricCarts.ts`: remover `.limit(100)` da query de `cart_history` e filtrar por `created_at >= PERIOD_START` (28/04) para trazer todo o período sem inflar payload.
- Manter ordenação `desc` para a lista, mas garantir que `useDashboardMetrics` receba todas as linhas do período.
- Resultado: barras passam a aparecer em 28/04, 29/04, 30/04, 01/05, 02/05, 03/05, 04/05 (atualmente zeradas).

### B. Substituir "Progresso de tarefas" por "Progresso de transportes"
- Criar `src/components/dashboard/charts/TransportsProgressChart.tsx` (mesma identidade visual radial do atual), com props:
  - `realizados`, `pendentes`, `criticas`, `percent`
- Cálculo em `useDashboardMetrics`:
  - `total = transportes do período (todos status exceto cancelado)`
  - `realizados = status concluido`
  - `pendentes = status pendente + em_andamento + em_retorno + chegou_destino`
  - `criticas = pendentes sem motorista OU com `inicio_em` < agora OU retorno implausível`
  - `percent = round(realizados/total*100)`
- Em `Dashboard.tsx`: trocar `<TasksProgressChart />` por `<TransportsProgressChart />`. O card "Tarefas" 3D continua existindo (vinculado ao Checklist) — só o gráfico muda.

### C. Novo gráfico de combustível
- Criar `src/hooks/useFuelMetrics.ts` consumindo `fuel_records` filtrado pelo período Fenasoja (28/04 → 10/05), agregando:
  - série diária `{ dia, valor, litros }`
  - total no período (R$, litros)
  - top veículo por gasto
- Criar `src/components/dashboard/charts/FuelExpensesChart.tsx`:
  - Mesmo estilo Liquid Glass + gold-accent dos demais
  - `ComposedChart`: barras = R$ por dia, linha = litros por dia
  - Header com total R$ · litros e top veículo
- Em `Dashboard.tsx`, posicionar logo após `KmRodadosChart`/`CartUsageChart`, dentro da grade de gráficos (`lazy import`).

### D. Polimento
- Manter animações `animate-fade-in` com delays escalonados.
- Tooltip e cores via tokens (`hsl(var(--gold))`, `hsl(var(--primary))`).
- Skeleton existente cobre o novo card via `<ChartFallback />`.

---

## Arquivos afetados

```text
M src/hooks/useElectricCarts.ts            (remover limit, filtrar por período)
M src/hooks/useDashboardMetrics.ts         (novas métricas: transports progress)
A src/hooks/useFuelMetrics.ts              (agregação fuel_records)
A src/components/dashboard/charts/TransportsProgressChart.tsx
A src/components/dashboard/charts/FuelExpensesChart.tsx
M src/pages/Dashboard.tsx                  (trocar chart de tarefas + inserir fuel chart)
```

Sem mudanças de schema / RLS — só leitura.