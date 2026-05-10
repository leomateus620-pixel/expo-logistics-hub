## Problema

A tela verde em `fenasojalog.com` é causada por uma **dependência circular de módulos ESM**:

```text
useDashboardMetrics.ts
  ├── importa useFuelMetrics            ──► importa PERIOD_START de useDashboardMetrics
  └── importa useVehicleOdometerEvent   ──► importa PERIOD_START de useDashboardMetrics
```

Quando o JS é avaliado, `PERIOD_START`/`PERIOD_END` chegam como `undefined` nos hooks filhos. Isso gera `new Date("undefinedT00:00:00-03:00")` → datas inválidas e/ou throw na inicialização do módulo. O React não monta nada e o usuário vê só o `bg` verde do body.

Essa regressão entrou junto com as alterações recentes em `useDashboardMetrics` (integração de combustível + odômetro).

## Correção

1. **Criar `src/lib/dashboardPeriod.ts`** com as constantes neutras:
   ```ts
   export const PERIOD_START = '2026-04-28';
   export const PERIOD_END   = '2026-05-10';
   ```
2. **`src/hooks/useDashboardMetrics.ts`** — re-exporta `PERIOD_START`/`PERIOD_END` desse novo arquivo (mantém compatibilidade com qualquer import existente) e usa as constantes locais a partir dele.
3. **`src/hooks/useFuelMetrics.ts`** — trocar `from './useDashboardMetrics'` por `from '@/lib/dashboardPeriod'`.
4. **`src/hooks/useVehicleOdometerEvent.ts`** — mesma troca de import.
5. **Sanidade**: rodar `rg "from '\\./useDashboardMetrics'"` e `rg "from '@/hooks/useDashboardMetrics'"` para confirmar que nenhum outro hook puxa as constantes de volta.
6. **Defesa adicional** em `OperationalDynamicIsland.tsx` (recém-alterado): garantir que `combustivelTotalBRL` tenha fallback `?? 0` antes de formatar, evitando NaN no card "Combustível".

Após o fix o Dashboard deve montar normalmente, com os cards de KM (odômetro do evento) e Combustível R$ funcionando como esperado.

## Verificação

- Abrir `/` no preview e confirmar que o Dashboard renderiza.
- Conferir console sem `Cannot read properties of undefined` ou `Invalid time value`.
- Validar que o card "Combustível" mostra valor em R$ e que "KM PERÍODO" não fica negativo.
