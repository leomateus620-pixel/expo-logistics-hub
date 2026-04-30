## Objetivo

No diálogo "Viagem Iniciada" (`StartTripDialog`), a seção **Agentes & Parceiros** (cards 3D dourados com agentes de viagem / destinatários extras) deve aparecer **somente quando o transporte for do tipo "Aeroporto"**. Para qualquer outro tipo (Hotel, Parque, Centro, Escolta Policial, Outros), essa seção fica oculta — apenas as mensagens dos hóspedes são exibidas.

## Por que

Hoje os destinatários (`notification_recipients` com `notify_on_start = true`) são incluídos em **todo** disparo de início de viagem, independente do tipo. Como esses contatos representam agentes de viagem que precisam ser avisados sobre buscas no aeroporto, faz sentido exibi-los apenas quando o transporte é do tipo `Aeroporto`.

## Mudanças

### 1. `src/components/transport/StartTripDialog.tsx`
- Adicionar prop opcional `isAirport?: boolean` em `StartTripDialogProps`.
- Filtrar a lista de `recipients` para um array vazio quando `isAirport !== true`, fazendo com que o bloco de separator + cards `RecipientCard3D` não seja renderizado (a condição `recipients.length > 0` já existente cuida disso).
- Os hóspedes (`kind !== 'recipient'`) continuam sendo exibidos normalmente em qualquer tipo de transporte.

### 2. `src/pages/TransportsPage.tsx`
- Guardar o `titulo` do transporte iniciado em um novo state (`startTripTitulo`) nos dois pontos onde `setStartTripDialogOpen(true)` é chamado (criação direta e edição/início posterior — linhas ~603 e ~836).
- Passar `isAirport={startTripTitulo === 'Aeroporto'}` para `<StartTripDialog />` (linha ~1232).

## Resultado esperado

- Transporte Aeroporto → continua mostrando hóspedes + seção dourada "Agentes & Parceiros" (Fabiana etc.).
- Transporte Hotel / Parque / Centro / Escolta / Outros → mostra apenas os cards dos hóspedes; a seção "Agentes & Parceiros" desaparece por completo (sem separador, sem título, sem cards).

Sem migrações de banco. Sem mudança de contrato em `transport-lifecycle` — apenas filtragem visual no cliente.
