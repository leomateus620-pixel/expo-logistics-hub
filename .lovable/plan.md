

# Reset + Teste Completo do Fluxo de Retirada/Devolução de Veículos

## Problemas Identificados no Código

1. **Odômetro não atualiza na retirada**: `handleRetirada` não atualiza `vehicle.km_atual` com o KM de saída. O odômetro só atualiza após devolução. Isso causa inconsistência visual durante o uso.

2. **Custo Estimado ausente nos cards individuais**: Os cards dos veículos mostram "Custo Real" (abastecimentos), mas não mostram o Custo Estimado (KM × R$ 0,65) por veículo.

3. **Invalidação incompleta**: `createUsage` não invalida `['vehicles']`, então após retirada o card pode não refletir o status imediatamente.

## Plano de Execução

### 1. Migração SQL — Reset completo dos dados de uso

```sql
-- Deletar todos os registros de uso
DELETE FROM vehicle_usage;

-- Limpar KM dos transportes (zerar histórico de KM)
UPDATE transports SET km_retirada = NULL, km_devolucao = NULL;

-- Resetar odômetro de todos os veículos para 0
UPDATE vehicles SET km_atual = 0;
```

### 2. Fix: Atualizar odômetro na retirada (`VehiclesPage.tsx`)

No `handleRetirada`, adicionar `km_atual: Number(kmSaida)` no `updateVehicle`:
```typescript
await updateVehicle.mutateAsync({
  id: vehicle.id,
  status: 'em_uso',
  km_atual: Number(kmSaida),  // ← NOVO
  responsavel_user_id: ...
});
```

### 3. Fix: Invalidar queries de veículos após criar usage (`useVehicleUsage.ts`)

No `createUsage.onSuccess`, adicionar invalidação de `['vehicles']`.

### 4. Fix: Mostrar Custo Estimado por veículo nos cards (`VehiclesPage.tsx`)

Substituir "Custo Real" no grid de 3 colunas do card por "Custo Est." calculado como `vehicleKm * 0.65`, mantendo Custo Real visível nos detalhes.

### 5. Teste manual do fluxo completo

Após implementação, testar no browser:
- Confirmar dashboard zerado (0 km, R$ 0,00)
- Retirar 3 veículos com KM diferentes
- Devolver e verificar cálculos
- Confirmar totais do dashboard

## Arquivos Alterados

| Arquivo | Ação |
|---|---|
| SQL migration | Reset de vehicle_usage, transports KM, vehicles km_atual |
| `src/pages/VehiclesPage.tsx` | Fix odômetro na retirada + Custo Estimado nos cards |
| `src/hooks/useVehicleUsage.ts` | Fix invalidação de vehicles no createUsage |

