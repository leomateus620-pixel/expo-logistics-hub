## Diagnóstico (a confirmar no primeiro passo)

Nos logs mais recentes do edge function `google-calendar-oauth` (23/07 00:57) aparece `oauth_start_succeeded` mas **nunca** aparece `oauth_callback_received`. O toast que o usuário recebe ("O retorno da autorização não pôde ser validado") é gerado em `src/pages/GoogleCalendarCallbackPage.tsx` quando `parseGoogleCalendarCallbackFeedback` classifica o retorno como `failed:invalid_callback`.

Essa classificação (em `src/lib/google-calendar-callback.ts`) exige três coisas simultâneas no query string do callback: `code`, `state` **e** `attempt`. O `attempt` é gerado por nós e colocado no `return_url` que enviamos ao gateway em `resolveReturnUrl` (`supabase/functions/google-calendar-oauth/index.ts`). A hipótese mais forte é que o `connector-gateway.lovable.dev` está descartando o query string do `return_url` antes de anexar `code`/`state`, então o `attempt` chega vazio e a página aborta antes de chamar `complete`.

O primeiro passo do plano é confirmar isso instrumentando o callback (log dos params recebidos) e capturar uma nova tentativa antes de aplicar a correção definitiva.

## Correção proposta

Parar de depender do query string do `return_url` para transportar o `attempt`. Vamos amarrar o `attempt_id` ao `state` do OAuth (que o gateway sempre preserva) e resolver o attempt a partir do `state` recebido.

### Backend — `supabase/functions/google-calendar-oauth/index.ts` e `_shared/googleCalendarGateway.ts`

- Deixar de setar `attempt` no `return_url` (`resolveReturnUrl`).
- Após `startOAuth`, extrair o `state` que o gateway devolveu, gravar `provider_state_hash` (já é feito) e também guardar o `state` cru em uma nova coluna indexada `provider_state_lookup` (hash SHA-256 diferente/mesmo hash com índice único) na tabela `google_calendar_oauth_attempts`, para busca reversa por `state`.
- Na `action: "complete"`:
  - Aceitar payload `{ code, state }` sem `attemptId`.
  - Buscar o attempt por `provider_state_lookup = sha256(state)` + `user_id` + status `waiting_authorization` + `expires_at > now`.
  - Continuar validando `Origin` = `return_origin` e o `provider_state_hash` já existente.
  - Manter a proteção contra replay (transição atômica para `completing`).

### Front — `src/lib/google-calendar-callback.ts` + `GoogleCalendarCallbackPage.tsx` + hook

- `parseGoogleCalendarCallbackFeedback`: aceitar callback quando `code` e `state` existirem, mesmo sem `attempt` (o attempt vira opcional só para telemetria/`postMessage`).
- `GoogleCalendarCallbackPage`: chamar `invokeOAuth('complete', { code, state })` (sem `attemptId`). Se veio `attempt`, ainda o repassa para o `postMessage` para o hook casar com `activeAttemptRef`.
- `useGoogleCalendarConnection`: aceitar `postMessage` sem `attemptId`; nesse caso confia no `waitForBackendConfirmation`.

### Instrumentação (passo 1, antes da correção)

Adicionar no `GoogleCalendarCallbackPage` um `console.info('google_calendar_callback_params', Object.fromEntries(params))` **antes** do `history.replaceState`, e no edge function um `diagnostic("oauth_callback_params_missing", { hasCode, hasState, hasAttempt })` quando um dos três faltar. Pedir ao usuário uma nova tentativa para confirmar exatamente qual param o gateway está devolvendo. Se por acaso o gateway estiver preservando `attempt` e o problema for outro (ex.: `Origin` ausente porque o gateway redireciona por navegação top-level), essa telemetria mostra na hora e o resto do plano se ajusta antes do deploy.

## Passos

1. **Instrumentar e reproduzir** (front + edge function) e pedir ao Leonardo uma nova tentativa de conexão. Ler os logs do `google-calendar-oauth` e o console do popup para confirmar quais parâmetros o gateway devolve.
2. **Migração** `google_calendar_oauth_attempts`: adicionar coluna `provider_state_lookup TEXT` + índice único parcial `(user_id, provider_state_lookup) WHERE status = 'waiting_authorization'`.
3. **Edge function**: parar de anexar `attempt` no `return_url`; gravar `provider_state_lookup`; refatorar `action: complete` para buscar attempt por `state`.
4. **Front**: relaxar o parser do callback, ajustar o POST de `complete` e o `postMessage`.
5. **Redeploy** de `google-calendar-oauth` e teste ponta-a-ponta com a conta `leomateus620@gmail.com` (start → popup → callback → `oauth_callback_received` no log → `connection_key_retrieved` → `connected`).
6. **Limpar** registros travados de tentativas anteriores desse usuário/org antes do teste (`google_calendar_oauth_attempts` em `waiting_authorization` e `google_calendar_connections.status IN ('starting','waiting_authorization','completing','error')`).

## Fora de escopo

- Não mexer no `google-sync-worker` nem no fluxo `X-Worker-Token` (já validado, respondendo 200).
- Não mexer em UI do widget além do necessário para o parser do callback.
- Não trocar `response_mode` para popup/postMessage do próprio gateway — mantemos o fluxo redirect atual, apenas robustecemos a validação.
