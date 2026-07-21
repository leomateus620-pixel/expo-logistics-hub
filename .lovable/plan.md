
# Sincronização Google Agenda + Notificações Inteligentes

Preservar 100% do módulo "Cronograma e Eventos", a Linha do Tempo e os 174 eventos atuais. Nada será recriado, migrado ou duplicado. Toda a nova infraestrutura é aditiva.

## 1. Fundações

**Conector**: Google Calendar App User Connector (`google_calendar`) — 1 conexão OAuth por usuário autenticado (nunca por comissão). Escopos mínimos: `userinfo.email`, `userinfo.profile`, `https://www.googleapis.com/auth/calendar` (necessário para criar calendário secundário; fallback para `calendar.events` se administrador negar). Offline access habilitado — obrigatório para jobs em background.

**Fluxo**: consentimento via `connectAppUser`; todas as chamadas Google feitas em Edge Functions via `callAsAppUser` do gateway Lovable. Tokens ficam no gateway; app nunca vê refresh/access tokens. Callback OAuth: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`.

Pré-requisito operacional (fora do código): admin do workspace precisa registrar o client OAuth Google via `connector_app_user--connect_client` antes do primeiro uso; documentado no card de status.

## 2. Novas tabelas (aditivas — Linha do Tempo intocada)

Todas em `public`, com RLS estrita e GRANTs. Nenhuma altera `cronograma_eventos*`.

- `google_calendar_connections` — 1 linha por usuário. Colunas: `user_id` (PK/unique), `org_id`, `google_email`, `secondary_calendar_id`, `status` (`connected|reconnect_required|disconnected|error`), `scopes_granted`, `last_sync_at`, `last_error`, `connected_at`. Sem tokens.
- `google_calendar_event_map` — mapeamento idempotente. Único: `(user_id, event_id)`. Colunas: `user_id`, `event_id` (FK `cronograma_eventos`), `subevent_id` (nullable, FK `cronograma_subeventos`), `google_event_id`, `google_calendar_id`, `content_hash`, `last_synced_at`, `deleted_at`.
- `google_sync_outbox` — fila durável. Colunas: `id`, `user_id`, `event_id`, `subevent_id`, `operation` (`upsert|delete`), `payload_hash`, `status` (`queued|in_flight|done|failed|dead_letter|reconnect_required`), `attempts`, `next_attempt_at`, `last_error`, `dedupe_key` (unique) para colapsar duplicatas do mesmo `(user, event, versão)`.
- `event_reminder_deliveries` — entrega idempotente. Único: `(user_id, event_id, event_version, offset_minutes)`. Colunas: `scheduled_for`, `sent_at`, `channel` (`email`), `status`, `last_error`.
- `notification_session_seen` — controla exibição única por sessão. `(user_id, session_id)` único, `shown_at`.

**RLS**: dono lê apenas o próprio (`user_id = auth.uid()`). Escrita de outbox/deliveries só por `service_role`. `google_calendar_event_map` legível por dono + admins da org. Views auxiliares em `security_invoker=on`.

## 3. Edge Functions

Todas em `supabase/functions/`. Nenhuma exposta ao browser fora do necessário.

1. `google-calendar-connect` — POST: recebe callback bem-sucedido, grava `google_calendar_connections`, cria calendário secundário "FENASOJA – Cronograma e Eventos" (fallback: primário), enfileira backfill.
2. `google-calendar-disconnect` — remove conexão, marca outbox pendente como cancelada, mantém eventos passados no Google.
3. `google-sync-worker` — cron `*/1 * * * *`. Lê `google_sync_outbox` em lotes de 50, concorrência 5, respeita 429/5xx com backoff exponencial + jitter, marca `dead_letter` após 6 tentativas, distingue `reconnect_required` (401/403 invalid_grant). Sem `Promise.all` ilimitado. Uma falha por usuário não bloqueia outros.
4. `google-sync-enqueue` — invocada por triggers/RPC do cronograma para enfileirar operações (upsert/delete) por usuário afetado.
5. `reminder-scheduler` — cron `*/5 * * * *`. Materializa entregas 24h/2h antes de cada evento futuro autorizado dos membros ativos, respeitando `event_version` para invalidar após reschedule.
6. `reminder-sender` — cron `*/1 * * * *`. Envia via infra transacional Lovable (`send-transactional-email`) com `idempotencyKey = user:event:version:offset`.
7. `next-events-feed` — endpoint autenticado usado pelo bell/notificação: retorna até 3 próximos eventos das comissões ativas do usuário, deduplicados, com deep link `/cronograma-eventos?event=<id>` (subevento com `&sub=<id>`).

## 4. Triggers de enfileiramento

Triggers `AFTER INSERT/UPDATE/DELETE` em: `cronograma_eventos`, `cronograma_subeventos`, `cronograma_evento_comissoes`, `org_members` (add/remove/deactivate). Trigger chama função SECURITY DEFINER `enqueue_google_sync(event_id, affected_user_ids[], op)`:
- Calcula `content_hash` do evento + subeventos + comissões.
- Faz upsert em `google_sync_outbox` por `dedupe_key = user_id|event_id|content_hash|op` (colapsa duplicatas).
- Cancela entregas de reminder pendentes se datas mudaram; nova versão gera novas.

Remoção de membro: enfileira `delete` apenas para eventos futuros; passado preservado.

## 5. Mapeamento de evento para Google

- Título, descrição rica (comissão, evento principal, sub-eventos sem data, deep link ao sistema, marcação "Gerido pelo FENASOJA").
- Timezone `America/Sao_Paulo`. Sem hora → all-day.
- `location` quando existir.
- `extendedProperties.private.fenasoja_event_id` e `fenasoja_content_hash`.
- Subeventos com data/hora próprios viram eventos Google independentes com `extendedProperties.private.fenasoja_parent_id`; sem data ficam apenas na descrição do principal.
- Reminders Google: popup 24h e 2h. E-mail fica com a infra transacional (evita duplicidade).
- Update sempre reutiliza `google_event_id` armazenado; se 404, recria e atualiza mapping.

## 6. UI

- **Settings → nova aba "Google Agenda"** (`src/components/settings/GoogleCalendarSection.tsx`): estados PT-BR exatos exigidos, e-mail conectado, última sync, comissões cobertas, botões conectar/reconectar/desconectar, contador de backfill em progresso.
- **Bell global no `Layout.tsx`**: componente `UpcomingEventsBell` consumindo `next-events-feed`. Toast "sessionflash" mostrado 1× por sessão (controle em `notification_session_seen` + `sessionStorage`). Cada item: título, data/hora, comissão, local, countdown ("amanhã", "em 2 dias"), badge principal/sub, botão "Ver evento" navegando ao deep link da Linha do Tempo.
- **Painel admin** (`/admin/google-sync`): cards de usuários conectados, pendentes, sucessos/falhas do dia, botão "Reprocessar" em itens `dead_letter`. Sem exposição de tokens ou dados sensíveis.

Nenhuma rota, componente ou registro existente da Linha do Tempo é alterado além da adição do bell no shell autenticado.

## 7. Backfill dos 174 eventos

Ao conectar, `google-calendar-connect` insere no outbox uma operação `upsert` por evento futuro/passado das comissões ativas do usuário (paginado 100/página, marcado `initial_backfill=true`). `google-sync-worker` processa sem bloquear a UI. Contador de progresso exibido no card Google Agenda. Reexecutar backfill é idempotente via `content_hash`.

## 8. Segurança

- RLS em todas as novas tabelas; `authenticated` só vê próprios dados.
- Edge Functions validam JWT + membership antes de agir.
- Nunca logar tokens; logs mascaram e-mail (`z***@dominio.com`).
- `service_role` usado apenas dentro das funções; endpoints internos validam origem via header assinado.
- `verify_credentials` chamado no início de cada job para detectar revogação e transitar para `reconnect_required` sem gastar rate limit.

## 9. Testes e validação

- Migrações com GRANTs + RLS revisados.
- Vitest: mapeamento evento→Google (all-day, timezone, subeventos), dedupe de outbox, invalidação de reminders em reschedule, feed próximos-3, filtro de comissões inativas.
- Testes de integração (script Deno) para worker: 429 backoff, 401 → reconnect_required, 404 → recria.
- Verificação manual via Playwright dos 14 critérios de aceitação (mobile + desktop).
- Consulta pós-deploy: `SELECT COUNT(*) FROM cronograma_eventos` deve permanecer 174.

## Detalhes técnicos

```text
cronograma_eventos ──┐
cronograma_subeventos┤──trigger──► enqueue_google_sync ──► google_sync_outbox ──► google-sync-worker ──► Google Calendar API
cronograma_evento_comissoes ─┘                                                       │
org_members ────────────────────────────────────────────────────────────────────────► atualiza google_calendar_event_map
                                                                                     │
cronograma_eventos ──► reminder-scheduler ──► event_reminder_deliveries ──► reminder-sender ──► send-transactional-email
                                                                                     │
next-events-feed ◄── Layout bell (UpcomingEventsBell) — 1× por sessão via notification_session_seen
```

Rate limit: 5 chamadas Google/segundo por worker, backoff base 2s ± jitter 500ms, máx 6 tentativas. Batch de 50 outbox rows por tick. Pior caso 34.800 ops → ~2h processamento com 1 worker.

Escopos e client OAuth Google devem ser preparados via `connector_app_user--connect_client` como parte do rollout (documentado no card do Settings quando não houver client vinculado).
