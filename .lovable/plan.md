## Entrega única — Cronograma e Eventos: schema completo, RPCs, hook/adapter, navegação e testes

Executarei M2 → M5 + código + testes em uma única passagem, sem pausas entre etapas. M1 já está aplicada (tabelas base criadas na rodada anterior).

---

### 1. Migrations restantes (aplicadas em sequência na mesma rodada)

**M2 — Evolução do schema**
- `commissions`: `slug text`, `is_active bool default true`, `updated_at`; backfill de `slug` determinístico (lowercase, sem acento, `-`); unicidade `(org_id, slug)`; conflitos vão para `cronograma_migration_pending`.
- `cronograma_eventos`: `category_key text`, `start_time time`, `end_time time`, `pending_reason text`, `decision_needed text`, `lock_version bigint not null default 1`. Constraints: `title` não vazio; `end_date >= start_date`; `end_time` exige `start_time`; mesma data ⇒ `end_time > start_time`; `source_year in (2026,2027,2028)`; `has_exact_date=false` ⇒ `start_date is null` OR vice-versa coerente. Unicidade `(org_id, source_key)` já existe.
- `cronograma_subeventos`: `org_id uuid not null`, `legacy_key text`, `lock_version bigint`, `responsible_name_snapshot`, `commission_name_snapshot`; FK composta `(parent_event_id, org_id) → cronograma_eventos(id, org_id)` (adiciona `UNIQUE(id, org_id)` no pai); unicidade parcial `(parent_event_id, legacy_key) WHERE legacy_key IS NOT NULL`.
- `cronograma_evento_comissoes`: `org_id`, `commission_slug`, `commission_name_snapshot`, `relation_role` já criados na M1; adiciona índice único parcial `(event_id) WHERE relation_role='principal'`; adiciona `UNIQUE(id, org_id)` em `commissions` + FK composta garantindo mesma org.
- `cronograma_evento_responsaveis`: adiciona `org_id`, índice único parcial `(event_id) WHERE is_primary=true`, FK composta `(org_member_user_id, org_id) → org_members(user_id, org_id)` quando `responsible_type='member'`.
- Novas tabelas `cronograma_subevento_comissoes` e `cronograma_subevento_responsaveis` com as mesmas regras (via `subevent_id`), GRANTs, RLS, triggers, unicidade e índices únicos parciais análogos.
- `cronograma_evento_logs`: já tem `entity_type/entity_id/previous_value/new_value/user_id/request_id`. Índice em `request_id`.
- Índices extras: `(org_id, priority)`, `(org_id, category_key)`, `(org_id, has_exact_date)`.
- Realtime das duas novas tabelas de subevento adicionado ao publication.

**M3 — Backfill idempotente**
- Cria `cronograma_migration_pending(org_id, source_key, entity, reason, payload jsonb, created_at)`.
- Popula `start_time` a partir de `event_time` quando bater regex `^\d{1,2}:\d{2}$`.
- Preenche `category_key` a partir de `category` via `CASE` para as categorias canônicas do seed; fallback → `outros`.
- Resolve `commission_id` por `(org_id, slug)`; migra `commission_slug/commission_name` → `cronograma_evento_comissoes(relation_role='principal')`; itens de `linked_commissions jsonb` → `relation_role='participante'`; ON CONFLICT (event_id, commission_id) DO NOTHING.
- Migra `responsible_name` → `cronograma_evento_responsaveis(is_primary=true, responsible_type='external', name_snapshot=…)` quando não houver membro correspondente único; caso único → `responsible_type='member', org_member_user_id=…`.
- Migra `subevents jsonb` → `cronograma_subeventos` calculando `legacy_key = md5(sourceKey||sort_order||title)`, ON CONFLICT (parent_event_id, legacy_key) DO NOTHING.
- Sub-vínculos: cria vínculos de comissão/responsável dos subeventos a partir dos campos legados.
- Colunas legadas permanecem por compatibilidade.

**M4 — View agregada + RPCs**
- View `public.cronograma_eventos_full WITH (security_invoker=on)` retornando cada evento com `commissions jsonb[]`, `responsibles jsonb[]`, `subevents jsonb[]` (cada subevento já traz seus `commissions` e `responsibles`), `lock_version`. Ordenação de subeventos: `sort_order, created_at, id`.
- RPCs (todas `SECURITY INVOKER`, `SET search_path = public`, derivam `org_id` do registro):
  - `cronograma_save_event(payload jsonb, expected_lock_version bigint DEFAULT NULL)` → upsert + diff (`undefined` = mantém, `[]` = remove) para `commissions[]`, `responsibles[]`, `subevents[]` (subevents inline suportados). Incrementa `lock_version`, valida coerência de datas/times, audita 1 linha por operação com `request_id`. Retorna JSON agregado da view.
  - `cronograma_save_subevent(payload jsonb, expected_lock_version bigint DEFAULT NULL)` → idem para subevento; retorna o evento pai agregado.
  - `cronograma_delete_subevent(subevent_id uuid, expected_lock_version bigint DEFAULT NULL)`.
  - `cronograma_reorder_subevents(event_id uuid, ordered_ids uuid[])` — valida pertencimento; atualiza `sort_order` incremental.
