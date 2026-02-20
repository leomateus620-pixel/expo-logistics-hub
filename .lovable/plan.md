
# Plano de Migração Cloud — Fenasoja Logística (Mobile-First)

## Resumo

Migrar TODA a aplicação de estado local (Zustand com dados de teste) para banco de dados Cloud como fonte única da verdade, com modelo multi-organização, RLS, auditoria, e navegação mobile-first com bottom tabs.

---

## Fase 1: Banco de Dados — Migração SQL

Uma única migração criando todos os enums, tabelas, índices, constraints, funções auxiliares e políticas RLS.

### Enums novos

- `org_role`: admin, gestor, operador, leitura
- `vehicle_status`: disponivel, em_uso, manutencao, inativo
- `cart_status`: disponivel, em_uso, manutencao, inativo
- `transport_status`: pendente, em_andamento, concluido, cancelado
- `priority_level`: baixa, media, alta, urgente
- `task_status`: pendente, concluida
- `task_recurrence`: nenhuma, diaria, semanal, mensal
- `schedule_status`: rascunho, ativa, encerrada
- `assignment_status`: confirmado, pendente, cancelado
- `audit_action`: create, update, delete, status_change, import
- `cart_action`: retirada, devolucao, mudanca_status, nota

### Tabelas (10 operacionais + 4 auxiliares)

**A) organizations** — id (uuid PK), nome (text NOT NULL), created_at

**B) org_members** — id (uuid PK), org_id (FK), user_id (uuid NOT NULL), role (org_role NOT NULL DEFAULT 'operador'), nome_exibicao (text), cargo (text), telefone (text), avatar_color (text), is_active (bool DEFAULT true), created_at, updated_at. UNIQUE(org_id, user_id)

**C) vehicles** — id (uuid PK), org_id (FK), placa (text NOT NULL), renavam (text), marca (text), modelo (text), ano (int), cor (text), categoria (text DEFAULT 'outro'), km_atual (numeric DEFAULT 0), status (vehicle_status DEFAULT 'disponivel'), responsavel_user_id (uuid), created_at, updated_at. UNIQUE(org_id, placa)

**D) electric_carts** — id (uuid PK), org_id (FK), codigo (text NOT NULL), nome (text), status (cart_status DEFAULT 'disponivel'), responsavel_user_id (uuid), retirada_em (timestamptz), devolucao_prevista_em (timestamptz), devolucao_em (timestamptz), observacoes (text), created_at, updated_at. UNIQUE(org_id, codigo)

**E) cart_history** — id (uuid PK), org_id (uuid NOT NULL), cart_id (FK electric_carts), action (cart_action NOT NULL), before_data (jsonb), after_data (jsonb), actor_user_id (uuid NOT NULL), created_at

**F) guests** — id (uuid PK), org_id (FK), nome (text NOT NULL), tipo (text DEFAULT 'outro'), prioridade (priority_level), hotel_nome (text), checkin_em (timestamptz), checkout_em (timestamptz), telefone (text), email (text), observacoes (text), created_at, updated_at

**G) transports** — id (uuid PK), org_id (FK), titulo (text), guest_id (FK guests nullable), tipo (text DEFAULT 'outro'), origem (text NOT NULL), destino (text NOT NULL), inicio_em (timestamptz NOT NULL), fim_em (timestamptz), status (transport_status DEFAULT 'pendente'), prioridade (priority_level DEFAULT 'media'), passageiros_qtd (int), motorista_user_id (uuid), vehicle_id (FK vehicles nullable), observacoes (text), created_at, updated_at

**H) events** — id (uuid PK), org_id (FK), titulo (text NOT NULL), inicio_em (timestamptz NOT NULL), fim_em (timestamptz NOT NULL), local (text), tipo_tag (text), descricao (text), origem (text DEFAULT 'manual'), external_id (text), created_by_user_id (uuid NOT NULL), created_at, updated_at. UNIQUE(org_id, origem, external_id) WHERE external_id IS NOT NULL

**I) tasks** — id (uuid PK), org_id (FK), titulo (text NOT NULL), descricao (text), prioridade (priority_level DEFAULT 'media'), due_em (timestamptz), status (task_status DEFAULT 'pendente'), recorrencia (task_recurrence DEFAULT 'nenhuma'), recorrencia_regra (jsonb), assignee_user_id (uuid), created_by_user_id (uuid NOT NULL), completed_at (timestamptz), created_at, updated_at

