# Plano: OAuth 2.0 Direto do Google Calendar (substituição total do Lovable Connector)

## Causa-raiz

O fluxo atual depende do `connector-gateway.lovable.dev` (App User Connector) para autorização, troca de code e chamadas ao Google. Esse gateway introduz uma camada assíncrona (session id vs. connection key) que quebra a finalização determinística do handshake, gera falsos "aguardando autorização" e impede confirmação atômica de probe + calendário secundário. A solução é remover o gateway e falar diretamente com `accounts.google.com`, `oauth2.googleapis.com` e `www.googleapis.com/calendar/v3` a partir das Edge Functions.

## Pré-requisitos externos (bloqueantes)

Antes de qualquer deploy, o usuário precisa:

1. **Cadastrar Redirect URI no Google Cloud Console** (Credenciais → Cliente OAuth Web do FENASOJA):
   `https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/google-calendar-oauth-callback`
2. **Manter Origens JavaScript autorizadas**: `https://fenasojagestao.com`, `https://www.fenasojagestao.com`, `https://fenasoja-gestao.lovable.app`.
3. **Fornecer `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`** via `add_secret` (formulário seguro). `GOOGLE_TOKEN_ENCRYPTION_KEY` será gerada por `generate_secret` (32 bytes base64). `GOOGLE_OAUTH_REDIRECT_URI` será fixada pelo `set_secret` com a URI acima.

O plano interrompe o deploy até esses três itens existirem.

## Arquitetura alvo

```text
Browser (/cronograma-eventos)
   │  POST action=start (JWT)
   ▼
Edge: google-calendar-oauth (verify_jwt=true internamente)
   │  gera state, persiste attempt, devolve authorize URL Google
   ▼
accounts.google.com  →  consent
   │  GET ?code&state
   ▼
Edge: google-calendar-oauth-callback (verify_jwt=false, GET-only)
   │  valida state hash, claim atômico, troca code em oauth2.googleapis.com/token
   │  cifra tokens (AES-256-GCM), probe /calendarList, garante/cria calendário
   │  enfileira backfill, marca verified_at
   ▼  HTTP 303 → https://fenasojagestao.com/google-calendar/callback?attempt=<id>
Browser (/google-calendar/callback)
   │  polling status via Edge google-calendar-oauth (action=status)
   ▼
Edge: google-sync-worker (cron * * * * *)
     usa getValidGoogleAccessToken() e chama googleapis.com direto
```

## Mudanças no backend

### Novos arquivos

- `supabase/functions/google-calendar-oauth-callback/index.ts` — Edge Function pública, `GET` only. Valida `state` (SHA-256), faz claim `waiting_authorization → completing`, troca code em `https://oauth2.googleapis.com/token`, cifra tokens, chama `finalizeAuthorizedConnection` (probe + secondary calendar + backfill), retorna 303 para `/google-calendar/callback?attempt=<id>&status=ok|error&code=<safe>`.
- `supabase/functions/_shared/googleCalendarClient.ts` — cliente HTTP direto para `https://www.googleapis.com/calendar/v3`. Exporta `probeConnection`, `ensureSecondaryCalendar`, `insertEvent`, `patchEvent`, `deleteEvent`, `findEventByExtendedProperty`. Todas chamadas com `Authorization: Bearer <access>` obtido via `getValidGoogleAccessToken`. Retorno estruturado `{ok, httpStatus, safeCode, stage, data?}`.
- `supabase/functions/_shared/googleTokenCrypto.ts` — AES-256-GCM (`crypto.subtle`) usando `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64, 32 bytes). Funções `encryptToken`, `decryptToken`, `deriveSafeError`.
- `supabase/functions/_shared/googleTokenService.ts` — `getValidGoogleAccessToken(userId, orgId)`: lê linha, descriptografa, checa `token_expires_at - 5min`, se necessário faz refresh em `https://oauth2.googleapis.com/token` com `grant_type=refresh_token`, re-cifra e persiste, protegido por `SELECT ... FOR UPDATE` na linha da conexão para evitar refresh concorrente. Mapeia `invalid_grant` → marca `status='reconnect_required'` e lança `refresh_token_invalid`.

