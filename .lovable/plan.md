## Objetivo

Calcular o KM rodado de cada veículo durante a Fenasoja 2026 (28/04 → 10/05) usando od­ômetro inicial e final, exibir no Dashboard e incluir nos relatórios. Defender 4x4 sem od­ômetro: mostrar apenas o valor gasto em combustível.

## Od­ômetros finais (informados)

| Veículo | Placa | Inicial (heurística) | Final | KM evento |
|---|---|---|---|---|
| Amarok | JDF6D47 | 25.668 (1º km_saida válido) | 28.707 | ~3.039 |
| UP vermelho 21 | IXU8B21 | 123.799 | 124.070 | 271 |
| UP vermelho 56 | IZH9J56 | 125.386 | 125.668 | 282 |
| T-Cross branca 18 | TQX7C18 | 4.403 | 5.571 | 1.168 |
| T-Cross azul 43 | IZT7H43 | 86.761 (1º km_saida ≥ 1000) | 87.812 | 1.051 |
| Defender 4x4 | (sem placa) | — | — | R$ 725,61 (combustível) |

## Mudanças

### 1. Banco
- Migration: adicionar `vehicles.km_inicial_evento numeric` e `vehicles.km_final_evento numeric`.
- Insert: atualizar os 5 veículos com `km_inicial_evento` (heurística: primeiro `km_saida` chronological do período ≥ 1000) e `km_final_evento` (valores informados). Atualizar `km_atual` para bater com o final.

### 2. Hook `useVehicleOdometerEvent`
- Novo hook que retorna por veículo: `kmInicial`, `kmFinal`, `kmEvento = final - inicial`, `valorCombustivel` (sum `fuel_records.valor`), `litros`, `custoEstimadoKm = kmEvento * 0.65`.
- Para Defender (sem od­ômetro): apenas `valorCombustivel`.

### 3. Dashboard
- Novo card/chart `OdometerEventChart` (lazy, junto ao FuelExpensesChart): bar chart horizontal por veículo mostrando KM rodado no evento + tooltip com inicial/final/litros/R$. Total geral em destaque (KM da frota no evento).

### 4. Relatórios
- `KmEmissoesPage` (PDF `generateKmPdf`): nova seção "Od­ômetro do evento por veículo" — tabela inicial/final/Δkm/litros/R$/custo estimado, com linha do Defender (— / — / — / litros / R$).
- `systemReportCollector`: incluir mesmo bloco no relatório de contingência.

### 5. UI Veículos
- Em `VehiclesPage` (detalhe do veículo): exibir os campos `km_inicial_evento` e `km_final_evento` como editáveis (admin/gestor) para correção manual quando heurística estiver errada.

## Arquivos
- `supabase/migrations/*` (nova) + insert para popular dados
- `src/hooks/useVehicleOdometerEvent.ts` (novo)
- `src/components/dashboard/charts/OdometerEventChart.tsx` (novo)
- `src/pages/Dashboard.tsx` (adicionar card)
- `src/lib/generateKmPdf.ts` + `src/pages/KmEmissoesPage.tsx` (nova seção)
- `src/lib/systemReportCollector.ts` (incluir bloco)
- `src/pages/VehiclesPage.tsx` (campos editáveis)
