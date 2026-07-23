## Diagnóstico com evidência

- Log `oauth_start_succeeded` confirma que a tentativa `1a4f0b38…` foi iniciada às 03:57:42 com `return_origin: fenasojagestao.com`.
- Nenhum log `oauth_callback_observed*` ou `oauth_callback_received` foi emitido depois disso.
- `google_calendar_oauth_attempts.callback_observation` continua `NULL` em todas as tentativas.
- Você confirmou que viu "Validando autorização" **dentro do popup**, o que prova que `GoogleCalendarCallbackPage` executou.

Conclusão suportada pelas evidências: a página do callback rodou, mas nenhuma das requisições (`observe_callback` e/ou `complete`) chegou ao backend antes de o popup ser fechado. Hoje o `useEffect` dispara `invokeOAuth('observe_callback', …)` fire‑and‑forget e imediatamente chama `finish()`, que faz `postMessage` e agenda `window.close()` em 350ms. Como `supabase.functions.invoke` usa `fetch` normal (sem `keepalive`), o navegador cancela a requisição quando a janela é fechada. O `complete` só é executado quando o feedback é `completion_required`; se o connector gateway não devolveu `code` na query/hash do nosso `return_url` (o histórico mostra que isso é comum), o caminho vai direto para `finish('failed')` sem nunca chamar `complete` — e mesmo quando chega em `complete`, ele sofre do mesmo cancelamento.

## O que fazer

### Fase A — Instrumentar sobrevivência do popup (fonte da falha atual)

1. Em `GoogleCalendarCallbackPage.tsx`:
   - Primeiro emitir `observe_callback` usando `fetch(url, { method: 'POST', keepalive: true, ... })` diretamente (não `supabase.functions.invoke`), com apikey publishable + Authorization Bearer do access token quando existir. Aguardar essa Promise antes de qualquer `postMessage`/`window.close`.
   - Só depois disso decidir feedback e, se `completion_required`, disparar `complete` também com `fetch keepalive` e `await`.
   - Adiar `finish()` para depois das duas respostas (com timeout defensivo de ~4s).
   - Incluir na `observation` a lista bruta de nomes de parâmetros vistos em `search` **e** em `hash`, o comprimento total do `search` e do `hash`, e um flag `openerPresent` — sem valores.
2. Em `useGoogleCalendarConnection.ts`:
   - Aumentar o delay entre `postMessage` e o `window.close` (400 → 1500 ms no `finish` da callback page) para não competir com o keepalive.
   - Não tratar `authorization_not_confirmed` como cancelamento; deixar o polling de `waitForBackendConfirmation` decidir.

### Fase B — Ler evidência e decidir Fase 2

Depois de você reproduzir uma vez conectando `leomateus620@gmail.com`, eu leio:
- `google_calendar_oauth_attempts.callback_observation` da tentativa correspondente,
- logs `oauth_callback_observed*`, `oauth_start_succeeded`, `oauth_return_url_resolved`.

Isso vai mostrar objetivamente se o gateway está devolvendo:
- (a) `code`+`state` normais na query → resolver com `complete` (ajustar lookup por `state` se `attempt` foi removido);
- (b) parâmetros no `hash` (fluxo `web_message`) → migrar `complete` para ler do hash;
- (c) nenhum parâmetro (redirect só de status) → alternativa: usar o helper `connector_app_user--connect_client` do gateway em vez do fluxo manual.

Só então mexemos no `google-sync-worker` (Fase 3 do plano original).

## Detalhes técnicos

- Arquivos afetados nesta fase: `src/pages/GoogleCalendarCallbackPage.tsx`, `src/hooks/useGoogleCalendarConnection.ts`, `supabase/functions/google-calendar-oauth/index.ts` (apenas para aceitar campos extras em `observation`: `searchLength`, `hashLength`, `openerPresent`, `paramsHash` — sem valores).
- Sem migrations. Sem alteração de contrato: `contract_version` sobe para `2026-07-23.observe-keepalive`.
- Sem mudança visual no widget além do texto de estado se necessário.
- Verificação: após você tentar conectar, eu confiro `callback_observation` da nova tentativa e os logs `oauth_callback_observed*` no `google-calendar-oauth`. Se `observation.hasCode=true` mas `complete` falhou, ajusto o lookup no `complete`. Se `hasCode=false` mas `hash` traz `code`, migro a leitura para hash.

## Fora do escopo agora

- Mudanças no `google-sync-worker`, no `pg_cron`, nos templates de email e no widget visual — só depois que a conexão estiver realmente confirmada.