**J) schedules** — id (uuid PK), org_id (FK), nome (text NOT NULL), data_inicio (date NOT NULL), data_fim (date NOT NULL), status (schedule_status DEFAULT 'rascunho'), created_by_user_id (uuid NOT NULL), created_at, updated_at

**K) schedule_shifts** — id (uuid PK), org_id (FK), schedule_id (FK schedules), titulo (text NOT NULL), inicio_em (timestamptz NOT NULL), fim_em (timestamptz NOT NULL), local (text), observacoes (text), created_at, updated_at

**L) shift_assignments** — id (uuid PK), org_id (FK), schedule_shift_id (FK schedule_shifts), member_user_id (uuid NOT NULL), funcao (text), status (assignment_status DEFAULT 'pendente'), created_by_user_id (uuid NOT NULL), created_at, updated_at. UNIQUE(org_id, schedule_shift_id, member_user_id)

**M) audit_log** — id (uuid PK), org_id (uuid NOT NULL), actor_user_id (uuid NOT NULL), entity (text NOT NULL), entity_id (uuid NOT NULL), action (audit_action NOT NULL), before_data (jsonb), after_data (jsonb), created_at

### Funções auxiliares

- `get_user_org_ids(user_uuid)` — retorna array de org_ids do user (SECURITY DEFINER)
- `get_user_org_role(user_uuid, org_uuid)` — retorna o role do user na org (SECURITY DEFINER)
- `is_org_member(user_uuid, org_uuid)` — boolean (SECURITY DEFINER)

### Políticas RLS (todas as tabelas)

Regra geral: SELECT para qualquer membro da org; INSERT/UPDATE/DELETE para admin/gestor (exceto operador que pode CRUD em tasks, transports, guests, events, shift_assignments, e cart_history). audit_log: INSERT para autenticados, SELECT para admin/gestor.

### Indices

- vehicles(org_id, status)
- transports(org_id, status)
- transports(vehicle_id, status) — para checar conflitos
- tasks(org_id, assignee_user_id, status)
- schedule_shifts(schedule_id)
- shift_assignments(schedule_shift_id)
- audit_log(org_id, entity, entity_id)
- cart_history(cart_id)

### Realtime

Habilitar nas tabelas: vehicles, electric_carts, transports, tasks, events, guests

---

## Fase 2: Services Layer

Criar `src/services/` com funções que encapsulam CRUD + auditoria automática.

### Arquivos

- `src/services/supabaseHelpers.ts` — getCurrentOrgId, logAudit
- `src/services/organizationsService.ts` — createOrg, getMyOrgs, getMembers, addMember, updateMember
- `src/services/vehiclesService.ts` — list, create, update, delete (com auditoria)
- `src/services/electricCartsService.ts` — list, create, update, pickup, return, logHistory
- `src/services/guestsService.ts` — list, create, update, delete
- `src/services/transportsService.ts` — list, create, update, changeStatus (com validação de conflito de veículo)
- `src/services/eventsService.ts` — list, create, update, delete
- `src/services/tasksService.ts` — list, create, update, complete, uncomplete, duplicate
- `src/services/schedulesService.ts` — listSchedules, createSchedule, listShifts, createShift, listAssignments, createAssignment, updateAssignment
- `src/services/auditService.ts` — log, listByEntity

### Validações no service

- transportsService: verificar conflito de vehicle_id com transportes sobrepostos
- tasksService.complete(): preencher completed_at automaticamente
- vehiclesService: verificar unicidade de placa na org
- electricCartsService: verificar unicidade de código na org

---

## Fase 3: Hooks React Query

Criar hooks com TanStack React Query para cada entidade, usando os services:

- `src/hooks/useCurrentOrg.ts` — org ativa, membros, contexto de org_id
- `src/hooks/useVehicles.ts` — lista + mutations
- `src/hooks/useElectricCarts.ts` — lista + mutations + history
- `src/hooks/useGuests.ts` — lista + mutations
- `src/hooks/useTransports.ts` — lista + mutations
- `src/hooks/useEvents.ts` — lista + mutations
- `src/hooks/useTasks.ts` — lista + mutations
- `src/hooks/useSchedules.ts` — escalas, turnos, alocações + mutations
- `src/hooks/useOrgMembers.ts` — lista de membros da org (para selects de responsável)
- `src/hooks/useOnlineStatus.ts` — monitor de conexão

