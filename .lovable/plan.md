## Diagnóstico

- Após "foi" do usuário, a tentativa mais recente (`172ad2d1-19f1-4cbd-8093-25698e6445b2`) ficou em `waiting_authorization` até ser cancelada pelo widget (`action:cancel` às 03:40:53) — ou seja, o backend **nunca recebeu** `observe_callback` nem `complete`.
- Logs da função `google-calendar-oauth`: só aparece `oauth_start_succeeded`. Nenhum `oauth_callback_observed`.
- O usuário confirma que viu a tela "Validando autorização" e depois o erro. Ou seja: a rota `/google-calendar/callback` carregou, mas as chamadas `invokeOAuth("observe_callback"|"complete")` falharam antes de chegar ao Edge Function.
- Causa raiz mais provável: `supabase/config.toml` tem `verify_jwt = true` para `google-calendar-oauth`. Quando o gateway redireciona por top-level navigation (não popup), a página `/google-calendar/callback` roda no origem correto **mas** `supabase.auth.getSession()` no popup/aba de retorno pode estar sem sessão hidratada em tempo, ou o Bearer não é enviado (o `Authorization` é anexado só quando o `supabase-js` tem `session` em memória, o que exige o listener). Sem Bearer → 401 → o `invoke` retorna erro → o `void ... .catch(() => undefined)` engole a evidência silenciosamente.

Ou seja: o gate de evidência da Fase 1 não coleta nada porque o único canal disponível (`invokeOAuth`) requer sessão. Precisamos de um canal que **não exija JWT** para a ação `observe_callback`.

## Plano

1. **Abrir `observe_callback` sem JWT no Edge Function**
   - Em `supabase/functions/google-calendar-oauth/index.ts`: reordenar o handler para roteirizar `action === "observe_callback"` **antes** de `await requireUser(req)`. A ação já valida e sanitiza tudo que grava — pode ser anônima. Se houver Bearer válido, ainda casa a observação com a tentativa mais recente do usuário; se não houver, grava um evento global (`diagnostic("oauth_callback_observed_anon", ...)`) mas retorna 200 sem side effects.
   - Precisamos manter `verify_jwt = true` no `config.toml` para as outras ações? Não — melhor mudar para `verify_jwt = false` e passar a validar JWT em código dentro de cada ação (`start`, `complete`, `cancel`, `status`) como já é feito nas edge functions do próprio projeto (`event-reminders`, `send-transactional-email` usam validação em código). A ação `observe_callback` fica sem `requireUser`.

2. **Deixar de engolir o erro de telemetria no front-end**
   - Em `src/pages/GoogleCalendarCallbackPage.tsx`: manter o `void invokeOAuth('observe_callback', ...)`, mas se o invoke rejeitar, adicionar um `navigator.sendBeacon` como fallback direto ao endpoint via `fetch(..., { keepalive: true })` — mesma URL, sem `Authorization`, apenas `apikey` publishable (já é como outras chamadas anônimas funcionam). Nada de session-dependente.
   - Trocar `.catch(() => undefined)` por `.catch((e) => window.console.warn('observe_callback_failed', e?.message))` para termos rastro no console do popup se o usuário abrir DevTools.

3. **Instrumentar `start` para logar o `return_url` real enviado ao gateway**
   - Em `googleCalendarGateway.ts` → `startOAuth`: logar `diagnostic("oauth_return_url_sent", { originHash, path })` (sem valor bruto, só metadados). Isso confirma se o gateway está recebendo o return_url do preview (`lovableproject.com`) ou o da produção.

4. **Reproduzir e ler a evidência**
   - Redeploy só de `google-calendar-oauth`.
   - Limpar registros travados desse usuário (`google_calendar_connections.status IN ('starting','waiting_authorization','completing','error')` e `google_calendar_oauth_attempts` `waiting_authorization`).
   - Pedir ao usuário mais UMA tentativa no widget.
   - Ler `google_calendar_oauth_attempts.callback_observation` e os `diagnostic` logs para responder as três perguntas do plano definitivo:
     - Que params o gateway realmente devolve (`code`+`state`? só `session_id`? `web_message`?)
     - Em que origem o callback aterrissa (preview vs produção)?
     - A resposta do gateway ao `exchange` (Fase 2) traz `api_key`, `connector_id`, `app_user_id`, `installation_id`?

5. **Só depois de a evidência chegar** decidimos entre as três variantes de Fase 2 do plano definitivo — não faz sentido escrever o exchange antes disso.

## Fora de escopo

- Não mexer em `google-sync-worker`, cron, ou fluxo `X-Worker-Token` — segue como está.
- Não alterar UI do widget do Cronograma.
- Não deletar conexões válidas de outros usuários.

## Rollback

Cada passo é independente:
- Reverter `config.toml` para `verify_jwt = true` restaura o comportamento anterior.
- Remover a rota anônima de `observe_callback` do handler restaura o gate original.
- O fallback `sendBeacon`/`fetch keepalive` pode ser removido sem afetar o fluxo principal.
