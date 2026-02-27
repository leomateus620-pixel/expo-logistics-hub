

# Plano: Buscar Total KM dos Transportes

O `totalKm` atual vem da tabela `vehicle_usage`. O pedido é calcular a partir da tabela `transports`, usando `km_retirada` e `km_devolucao`.

## Alteração em `src/hooks/useVehicleUsage.ts`

Substituir a query `vehicle_usage_all` que busca `km_rodados` da tabela `vehicle_usage` por uma query na tabela `transports`:
- Buscar todos os transportes da org que tenham `km_retirada` e `km_devolucao` preenchidos (ambos NOT NULL)
- Calcular `totalKm` como soma de `(km_devolucao - km_retirada)` para cada transporte
- Manter a invalidação ao concluir transportes

## Alteração em `src/pages/VehiclesPage.tsx`

Nenhuma alteração necessária — já usa `totalKm * 0.65` corretamente.

## Arquivos a modificar
- `src/hooks/useVehicleUsage.ts` — trocar fonte de dados de `vehicle_usage.km_rodados` para `transports.km_retirada / km_devolucao`

