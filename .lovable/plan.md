

## Plano: Corrigir status de veículos e erro na devolução

### Problemas identificados

**1. Status inconsistente**: `handleRetirada` cria um registro em `vehicle_usage` mas **nunca atualiza** `vehicles.status` para `em_uso`. Na devolução, atualiza `km_atual` mas **não muda** o status de volta para `disponivel`. Resultado: card mostra "Disponível" mas ao abrir aparece "Veículo em uso".

**2. Erro na devolução**: `handleDevolucao` chama `updateVehicle.mutateAsync()` que faz UPDATE na tabela `vehicles`. A RLS policy `vehicles_update` só permite `admin` e `gestor`. Usuários com role `operador` conseguem atualizar `vehicle_usage` (permitido pela policy) mas **falham** ao tentar atualizar `vehicles` (bloqueado pela policy). Isso causa o erro.

### Correções

**A. Atualizar RLS de `vehicles_update`** (migração SQL):
Adicionar `operador` à policy de UPDATE de `vehicles`, mesma lógica já usada em `vehicle_usage_update`. Operadores precisam atualizar `km_atual` e `status` durante retirada/devolução.

**B. `src/pages/VehiclesPage.tsx` — `handleRetirada`** (linha ~501-513):
Após criar o usage, também chamar:
```ts
await updateVehicle.mutateAsync({ 
  id: vehicle.id, 
  status: 'em_uso',
  responsavel_user_id: responsavelId || null 
});
```

**C. `src/pages/VehiclesPage.tsx` — `handleDevolucao`** (linha ~516-533):
Na chamada existente de `updateVehicle`, incluir mudança de status:
```ts
await updateVehicle.mutateAsync({ 
  id: vehicle.id, 
  km_atual: Number(kmChegada), 
  status: 'disponivel',
  responsavel_user_id: null 
});
```

### Resultado
- Status correto no card e no detalhe
- Devolução funciona para todos os roles
- Dados consistentes entre `vehicles` e `vehicle_usage`

