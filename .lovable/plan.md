## Problema

No menu **Agenda**, os cards de transporte não exibem o veículo vinculado (placa/modelo). A informação `vehicle_id` existe na tabela `transports` e já é usada no `TransportCard` da página de Transportes (`🚙 {placa} · {modelo}`), mas o merge feito em `AgendaPage.tsx` (linhas 166–223) descarta esse campo ao montar o item exibido pelo `AgendaItemCard3D`.

## Causa raiz

- Em `src/pages/AgendaPage.tsx`, o map dos `allTransports` não propaga `vehicle_id`.
- O componente `AgendaItemCard3D` não recebe nem renderiza dados de veículo.
- A página não consome `useVehicles()` para resolver placa/modelo.

## Correção proposta

### 1. `src/pages/AgendaPage.tsx`
- Importar e usar `useVehicles()` para obter a lista de veículos da org.
- No map de `allTransports`, anexar:
  - `_vehicleId: t.vehicle_id`
  - `_vehicle: vehicles.find(v => v.id === t.vehicle_id)` → `{ placa, modelo }` (ou `null`).
- Adicionar `vehicles` na dependência do `useMemo`.
- Passar `vehicles` para o gerador de PDF e incluir uma linha `🚙 Veículo: {placa} · {modelo}` no HTML do PDF (logo após "Local"), mantendo o padrão visual existente.

### 2. `src/components/agenda/AgendaItemCard3D.tsx`
- Adicionar ícone `Car` (lucide-react) ao lado dos chips existentes (Local, Responsável, Comissão).
- Renderizar **apenas para itens de transporte** (`isTransport && item._vehicle`):
  ```tsx
  <span className="inline-flex items-center gap-1 text-[10px] text-foreground/85">
    <Car className="w-3 h-3 text-gold/85" />
    <span className="font-mono font-semibold">{item._vehicle.placa}</span>
    {item._vehicle.modelo && <span className="text-muted-foreground">· {item._vehicle.modelo}</span>}
  </span>
  ```
- Posicionar logo após o chip de **Responsável** (motorista) para criar agrupamento lógico "quem dirige + o que dirige".
- Caso `isTransport && !item._vehicle` → exibir chip discreto "Sem veículo" em `text-muted-foreground/70` para sinalizar pendência operacional.

### 3. `src/components/agenda/AgendaItemDetailDialog.tsx` (verificação)
- Conferir e, se ausente, adicionar a mesma linha de veículo na visão de detalhe (mantém consistência ao abrir o card).

## Resultado esperado

Cada card de transporte na Agenda passará a exibir, junto ao motorista e à comissão:
`🚗 ABC-1D23 · Toyota Corolla`

E o PDF diário da agenda incluirá a mesma informação por evento de transporte. Eventos manuais (não transporte) permanecem inalterados.

## Arquivos a editar

- `src/pages/AgendaPage.tsx` — anexar veículo ao item + atualizar PDF.
- `src/components/agenda/AgendaItemCard3D.tsx` — renderizar chip de veículo.
- `src/components/agenda/AgendaItemDetailDialog.tsx` — garantir exibição no detalhe (se faltando).