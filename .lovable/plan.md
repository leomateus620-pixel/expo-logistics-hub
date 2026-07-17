## Evolução do módulo Cronograma e Eventos — backend relacional, RPCs transacionais, RLS e navegação persistente

Este plano evolui o módulo existente sem recriá-lo. Preserva rotas, autenticação, layout, o seed oficial de 145 eventos e todos os eventos manuais gravados. As tabelas relacionais `cronograma_eventos` / `cronograma_subeventos` ainda não existem no banco desta organização — o hook atual já espera esse schema, então a primeira migration cria a base e as demais evoluem para o modelo completo.

---

### 1. Migrations (aditivas, idempotentes)

**M1 — Base relacional (compatível com o hook atual)**
- `cronograma_eventos` com todos os campos hoje lidos por `fromDbRow` (`org_id`, `source_key`, `title`, `description`, `category`, `event_type`, `source_year`, `start_date`, `end_date`, `month_label`, `week_label`, `status`, `priority`, `location`, `event_time`, `days_remaining`, `commission_slug`, `commission_name`, `responsible_name`, `source_sheet/row/cell/note`, `is_official_seed`, `has_exact_date`, `linked_commissions jsonb`, `subevents jsonb`, `created_by_user_id`, `created_at`, `updated_at`).
- `cronograma_subeventos` com os campos hoje lidos por `fromDbSubeventRow`.
- `cronograma_evento_responsaveis`, `cronograma_evento_comissoes`, `cronograma_evento_logs` já preparados com colunas mínimas.
- ENUMs para `status`, `priority`, `event_type`, `category_key` e `relation_role`.
- `GRANT` para `authenticated` e `service_role`, RLS ligada, policies iniciais por `is_org_member`.
- Trigger `set_updated_at`.