Cada hook usará `useQuery` com `staleTime: 30000` e `useMutation` com `invalidateQueries` automático.

---

## Fase 4: Fluxo de Organização (Onboarding)

### Primeiro acesso após login

1. Verificar se o user tem org_members registrado
2. Se NÃO: mostrar tela "Criar Organização" (campo: nome) — cria org + insere org_members com role=admin
3. Se SIM: carregar org_id e ir para Dashboard

### Componente `src/components/OrgGuard.tsx`

Wrapper que verifica org do usuário antes de renderizar conteúdo.

### Página `src/pages/CreateOrgPage.tsx`

Formulário simples de criação de organização.

---

## Fase 5: UI Mobile-First

### Bottom Tabs (mobile)

Substituir o header hamburger por uma barra de navegação inferior fixa com 5 tabs:

```text
+--------+--------+--------+---------+--------+
|  Home  | Frota  | Agenda |Checklist|  Mais  |
+--------+--------+--------+---------+--------+
```

A tab "Mais" abre um sheet/drawer com: Transportes, Hóspedes, Carrinhos Elétricos, Equipe, Configurações, Sair.

### Componente `src/components/BottomTabs.tsx`

Barra fixa `fixed bottom-0`, ícones + labels, highlight na tab ativa. Visível apenas em mobile.

### Componente `src/components/OfflineBanner.tsx`

Banner fixo "Sem conexão" quando `navigator.onLine === false`.

### Atualizar `src/components/Layout.tsx`

- Mobile: remover header hamburger, adicionar BottomTabs, padding-bottom 64px no main
- Desktop: manter sidebar existente

### Atualizar `src/components/Sidebar.tsx`

- Manter links atuais (sem mudança de menus)
- Adicionar link para Configurações

---

## Fase 6: Refatorar TODAS as Páginas

Cada página deixa de usar `useAppStore()` e passa a usar os hooks React Query. Nenhuma mudança nos menus/telas existentes — apenas a fonte de dados muda.

### Dashboard (`src/pages/Dashboard.tsx`)

- Contadores: veículos disponíveis, elétricos em uso, transportes ativos, tarefas pendentes — via queries ao banco
- Listas: próximos transportes, eventos de hoje, checklist de amanhã, equipe disponível — tudo do banco

### Veículos Botolli (`src/pages/VehiclesPage.tsx`)

- `useVehicles()` em vez de `useAppStore().vehicles.filter(car)`
- `useOrgMembers()` para selects de responsável
- Mutations para add/edit/pickup/return

### Carrinhos Elétricos (`src/pages/ElectricCartsPage.tsx`)

- `useElectricCarts()` em vez de `useAppStore().vehicles.filter(electric)`
- Pickup/return gravando em cart_history
- Histórico vindo de cart_history

### Transportes (`src/pages/TransportsPage.tsx`)

- `useTransports()` + `useGuests()` para vincular guest_id
- `useOrgMembers()` e `useVehicles()` para selects
- Mutations com validação de conflito

### Hóspedes (`src/pages/GuestsPage.tsx`)

- `useGuests()` + `useTransports()` para transportes vinculados (agora por guest_id)

### Agenda (`src/pages/AgendaPage.tsx`)

- `useEvents()` para listar/criar eventos

### Checklist (`src/pages/ChecklistPage.tsx`)

- `useTasks()` para listar/criar/completar tarefas
- Filtros por data (hoje/amanhã)

### Equipe (`src/pages/TeamPage.tsx`)

- `useOrgMembers()` para listar membros da org
- `useTasks()` com filtro por assignee para contadores (pendentes/concluídas)
- `useTransports()` com filtro por motorista_user_id + status=em_andamento para badge "Em transporte"
- `useSchedules()` para escalas, turnos, alocações
- Manter: Adicionar membro (com criação de acesso), Cadastrar Escala, Ver Escala Completa
- Derivar estado real: "Em transporte" vem de transports em_andamento, não de dados inventados

### Settings (`src/pages/SettingsPage.tsx`) — nova

