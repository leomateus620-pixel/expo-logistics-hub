# Aviso de Reserva no Card do Carrinho (Frota)

Quando um carrinho elétrico (ex.: G55) tiver uma reserva agendada, o card dele na aba **Frota** vai exibir um selo destacado com a data, o horário e o responsável pela próxima reserva — sem alterar o status real do carrinho.

## Comportamento

Para cada card, calcular a "próxima reserva relevante" entre as reservas com `status = 'agendada'` ou `'em_andamento'`:

1. **Em andamento agora** (`inicio_em <= agora <= fim_em`) → badge vermelho/âmbar pulsante "RESERVADO AGORA · até HH:mm".
2. **Próxima nas próximas 24h** → badge âmbar "Reservado hoje/amanhã às HH:mm".
3. **Futura (>24h)** → badge azul discreto "Reservado dd/MM HH:mm".
4. **Sem reserva ativa/futura** → nada exibido.

Se o carrinho já estiver `em_uso`, o aviso só aparece se a reserva ativa for de **outra pessoa** que não a atual (alerta de conflito) ou se houver uma reserva futura agendada nas próximas 24h.

Tudo em horário **America/Sao_Paulo**.

## Mudanças técnicas

### 1. `src/pages/ElectricCartsPage.tsx`
- Importar `useCartReservations` e obter `reservations`.
- Construir um mapa `reservationsByCart: Record<cartId, CartReservation[]>` filtrando apenas `status in ('agendada','em_andamento')` e `fim_em >= agora`, ordenado por `inicio_em`.
- Passar a próxima reserva (`nextReservation`) como nova prop ao `<ElectricCartCard>`.

### 2. `src/components/electric-carts/ElectricCartCard.tsx`
- Adicionar prop opcional `nextReservation?: CartReservation`.
- Resolver o nome do responsável da reserva:
  - `interno` → `members.find(user_id === responsavel_user_id)?.nome_exibicao` (passar `members` como prop ou já resolver no page e enviar `reservationLabel: string`).
  - `empresa` → `getPartner(empresa_slug)?.nome`.
  - `outros` → `nome_externo`.
- Renderizar um **ReservationBadge** dentro do card (logo abaixo do header `codigo`/`nome`, antes do bloco de status):
  - Layout: pill com ícone `CalendarClock`, texto curto + tooltip/linha secundária com responsável.
  - Cores adaptativas por urgência (ver acima): `bg-destructive/15 text-destructive` (agora), `bg-amber-500/15 text-amber-700 dark:text-amber-300` (24h), `bg-info/15 text-info` (futura).
  - Pulse sutil (`motion-safe:animate-pulse`) apenas no estado "agora".
- Aparece em **todos os status** (disponivel, em_uso, manutencao) — é apenas um aviso informativo.

### 3. Helper inline em `ElectricCartCard.tsx` (ou `src/lib/utils.ts`)
```ts
function formatReservationBadge(r: CartReservation, nowMs: number) {
  const inicio = new Date(r.inicio_em).getTime();
  const fim = new Date(r.fim_em).getTime();
  const isNow = inicio <= nowMs && nowMs <= fim;
  const within24h = inicio - nowMs <= 24*3600*1000;
  // returns { variant: 'now'|'soon'|'future', label, sublabel }
}
```
Usa `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ... })`.

### 4. Tick por minuto
Reaproveitar o `setInterval` existente no card (já roda quando `isInUse`); estender para também rodar quando há `nextReservation` para que o badge transicione automaticamente entre estados (futura → soon → now → some).

## Arquivos modificados
- `src/pages/ElectricCartsPage.tsx` — buscar reservas e mapear por cart.
- `src/components/electric-carts/ElectricCartCard.tsx` — nova prop + badge de reserva + tick estendido.

Sem mudanças no banco, nas RLS ou em edge functions.