- Erros padronizados via `RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CRONOGRAMA_*: detalhes'` para: `NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `CONFLICT`, `RELATIONSHIP_INVALID`.
- `GRANT EXECUTE` para `authenticated`.

**M5 — RLS finais**
- Reafirma policies das tabelas M1 (já criadas) e cria equivalentes para as novas tabelas M2 (`cronograma_subevento_comissoes/_responsaveis`).
- SELECT: `is_org_member`. INSERT/UPDATE: `admin|gestor|operador`. DELETE de vínculos e subeventos: `admin|gestor`. Logs SELECT: `admin|gestor`.
- Toda policy `UPDATE` com `USING` + `WITH CHECK`.

---

### 2. Hook `useCronogramaEventos`

- Substitui `from('cronograma_eventos').select('*')` + segunda query por **uma única leitura** de `cronograma_eventos_full` (paginada em blocos de 500 até esgotar) — remove o `.limit(1000)`.
- Novo tipo `CronogramaEventFull` reflete a view (com `commissions`, `responsibles`, `subevents` já expandidos).
- Mescla com `officialSeedEvents` só quando `is_official_seed` do banco não existir (transição). Dedupe por `(org_id, source_key)`.
- Mutations passam a chamar as 4 RPCs (`supabase.rpc(...)`) enviando `expected_lock_version` e `request_id` (uuid do cliente). Trata `CRONOGRAMA_CONFLICT` invalidando cache + toast "Este item foi atualizado por outro usuário — recarregando a versão mais recente".
- Canal Realtime único filtrado por `org_id` nas 6 tabelas relevantes; invalida `['cronograma-eventos', orgId]` (throttle 500ms).
- Mutations bloqueadas quando `!isOnline || dbUnavailable` com toast pt-BR; drafts preservados em `sessionEvents` (já existe).
- Remove o cast `cronogramaDb = supabase as unknown as ...`; usa types regenerados.

---

### 3. Adapter + formulários

- `modelAdapter.ts`: novo `toSaveEventPayload(event)` produzindo `{ event, commissions[], responsibles[], subevents[], request_id, expected_lock_version }`. `undefined` = manter; `[]` = remover. Marca `touched` por seção (formulário controla).
- `EventForm.tsx` / `EventDrawer.tsx`:
  - Selects de comissão/responsável usam `useCommissions()` e `useOrgMembers()` (não mais o seed).
  - Permite múltiplas comissões (principal + participantes) e múltiplos responsáveis (primário + demais).
  - Envia payload agregado à RPC `cronograma_save_event`; sem inserts encadeados.
- `CronogramaSubeventForm` (novo, extraído do drawer): envia `cronograma_save_subevent` / `_delete_subevent`; drag‑and‑drop chama `cronograma_reorder_subevents`.

---

### 4. Navegação em `CronogramaRouteState`

- Suporta `event=<source_key>`, `subevent=<uuid>`, `mode=view|edit|create` além de `view`, `timelineYear`, `timelineMonth` já existentes.
- Após criar, `navigate({ search: { ..., event: novoSourceKey, mode: 'view' } })` sem perder o mês selecionado.
- Parâmetros inválidos ou sem acesso → novo componente `CronogramaMissingState` (pt-BR, botão "Voltar à linha do tempo"), sem crash e sem query cross-org.

---

### 5. Tipos e utilitários

- Regenera `src/integrations/supabase/types.ts` após migrations (automático).
- Em `src/lib/cronograma-eventos.ts`: adiciona `CronogramaCommissionLink { commissionId, slug, name, relationRole }`, `CronogramaResponsibleLink { userId, name, role, isPrimary, type }`, campos `lockVersion`, `pendingReason`, `decisionNeeded`, `startTime`, `endTime`.
- Novo helper `cronograma-rpc.ts` com wrappers tipados e mapeamento de erros para toasts pt-BR.

---

### 6. Testes

- `src/test/cronogramaSchema.test.ts` (novo, integração leve via `supabase.rpc`): idempotência do backfill; 145 oficiais + eventos manuais preservados; cross-org rejeitado.
- `src/test/cronogramaRpc.test.ts` (novo): criar evento com 2 comissões + 2 responsáveis + 2 subeventos; refetch; edição parcial não apaga; `[]` remove; conclusão/reabertura de subevento; reorder; `lock_version` conflict; rollback quando vínculo é inválido; auditoria única por `request_id`.
- `src/test/cronogramaDataIntegrity.test.ts`: atualizado para o novo formato agregado.
- `src/test/cronogramaRouteRecovery.test.tsx`: novos casos para `event/subevent/mode` inválidos, criação retornando ao mês certo, evento sem data em "Pendências".
- Verificação final: `bunx vitest run src/test/cronograma*` + `tsgo` (sem `tsc --noEmit` conforme diretriz) + build.

---

### 7. Preservação garantida (validado ao final da entrega)

- Rotas `/portal`, `/login/cronograma-eventos`, `/cronograma-eventos`, guards e `commissionRegistry` intocados.
- Colunas JSON legadas mantidas — leitura prioriza relacional; escrita nova não regrava JSON legado.
- Seed oficial embutido para bootstrap; RPC de seed continua funcionando.
- Fallback offline: leitura via cache/seed; mutations bloqueadas com toast.
- Nada relacionado a `transport_weather_snapshots` (feature pausada) é tocado.

```
Ordem de execução em uma rodada:
  Migrations: M2 → M3 → M4 → M5 (cada uma via supabase--migration)
  Código: tipos → hook → adapter/forms → navegação → testes
  Verificação: vitest + tsgo + build
```

Critério de conclusão: criar/editar via UI persiste comissões, responsáveis e subeventos nas tabelas relacionais (conferível por `supabase--read_query`); refresh mantém tudo; `lock_version` protege escritas concorrentes; todos os testes do cronograma passam.