### Arquivos modificados

- `supabase/functions/google-calendar-oauth/index.ts`
  - Remove qualquer import de `googleCalendarGateway.ts`.
  - Ações mantidas: `start`, `status`, `disconnect`, `retry`, `observe_callback`. Remove `complete` (agora é o callback server-side).
  - `start`: gera `state` (32 bytes randômicos → base64url), armazena `sha256(state)` em `provider_state_hash`, monta URL para `https://accounts.google.com/o/oauth2/v2/auth` com scopes exigidos (`openid`, `userinfo.email`, `userinfo.profile`, `calendar`, `calendar.events`), `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. Retorna `{ authorization_url, attempt_id }`.
  - `status`: retorna somente campos seguros (`status`, `google_email`, `secondary_calendar_id`, `verified_at`, `connected_at`, `last_sync_at`, `backfill_total`, `backfill_done`, `outbox_pending`, `outbox_failed`, `safe_error_code`). Nunca retorna tokens ou ciphertext.
  - `disconnect`: chama `POST https://oauth2.googleapis.com/revoke?token=<refresh>` (best-effort), incrementa `connection_generation`, apaga colunas cifradas, marca `status='disconnected'`, cancela outbox pendente da geração anterior.
- `supabase/functions/google-sync-worker/index.ts`
  - Substitui chamadas via gateway por `googleCalendarClient.ts` + `getValidGoogleAccessToken`.
  - `invalid_grant` durante o processamento → marca conexão `reconnect_required` e para a tarefa (não incrementa tentativas destrutivamente).
  - Mantém `claim_google_sync_batch`, `remote_event_verified`, `findRemoteEventIds`, `extendedProperties.private.fenasoja_event_id`, idempotência e limite de tentativas.
- `supabase/functions/_shared/googleCalendarGateway.ts` — **removido**. Buscar imports remanescentes e migrar cada um para `googleCalendarClient.ts`.
- `supabase/config.toml`:
  - `[functions.google-calendar-oauth-callback]` com `verify_jwt = false`.
  - `google-calendar-oauth` permanece com `verify_jwt = false` (a função valida JWT internamente por ação; `observe_callback` e `status` durante popup precisam disso).
  - `google-sync-worker` mantém `verify_jwt = false` (protegido por `X-Worker-Token`).

### Migração de banco

`supabase/migrations/2026XXXXXXXX_google_direct_oauth.sql`:

```sql
ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS oauth_provider text NOT NULL DEFAULT 'google_direct',
  ADD COLUMN IF NOT EXISTS access_token_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS access_token_iv bytea,
  ADD COLUMN IF NOT EXISTS access_token_tag bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_iv bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_tag bytea,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes_granted text[],
  ADD COLUMN IF NOT EXISTS google_subject text;

REVOKE ALL ON public.google_calendar_connections FROM authenticated, anon;
GRANT ALL ON public.google_calendar_connections TO service_role;

-- View segura só com campos não-sensíveis, exposta a authenticated via RLS por org.
CREATE OR REPLACE VIEW public.google_calendar_connections_public
  WITH (security_invoker = on) AS
SELECT id, user_id, org_id, status, google_email, secondary_calendar_id,
       verified_at, connected_at, last_sync_at, backfill_total, backfill_done,
       connection_generation, safe_error_code
FROM public.google_calendar_connections;
GRANT SELECT ON public.google_calendar_connections_public TO authenticated;

-- Invalidar conexões antigas do Lovable Connector.
UPDATE public.google_calendar_connections
   SET status = 'reconnect_required', safe_error_code = 'migrated_to_direct_oauth'
 WHERE oauth_provider IS DISTINCT FROM 'google_direct';
```

Colunas antigas (`connection_key`, `session_id`, etc.) permanecem por 1 release para rollback e serão removidas em migration posterior.

## Frontend

