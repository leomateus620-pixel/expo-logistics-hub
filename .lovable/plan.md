## Confirmação da fonte de autorizados

Sim, a lista de pessoas autorizadas é puxada **diretamente** das autorizações cadastradas em **Mobilidade por Comissão**:

- Hook `useMobilityAuthorizations('patinete')` faz `select * from mobility_authorizations where authorization_type = 'patinete' and org_id = <atual>`.
- Esses registros são gerados automaticamente quando uma comissão envia o formulário (interno ou público) marcando "patinete" para o integrante (via `sync_internal_mobility_form` / `sync_public_mobility_form`).
- No dialog: ordenação `liberado` primeiro, depois alfabética. Se `authorizations.length === 0`, exibe alerta Liquid Glass e desabilita a retirada por "Autorizado".

Isso garante a regra: **só quem tem autorização de patinete cadastrada pode retirar** (nas abas Empresa/Outros há fallback explícito como nos carrinhos).

## Entregas finais

### 1. `src/components/scooters/ScooterPickupDialog.tsx` (novo)
Dialog de **retirada imediata** (sem período), espelhando o fluxo dos carrinhos. Tabs:
- **Autorizado** (default) — Select alimentado por `useMobilityAuthorizations('patinete')`. Selecionar preenche `nome_externo`, `comissao` (snapshot) e referencia o `member_id` em `observacoes`. Telefone obrigatório. Persiste como `tipo_responsavel='outros'`.
- **Empresa** — grid 2 col com logos `PARTNERS` (Coopermil, Banrisul, Celena, Sicredi).
- **Interno** — `useOrgMembers` (membros da organização), comissão auto-preenchida.
Campo "Devolução prevista" opcional (datetime). Submit chama `useScooters().pickup(...)` com payload completo.

### 2. `src/components/scooters/ScooterReservationsTab.tsx` (novo)
Lista de reservas usando `useScooterReservations()`. Filtros por status (agendada/em_andamento/concluida/cancelada) + busca. Renderiza `ScooterReservationCard` com ações: Iniciar agora (status → em_andamento + chama `pickup`), Editar, Cancelar, Concluir.

### 3. `src/components/scooters/ScooterHistorySheet.tsx` (novo)
Sheet lateral mostrando `scooter_history` do patinete: linha do tempo com ação (retirada/devolução), nome/telefone/comissão/origem (autorizado/parceiro/interno), duração, observações e badges Liquid Glass.

### 4. `src/pages/ScootersPage.tsx` (reescrita)
Layout espelhando `ElectricCartsPage.tsx`:
- Header: título "Patinetes Elétricos" + botões `Reservar`, `Retirada`, `Adicionar`.
- Tabs `Frota | Reservas | Autorizados`.
  - **Frota**: filtros (`ScootersFilters`) + grid 1/2/3 colunas de `ScooterCard`. Cada card abre `ScooterHistorySheet` ao clicar em "Histórico" e dispara devolução direta quando em uso.
  - **Reservas**: `ScooterReservationsTab`.
  - **Autorizados**: tabela enxuta listando autorizações de patinete (status, nome, comissão, telefone do responsável operacional) com link "Gerenciar" para `/mobility-auth`.
- Dialogs controlados: `ScooterPickupDialog`, `ScooterReservationDialog`, `ScooterHistorySheet`, e o já existente form de cadastro/edição do patinete.

### 5. Memória `mem://features/scooters-liquid-glass`
Documentar paridade com carrinhos: hooks, tabelas (`scooters`, `scooter_reservations`, `scooter_history`), regra de bloqueio por `mobility_authorizations.authorization_type='patinete'`, fluxo de retirada/reserva/devolução.

### 6. Atualizar `mem://index.md`
Adicionar referência ao novo arquivo de memória.

## Fora de escopo

- Relatório de uso (réplica de `ElectricCartsReportPage`) — pode ser feito numa próxima iteração se desejado.
- Notificações WhatsApp na retirada (não existe nos carrinhos).