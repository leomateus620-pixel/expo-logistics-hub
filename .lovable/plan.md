## Diagnóstico

O callback recebeu o `code` do Google, trocou por token, mas o probe em `/users/me/calendarList` retornou 403 → mapeado como `google_insufficient_scope` ("A conta não concedeu os escopos necessários").

Causa real: na tela de consentimento do Google, os escopos de Calendar aparecem como **checkboxes granulares** ("Ver, editar, compartilhar e excluir permanentemente todos os calendários…" e "Ver e editar eventos…"). Se o usuário clica em "Continuar" sem marcar as duas caixas, o token vem sem os escopos de calendário e a API retorna 403. Hoje o backend só descobre isso depois do probe e mostra uma mensagem genérica, sem instruir a marcar as caixas nem forçar re-consentimento.

## Correções

### 1. Validar escopos concedidos antes do probe (`google-calendar-oauth-callback/index.ts`)
Depois de `exchangeAuthorizationCode`, comparar `tokens.scope` (string separada por espaço) contra os escopos obrigatórios `https://www.googleapis.com/auth/calendar` **e** `https://www.googleapis.com/auth/calendar.events`. Se qualquer um estiver ausente:
- Revogar o `access_token` recém-emitido (best effort, via `revokeToken`) para forçar novo consentimento limpo.
- Marcar o attempt como `cancelled` com `error_code = "google_insufficient_scope"` e a connection como `reconnect_required` com o mesmo código.
- Redirecionar para `frontendCallbackUrl(attempt.id, "error", "google_insufficient_scope")` sem tentar o probe.

### 2. Forçar re-consentimento explícito (`_shared/googleCalendarClient.ts`)
Em `buildAuthorizationUrl`:
- Adicionar `url.searchParams.set("prompt", "consent select_account")` para sempre reabrir seleção de conta + tela de escopos.
- Remover `include_granted_scopes=true` (esse parâmetro faz o Google reusar consentimentos anteriores incompletos em vez de reexibir as caixas).
- Adicionar `enable_granular_consent=true` explicitamente (comportamento padrão hoje, mas fixado para não regredir).

### 3. Mensagem clara no frontend (`useGoogleCalendarConnection.ts`)
Atualizar `google_insufficient_scope` para instrução acionável:
> "Na tela do Google, marque **as duas caixas** de permissão de Agenda antes de continuar. Clique em Reconectar e revise as permissões."

### 4. Estado de UI (`src/lib/google-calendar-state.ts`)
`google_insufficient_scope` já cai em `providerNeedsReconnect` via `provider_unauthorized`? Não — é um código novo. Adicionar `google_insufficient_scope` (e `google_unauthorized`) à lista `providerNeedsReconnect` para renderizar `reconnect_required` (botão "Reconectar conta") em vez de `temporary_failure` (botão "Verificar novamente", que é o que está aparecendo no print).

### 5. Deploy e validação
- Deploy: `google-calendar-oauth-callback` e `google-calendar-oauth`.
- Limpar a conexão travada do Leonardo (`google_calendar_connections` do usuário atual) via SQL para permitir reconexão limpa.
- Teste E2E manual pelo widget: reconectar marcando as duas caixas → verificar que probe passa, calendário secundário é criado, `verified_at` é preenchido, e o outbox drena os 63 eventos pendentes.
- Verificar logs (`google_probe_succeeded`, `secondary_calendar_ready`, `remote_event_verified`).

## Detalhes técnicos

- Escopos obrigatórios verificados: `https://www.googleapis.com/auth/calendar` (criar/listar calendários) e `https://www.googleapis.com/auth/calendar.events` (eventos). `openid`/`userinfo.*` são bônus e não bloqueiam.
- `revokeToken` é fire-and-forget; se falhar não bloqueia o redirecionamento de erro.
- Sem novas migrations necessárias — coluna `scopes_granted` já persiste o que veio, útil para debug posterior.