- Gerenciar membros da org (roles)
- Ver audit_log
- Perfil do usuário

---

## Fase 7: Remover Zustand

- Deletar `src/store/useAppStore.ts`
- Remover todos os imports de useAppStore em todas as páginas
- Os dados de teste (initialTeam, initialVehicles, etc.) são eliminados — o app começa vazio e o usuário cadastra tudo manualmente

---

## Fase 8: Rotas atualizadas

```text
/                -> Dashboard
/vehicles        -> VehiclesPage (Veículos Botolli)
/electric-carts  -> ElectricCartsPage (Carrinhos Elétricos)
/transports      -> TransportsPage
/guests          -> GuestsPage (Hóspedes)
/agenda          -> AgendaPage
/checklist       -> ChecklistPage
/team            -> TeamPage (Equipe)
/settings        -> SettingsPage (nova)
```

Nenhuma página existente é removida — os mesmos 8 menus permanecem.

---

## Fase 9: Edge Function — create-user atualizada

A edge function `create-user` será atualizada para também inserir o novo usuário como org_member na mesma organização do admin que está criando, com role e cargo fornecidos.

---

## Resumo de Arquivos

### Novos (criados)

- `src/services/supabaseHelpers.ts`
- `src/services/organizationsService.ts`
- `src/services/vehiclesService.ts`
- `src/services/electricCartsService.ts`
- `src/services/guestsService.ts`
- `src/services/transportsService.ts`
- `src/services/eventsService.ts`
- `src/services/tasksService.ts`
- `src/services/schedulesService.ts`
- `src/services/auditService.ts`
- `src/hooks/useCurrentOrg.ts`
- `src/hooks/useVehicles.ts`
- `src/hooks/useElectricCarts.ts`
- `src/hooks/useGuests.ts`
- `src/hooks/useTransports.ts`
- `src/hooks/useEvents.ts`
- `src/hooks/useTasks.ts`
- `src/hooks/useSchedules.ts`
- `src/hooks/useOrgMembers.ts`
- `src/hooks/useOnlineStatus.ts`
- `src/components/BottomTabs.tsx`
- `src/components/OfflineBanner.tsx`
- `src/components/OrgGuard.tsx`
- `src/pages/CreateOrgPage.tsx`
- `src/pages/SettingsPage.tsx`

### Removidos

- `src/store/useAppStore.ts`

### Modificados

- `src/App.tsx` — adicionar rota /settings, wrapping com OrgGuard
- `src/components/Layout.tsx` — bottom tabs mobile, offline banner
- `src/components/Sidebar.tsx` — link para settings
- `src/components/AuthGuard.tsx` — integrar verificação de org
- `src/pages/Dashboard.tsx` — hooks Cloud
- `src/pages/VehiclesPage.tsx` — hooks Cloud
- `src/pages/ElectricCartsPage.tsx` — hooks Cloud
- `src/pages/TransportsPage.tsx` — hooks Cloud
- `src/pages/GuestsPage.tsx` — hooks Cloud
- `src/pages/AgendaPage.tsx` — hooks Cloud
- `src/pages/ChecklistPage.tsx` — hooks Cloud
- `src/pages/TeamPage.tsx` — hooks Cloud
- `supabase/functions/create-user/index.ts` — adicionar org_member

### Migração SQL

- 1 arquivo com todas as tabelas, enums, índices, RLS, funções auxiliares e realtime

---

## Ordem de execução

1. Criar migração SQL (todas tabelas + enums + RLS + índices + funções + realtime)
2. Criar services layer (10 arquivos)
3. Criar hooks React Query (10 arquivos)
4. Criar componentes compartilhados (BottomTabs, OfflineBanner, OrgGuard)
5. Criar páginas novas (CreateOrgPage, SettingsPage)
6. Atualizar edge function create-user
7. Refatorar todas as 8 páginas para hooks Cloud
8. Atualizar Layout (bottom tabs mobile) + Sidebar (link settings)
9. Atualizar App.tsx (rotas + OrgGuard)
10. Remover useAppStore.ts

**Nota:** Devido ao volume (25+ arquivos novos, 13 modificados, 1 migração grande), a implementação será feita em etapas incrementais. Primeira rodada: banco + services + hooks + componentes base. Segunda rodada: refatorar todas as telas. Terceira rodada: testes e ajustes.
