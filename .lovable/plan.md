## Correção — Conectar Google Agenda

### 1. `src/hooks/useGoogleCalendarConnection.ts`
- Ler `oauth.authorization_url` (nome real retornado pelo gateway) mantendo `authorize_url`/`url` como fallback defensivo.
- Guardar `session_id` retornado e repassar a `complete` (útil para logs).
- Passar `returnUrl` também para `complete` (padronização).
- Melhorar `onError`: exibir a mensagem real do erro quando não for um caso conhecido (`popup_bloqueado`, `sem_organizacao`, `sem_url_oauth`), para que futuros bugs fiquem visíveis em vez de virarem toast genérico.

### 2. `supabase/functions/google-calendar-oauth/index.ts`
- Ler o JSON do body **uma única vez** no início do handler (`req.json()` só pode ser consumido uma vez em Deno). Passar o objeto parseado para cada branch (`start`, `complete`, `disconnect`, `status`).
- Isso corrige o `orgId` chegando `undefined` no upsert de `google_calendar_connections` (que hoje grava `org_id = null` ou falha no NOT NULL).
- No branch `start`: repassar o objeto `oauth` do gateway ao frontend sem renomear (contém `authorization_url` + `session_id`).
- Redeploy da função.

### 3. `supabase/functions/_shared/googleCalendarGateway.ts`
- Ajustar `fetchConnectionKey` para o contrato real do endpoint `GET /api/v1/app-users/connections` — extrair `connection_key` do primeiro elemento de `connections[]`. Manter fallback e logar corpo em caso de shape inesperado (via `console.error`) para diagnosticar caso o `complete` ainda falhe.

### 4. Validação
- Após redeploy, reabrir `/cronograma-eventos`, clicar em **Conectar**.
- Verificar via `edge_function_logs` que `start` retorna 200 com `authorization_url`, popup abre no Google, e após consent `complete` grava `connection_key`, `google_email` e `secondary_calendar_id`.
- Widget deve passar para estado `connected` com o e-mail do Google.

### Fora de escopo
Sem mudanças de UI (widget, estilos), sem mudança de schema, sem tocar em `google-sync-worker` ou `event-reminders`.