- `src/pages/GoogleCalendarCallbackPage.tsx`: remove `keepalive`, remove `action=complete`, remove `PUBLISHABLE_APIKEY` como Bearer. Passa a apenas: limpar URL, ler `attempt`, fazer polling em `google-calendar-oauth?action=status` a cada 1,5s por até 90s, sinalizar sucesso ao `opener` **somente** quando `verified_at` e `secondary_calendar_id` estiverem preenchidos. Estados textuais: "Validando conta Google" → "Preparando calendário" → "Sincronizando eventos" → "Conectado".
- `src/hooks/useGoogleCalendarConnection.ts`: remove qualquer referência a `connection_key`, `session_id`, `exchangeCode`. Passa a chamar `start` (recebe `authorization_url`) e abre popup diretamente para a URL Google. Códigos de erro novos: `oauth_state_invalid`, `oauth_state_expired`, `refresh_token_invalid`, `google_insufficient_scope`, `google_api_disabled`.
- `src/lib/google-calendar-callback.ts`: mantém parser mas remove chaves relacionadas a `code`/`state` do fluxo popup (agora só chegam `attempt` e `status`/`code` sanitizados vindos do redirect 303).
- `src/lib/google-calendar-state.ts`: adiciona novos códigos ao mapeamento `reconnect_required`.

## Secrets (via ferramentas de secrets)

- `add_secret`: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (usuário cola do Google Console).
- `generate_secret`: `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 bytes → 44 chars base64, gerado por `openssl rand -base64 32` equivalente feito pelo tool).
- `set_secret`: `GOOGLE_OAUTH_REDIRECT_URI = https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/google-calendar-oauth-callback`, `SITE_URL = https://fenasojagestao.com`.
- Secrets antigos do Lovable (`GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY`, `LOVABLE_API_KEY` no que tange Calendar) permanecem até o próximo release; código novo não os referencia.

## Testes

Reescrever `src/test/googleCalendarServerContracts.test.ts` para asserir:

- Ausência total de `connector-gateway.lovable.dev`, `X-Connection-Api-Key`, `LOVABLE_API_KEY`, `/api/v1/app-users` em `supabase/functions/**` e `src/**`.
- `googleCalendarClient.ts` usa `https://www.googleapis.com/calendar/v3` e `Authorization: Bearer`.
- `googleTokenCrypto.ts` usa `AES-GCM` com IV de 12 bytes.
- Callback rejeita replay, state ausente, state expirado, TTL, org mismatch.
- `status` nunca retorna campos cifrados.

Novos testes Deno (`supabase/functions/**/index.test.ts`) para encrypt/decrypt roundtrip e para o mapeamento de erros do Google.

Comandos: `bunx vitest run`, `deno test` nos edge functions, `tsgo` para typecheck, build de produção.

## Ordem de execução

1. Confirmar/coletar `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` com o usuário; gerar `GOOGLE_TOKEN_ENCRYPTION_KEY`; fixar `GOOGLE_OAUTH_REDIRECT_URI`.
2. Aplicar migration aditiva.
3. Implementar `googleTokenCrypto`, `googleTokenService`, `googleCalendarClient`.
4. Criar `google-calendar-oauth-callback`.
5. Refatorar `google-calendar-oauth` (remover `complete`, alterar `start`, `disconnect`, `status`).
6. Refatorar `google-sync-worker` (usar cliente direto).
7. Remover `googleCalendarGateway.ts`.
8. Atualizar frontend (`GoogleCalendarCallbackPage`, `useGoogleCalendarConnection`, `google-calendar-state`).
9. Rodar testes, typecheck e build.
10. Deploy das Edge Functions, depois frontend.
11. Invalidar conexões antigas via migration.
12. Validação E2E manual (Playwright headless) com uma conta Google real: conectar → criar evento no cronograma → confirmar no Google → editar → confirmar patch → excluir → confirmar delete → desconectar → reconectar.

## Rollback

- Manter colunas antigas por 1 release.
- Rollback = reverter deploy das Edge Functions (as antigas continuam funcionando enquanto secrets Lovable existirem) + `UPDATE ... SET oauth_provider='lovable'` nas conexões afetadas.

## Não incluído

- Não altero rotas `/cronograma-eventos` e `/google-calendar/callback`.
- Não removo os secrets Lovable neste ciclo (removidos após validação em produção).
- Não crio segundo fluxo paralelo: o Google Direct substitui integralmente o Lovable Connector.
