## Diagnóstico confirmado (logs reais)

O último callback registrou:
- `google_probe_failed { httpStatus: 403, stage: "calendar_list_probe" }`
- `oauth_callback_failed { errorCode: "google_insufficient_scope" }`

Não houve `google_scopes_insufficient`, ou seja, os escopos vieram completos. O 403 em `/calendarList` com escopos válidos = **Google Calendar API não habilitada no projeto Google Cloud** que emite o OAuth Client. A classificação atual "insufficient_scope" mascara isso e faz o usuário reabrir consentimento sem sucesso.

## O que precisa acontecer no Google Cloud (você faz uma vez)

No projeto Cloud do OAuth Client atual:
1. Abrir **APIs & Services → Library**.
2. Habilitar **Google Calendar API**.
3. Confirmar que **People API** está habilitada (usada por `userinfo`).
4. Aguardar ~1 min de propagação.

Sem esse passo, nenhuma correção de código resolve — o Google continua respondendo 403.

## Correções de código (para nunca mais confundir esse cenário)

### 1. `supabase/functions/_shared/googleCalendarClient.ts`
- No `probeConnection`: além do status, ler o body do 403 e detectar `"accessNotConfigured"` / `"PERMISSION_DENIED"` / `"SERVICE_DISABLED"`. Retornar `safeCode: "google_api_disabled"` quando presente; `"google_insufficient_scope"` só quando o body indicar `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT`.

### 2. `supabase/functions/google-calendar-oauth-callback/index.ts`
- Trocar o mapeamento fixo `probe.status === 403 → google_insufficient_scope` por `probe.safeCode` já classificado no client.
- Quando o probe falhar por `google_api_disabled`, marcar a connection como `status='error'` (não `reconnect_required`) e gravar `last_error='google_api_disabled'` — reconectar não vai adiantar até a API ser habilitada.
- Reverter o `status: "preparing_calendar"` gravado antes do probe (linhas 302–310) para não deixar a UI achando que a etapa avançou quando o probe falha logo em seguida.

### 3. `src/hooks/useGoogleCalendarConnection.ts`
- Cópia PT-BR de `google_api_disabled`: instruir explicitamente "Habilite a Google Calendar API no console do Google Cloud (APIs & Services → Library) e clique em Reconectar." (a string atual já existe, só garantir que aparece com destaque).
- No refetch loop: quando `connection.status === 'error'` com um `error_code` conhecido, parar de considerar como "in progress" (hoje `IN_PROGRESS_STATUSES` não inclui `error`, ok, mas o `flowPhase` local fica em `returning` até o polling confirmar — forçar `setFlowPhase('idle')` assim que o status virar `error`/`reconnect_required` com error_code).

### 4. `src/pages/GoogleCalendarCallbackPage.tsx`
- Ao receber `?status=error&code=google_api_disabled`, mostrar mensagem específica ("Ative a Google Calendar API") em vez do genérico atual, e enviar `postMessage` para o opener (ou navegar direto para `/cronograma-eventos`) para destravar a UI da aba original.

### 5. `src/lib/google-calendar-state.ts`
- Já inclui `google_api_disabled` em `providerNeedsReconnect`; adicionar ID de estado `api_disabled` distinto de `reconnect_required` para o widget renderizar CTA "Abrir Google Cloud Console" além de "Reconectar".

## Validação
1. Reproduzir com API desabilitada → logs devem mostrar `safeCode: "google_api_disabled"`, UI mostra card específico.
2. Habilitar a Calendar API → reconectar → probe 2xx → estado `synchronizing` → eventos aparecem no calendário "FENASOJA — Cronograma" do Google.
3. Rodar `vitest run src/test/googleCalendarState.test.ts` para garantir que o novo estado `api_disabled` está coberto.

## Sobre "não recebi eventos no e-mail"
O `event-reminders` roda separado do sync Google e depende de eventos vinculados a você em `cronograma_evento_responsaveis`. Isso é uma verificação separada — depois que a conexão fechar como `connected`, checo se há eventos futuros vinculados ao seu user e disparo teste manual do `event-reminders`. Não misturo essa correção com a do 403 porque são caminhos independentes.
