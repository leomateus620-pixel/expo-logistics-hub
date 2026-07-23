# Recuperação Google Calendar — PR #16

Os arquivos da PR #16 já estão presentes no repositório (migração `20260722234000_google_calendar_oauth_hardening.sql`, `google-calendar-oauth`, `google-sync-worker`, `_shared/googleCalendarGateway.ts`, `useGoogleCalendarConnection.ts`, `GoogleCalendarCallbackPage.tsx`, `docs/google-calendar-oauth-recovery.md`). Confirmei que a migração **ainda não foi aplicada** ao banco (`google_calendar_oauth_attempts` não existe). Portanto o trabalho é implantar na ordem correta e validar — não reescrever.

## 1. Pré-checagem (sem alterações)
- Confirmar HEAD da branch importada.
- Grep no frontend por `GOOGLE_CLIENT_SECRET`, `client_secret`, `X-Connection-Api-Key`, tokens fixos. Abortar se houver segredo exposto.
- Listar secrets existentes (`fetch_secrets`) para verificar:
  - `LOVABLE_API_KEY`
  - `GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY`
  - `SITE_URL`
  - `GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS`
- Verificar que o secret Vault `google_sync_worker_service_role_key` está configurado fora do chat. Se ausente → parar e reportar bloqueio.

## 2. Aplicar migração
- Rodar `supabase/migrations/20260722234000_google_calendar_oauth_hardening.sql` via ferramenta de migração.
- Verificações pós-migração (sem selecionar valores sensíveis):
  - Tabela `google_calendar_oauth_attempts` criada.
  - `google_calendar_connections`: `verified_at`, `connection_generation`, revogação de acesso a `authenticated`.
  - `google_sync_outbox`: coluna `connection_generation`, índices anti-duplicação, dead-letter.
  - Trigger `BEFORE DELETE` em eventos; FKs cascade removidas de mapping/outbox.
  - `pg_cron` job `google-sync-worker-every-minute` ativo.

## 3. Configurar secrets faltantes
- Se `SITE_URL` ausente → `set_secret SITE_URL=https://www.fenasojagestao.com`.
- Se `GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS` ausente → definir com origens autorizadas + preview.
- Não tocar em `LOVABLE_API_KEY` nem no service role.

## 4. Deploy Edge Functions
- Deploy `google-calendar-oauth` e `google-sync-worker`.
- Confirmar `verify_jwt = true` em ambas (já está no `config.toml`).
- Não publicar frontend antes disso.

## 5. Limpar estado travado
- Remover registro atual em `google_calendar_connections` para o usuário de teste `b664fc22-69d3-40f1-8370-16b8a07ec402` (status error residual).

## 6. Validação end-to-end (via Playwright + Supabase reads)
Executar o fluxo real usando a sessão do preview:
- `oauth_start_started → oauth_start_succeeded → oauth_callback_received → oauth_completion_pending → connection_key_retrieved → google_probe_succeeded → secondary_calendar_ready → backfill_queued → worker_started → event_sync_succeeded`.
- Card só mostra "Conectado" após `secondary_calendar_id` + `verified_at`.
- Verificar `google_calendar_event_map`, `google_sync_outbox`, presença de `FENASOJA — Cronograma` via API.
- Teste CREATE/UPDATE/DELETE com evento temporário `[TESTE GOOGLE CALENDAR] <timestamp>`.
- Repetir com segundo usuário; validar isolamento (connection keys e mappings distintos).
- Testar desconexão/reconexão idempotente.

## 7. Validação automatizada
- `tsgo` typecheck.
- `bunx vitest run` focado em `googleCalendar*.test.*`, depois suíte completa.
- Deno check nas Edge Functions.
- Build de produção.
- Comparar falhas globais com `origin/main` (reportar dívida preexistente à parte).

## 8. Relatório final
Entregar no formato solicitado (14 itens), com evidências sanitizadas. Se qualquer evidência real de evento no Google Calendar faltar para ambos os usuários → marcar como **"validação incompleta"** e informar bloqueio exato. Sem uso de "concluído" sem prova.

## Bloqueios possíveis (parar e reportar)
- `google_sync_worker_service_role_key` ausente no Vault → não posso configurar via chat.
- Segundo usuário Google real para teste de isolamento → preciso confirmação de qual conta usar.
- Segredo Google exposto no frontend → parar deploy.

## Rollback
- Reverter deploy das duas Edge Functions para a versão anterior.
- A migração permanece (remove exposição de credencial e preserva delete tasks).
- Suspender processamento: `select cron.unschedule('google-sync-worker-every-minute')`.

## Detalhes técnicos
- Contrato OAuth preservado: `authorize` → `{authorization_url, session_id}`; callback recebe `code`+`state`; `exchange` com `{ code }` → `{ api_key, connector_id }`. `session_id` **nunca** é usado como `X-Connection-Api-Key`.
- `app_user_id` = Supabase `user.id`.
- Redirect URI Google Console: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback` (já configurado pelo usuário).
- Scopes: `openid`, `userinfo.email`, `userinfo.profile`, `calendar`, `calendar.events`.
