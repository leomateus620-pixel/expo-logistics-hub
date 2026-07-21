## Diagnóstico

Nos logs da edge `google-calendar-oauth` aparece:
```
fetchConnectionKey http 404: 404 page not found
```

O OAuth do usuário no Google **completa com sucesso** (o gateway armazena o token), mas quando o popup fecha, o frontend chama `action=complete`, que por sua vez chama `fetchConnectionKey` no endpoint `GET /api/v1/app-users/connections?...` — esse endpoint não existe no gateway (404). Como resultado, `complete` retorna `no_connection` e a UI fica travada em `status=connecting`.

O gateway do App User Connector **não expõe a connection_key para o app**: as chamadas ao provedor são feitas passando o `app_user_id` + client key (a chave é resolvida internamente). Armazenar `connection_key` no nosso banco é um passo desnecessário e é ele que está quebrando o fluxo.

## Correções

1. **`supabase/functions/_shared/googleCalendarGateway.ts`**
   - Remover `fetchConnectionKey` (baseado em endpoint inexistente).
   - Reescrever `callGoogle` para autenticar via App User: headers `Authorization: Bearer LOVABLE_API_KEY`, `X-Client-Api-Key: <CLIENT_API_KEY>`, `X-App-User-Id: <user_id>` (assinatura padrão do connection-key mode, já que `APP_USER_CONNECTION_KEY_SECRET` está provisionado). Assinatura passa a ser `callGoogle(appUserId, path, init)`.
   - `ensureSecondaryCalendar` e `callGoogleJson` passam a receber `appUserId` em vez de `connectionKey`.
   - Adicionar `probeConnection(appUserId)` que faz `GET /calendar/v3/users/me/settings/timezone` (endpoint barato) só para validar que o OAuth foi concluído; retorna `true`/`false` sem lançar.

2. **`supabase/functions/google-calendar-oauth/index.ts`**
   - Em `action=complete`:
     - Chamar `probeConnection(user.id)`. Se `false`, retornar `{ error: "no_connection" }` (usuário fechou popup sem completar).
     - Se `true`: chamar `ensureSecondaryCalendar(user.id)` e `callGoogleJson(user.id, "/oauth2/v2/userinfo")` para obter e-mail.
     - `upsert` na `google_calendar_connections` **sem** o campo `connection_key` (deixar `NULL`).
   - Nas outras actions, remover qualquer uso de `connection_key`.

3. **`supabase/functions/google-sync-worker/index.ts`** e demais funções que consomem `connection_key`
   - Substituir `connectionKey` por `user_id` da linha `google_calendar_connections` como identificador ao chamar `callGoogle`.

4. **Frontend `src/hooks/useGoogleCalendarConnection.ts`**
   - Ao fechar o popup, além de chamar `complete`, se `complete` devolver `no_connection`, agendar **um retry** após 2s (o gateway às vezes leva ~1s para persistir a autorização) antes de mostrar erro.
   - Melhorar toast de erro para distinguir "usuário cancelou" de "falha real".

5. **Redeploy** das edge functions `google-calendar-oauth`, `google-sync-worker`, `event-reminders`, `next-events-feed` (todas as que usam o gateway helper).

## Resultado esperado

Ao clicar em **Conectar Google Agenda** → aprovar consent → fechar popup:
- `complete` valida a conexão via gateway
- Cria calendário secundário
- Salva `status=connected`, `google_email`, `secondary_calendar_id`
- Enfileira backfill
- Toast "Google Agenda conectada" aparece e a UI sai de "carregando"