**M2 — Evolução para o modelo completo**
- `commissions`: `slug`, `is_active`, `updated_at`, unicidade `(org_id, slug)`; backfill de slug determinístico (minúsculo, sem acento, hífen). Colisões marcadas em `cronograma_migration_pending`.
- `cronograma_eventos`: `category_key`, `start_time`, `end_time`, `pending_reason`, `decision_needed`, `lock_version bigint not null default 1`. Constraints: `title` não vazio, `end_date >= start_date`, `end_time` exige `start_time`, mesma data exige `end_time > start_time`, `source_year in (2026,2027,2028)`, coerência `has_exact_date`/`start_date`, unicidade `(org_id, source_key)`.
- `cronograma_subeventos`: `org_id`, `legacy_key`, `lock_version`, `responsible_name_snapshot`, `commission_name_snapshot`, FK composta `(parent_event_id, org_id)` → `cronograma_eventos(id, org_id)`, unicidade `(parent_event_id, legacy_key)` quando presente.
- `cronograma_evento_comissoes`: `org_id`, `commission_id`, `commission_slug`, `commission_name_snapshot`, `relation_role`, timestamps; unicidade `(event_id, commission_id)`; índice único parcial para `relation_role='principal'` por evento; CHECK garantindo `org_id` do evento = `org_id` da comissão via FK composta.
- `cronograma_evento_responsaveis`: `org_id`, `org_member_id`, `responsible_type`, `name_snapshot`, `role`, `is_primary`, timestamps; índice único parcial para `is_primary=true`; FK composta para `org_members(user_id, org_id)`.
- Novas tabelas `cronograma_subevento_comissoes` e `cronograma_subevento_responsaveis` com as mesmas regras usando `subevent_id`.
- `cronograma_evento_logs` estendido: `entity_type`, `entity_id`, `previous_value jsonb`, `new_value jsonb`, `user_id`, `request_id`.
- Índices: `(org_id,start_date)`, `(org_id,source_year,start_date)`, `(org_id,status)`, `(org_id,priority)`, `(org_id,category_key)`, `(parent_event_id, sort_order, created_at, id)`, e por pai/objeto em cada tabela de vínculo.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE ...` em bloco `DO $$ ... EXCEPTION WHEN duplicate_object` para idempotência.

**M3 — Backfill em etapas (com relatório)**
- Cria `cronograma_migration_pending(org_id, source_key, entity, reason, payload)` para itens não resolvidos.
- Popula `start_time` a partir de `event_time` quando parseável como `HH:MM`.
- Copia `pending_reason`/`decision_needed` a partir de campos legados sem apagar `source_note`.
- Resolve slugs em `commissions` por organização; conflitos → `pending`.
- Migra `commission_id/slug/name/linked_commissions` para `cronograma_evento_comissoes` (principal = coluna direta; participantes = itens do JSON). Vínculo sem `commission_id` resoluto vira snapshot marcado como pendência.
- Migra `responsible_user_id` para `cronograma_evento_responsaveis` quando a correspondência em `org_members` for única; caso contrário mantém `name_snapshot` como `external` e registra `pending`.
- Migra `subevents jsonb` para `cronograma_subeventos` com `legacy_key = md5(sourceKey||sortOrder||title)`; ON CONFLICT (parent_event_id, legacy_key) DO NOTHING garante idempotência.
- Migra `commissionSlug`/`responsibleName` dos subeventos para as novas tabelas de vínculo.
- Ao final valida contagens antes de tornar `category_key` NOT NULL (aplicando fallback para categoria canônica correspondente).
- Colunas legadas (`linked_commissions`, `subevents`, `commission_*`, `responsible_*`, `event_time`) permanecem por compatibilidade — não são removidas nesta entrega.

**M4 — View + RPCs**
- `create view public.cronograma_eventos_full with (security_invoker=on) as ...` agregando evento, `commissions[]`, `responsibles[]`, `subevents[]` (cada um com seus vínculos), `lock_version`, timestamps. Ordenação determinística por `sort_order, created_at, id`.
- RPCs `SECURITY INVOKER` que derivam org do registro e usam `auth.uid()`:
  - `cronograma_save_event(payload jsonb, expected_lock_version bigint)` — upsert + diff de coleções (omissão = manter, `[]` = remover), audita, retorna evento agregado.
  - `cronograma_save_subevent(payload jsonb, expected_lock_version bigint)` — idem, retorna evento pai agregado.
  - `cronograma_delete_subevent(subevent_id uuid, expected_lock_version bigint)`.
  - `cronograma_reorder_subevents(event_id uuid, ordered_ids uuid[])` — valida que todos pertencem ao evento.
- Erros padronizados: `CRONOGRAMA_NOT_FOUND`, `CRONOGRAMA_PERMISSION_DENIED`, `CRONOGRAMA_VALIDATION_ERROR`, `CRONOGRAMA_CONFLICT`, `CRONOGRAMA_RELATIONSHIP_INVALID` via `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE=...`.
- Auditoria feita dentro das RPCs, agrupada por `request_id` recebido no payload.

**M5 — RLS finais**
- SELECT: `is_org_member(auth.uid(), org_id)` em todas as tabelas do cronograma.
- INSERT/UPDATE: `admin|gestor|operador`.
- DELETE (subevento, vínculos): `admin|gestor`.
- Logs: SELECT restrito a `admin|gestor`.
- Toda policy UPDATE com `USING` e `WITH CHECK`.
- `cronograma_eventos_access` continua sendo verificado no front + capability já existente; a RLS não depende dele.

---

### 2. Camada de leitura (hook)

`useCronogramaEventos`:
- Passa a consultar `cronograma_eventos_full` via `supabase.from('cronograma_eventos_full')` (ou `rpc('cronograma_read_events')` se paginação necessária) em blocos de 500 até esgotar (substitui o `.limit(1000)`).
- Mescla com `officialSeedEvents` só quando `is_official_seed` do banco não existir (transição). Deduplica por `(org_id, source_key)`.
- Bloqueia mutations quando `dbUnavailable === true` ou `!isOnline`, com toast pt-BR ("Modo leitura: sem conexão com o backend").
- Assina `postgres_changes` de `cronograma_eventos`, `cronograma_subeventos`, `cronograma_evento_comissoes`, `cronograma_evento_responsaveis`, `cronograma_subevento_*` filtrado por `org_id` e invalida `['cronograma-eventos', orgId]`.
- Preserva rascunhos locais (sessionEvents) durante refetch (já implementado — só ajustar merge).
- Novas mutations chamam as 4 RPCs e propagam `expected_lock_version`; em `CRONOGRAMA_CONFLICT` invalidam a query e mostram diálogo "Este item foi atualizado por outro usuário — revise a versão mais recente".

---

### 3. Escritas — adapter e formulários

- `modelAdapter.ts` e `EventForm.tsx`/`EventDrawer.tsx` passam a montar um único payload agregado (`event + commissions[] + responsibles[] + subevents[]`) enviado à RPC. Sem múltiplos inserts encadeados.
- Seletores usam `commissions` da org e `org_members_safe` (ativos). Seed deixa de ser fonte dos combos.
- Coleções: `undefined` = manter, `[]` = remover explícito (informado pelo componente que "editou responsáveis"). Estado do form marca `touched` por seção.
- Status derivados (`overdue`, `undated`) continuam calculados apenas na leitura.

---

### 4. Navegação

Em `CronogramaRouteState`:
- Suporta `event=<source_key>`, `subevent=<uuid>`, `mode=view|edit|create` além dos existentes (`view`, `timelineYear`, `timelineMonth`).
- Ao criar via RPC, `navigate({search: {..., event: novoSourceKey, mode: 'view'}})` sem perder `timelineYear/Month`.
- Parâmetros inválidos → estado "Registro não encontrado ou sem acesso" (componente novo `CronogramaMissingState`, pt-BR), sem crash e sem query cross-org.

---

### 5. Tipos

- Regenerar `src/integrations/supabase/types.ts` após migrations.
- Adicionar em `src/lib/cronograma-eventos.ts`:
  - `CronogramaCommissionLink` (com `relationRole`, `commissionId`, `snapshot`), `CronogramaResponsibleLink`, `CronogramaEvent.lockVersion`, `CronogramaSubevent.lockVersion`, `pendingReason`, `decisionNeeded`, `startTime`, `endTime`.
- Remover `cronogramaDb = supabase as unknown as ...`.

---

### 6. Testes

- **DB** (SQL via `pgTAP`-lite em Vitest usando `supabase.rpc`): migração repetível; 145 oficiais + manuais preservados; sem duplicidade em subeventos e vínculos; cross-org rejeitado.
- **RLS**: matriz de papéis (leitura/operador/gestor/admin) por operação.
- **RPC**: criar evento com 2 comissões + 2 responsáveis + 2 subeventos; refresh mantém; edição parcial não apaga coleções omitidas; `[]` remove; conclusão/reabertura de subevento; reorder; conflito de `lock_version`; rollback quando um vínculo falha; auditoria única por `request_id`.
- **Navegação** (Vitest + RTL): query params sobrevivem a refresh; parâmetro inválido não quebra; evento novo abre no mês certo; evento sem data aparece em "Pendências sem data".
- Rodar `bunx vitest run src/test/cronograma*` + `tsgo` + build.

---

### 7. Preservação garantida

- Nenhuma alteração em rotas `/portal`, `/login/cronograma-eventos`, `/cronograma-eventos`, no `AuthGuard`, `OrgGuard`, `ModuleAccessGuard` ou `commissionRegistry`.
- Colunas legadas mantidas por 1 versão; leitura prioriza relacional; escrita nova não atualiza mais o JSON legado.
- Seed oficial continua embutido para bootstrap de organizações novas.
- Fallback offline: apenas leitura do cache/seed, mutations bloqueadas com toast.

### Detalhes técnicos-chave

```
Ordem de execução: M1 → M2 → M3 (backfill) → M4 (view+RPCs) → M5 (RLS restritas)
Cada migration usa CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO $$ EXCEPTION WHEN duplicate_object.
```

O trabalho só é considerado concluído quando: criar/editar via UI persiste comissões, responsáveis e subeventos nas tabelas relacionais (verificável via `supabase--read_query`); refresh recupera tudo; `lock_version` protege escritas concorrentes; e a matriz de testes acima passa.
