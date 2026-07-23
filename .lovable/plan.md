# Plano — OAuth e sincronização Google Agenda

## Objetivo
Descobrir o formato real do retorno do App User Connector (hoje o handshake falha entre `oauth_start_succeeded` e `connection_key_retrieved`), corrigir o handshake com base em evidência, restaurar o worker autenticado e validar ponta-a-ponta.

## Fase 1 — Gate de evidência (antes de qualquer correção definitiva)

1. Nova ação autenticada `observe_callback` em `supabase/functions/google-calendar-oauth/index.ts`:
   - Resolve usuário/org/tentativa por `auth.uid()` + tentativa ativa.
   - Aceita só metadados sanitizados: nomes de parâmetros presentes, flags de presença (`hasCode/hasState/hasAttempt/hasError`), comprimentos, transporte (`query|hash|message`), rota, `contract_version`.
   - Nunca recebe/loga valores; grava em `google_calendar_oauth_attempts` (coluna JSONB `callback_observation`).
2. `GoogleCalendarCallbackPage.tsx`:
   - Capturar a observação sanitizada, chamar `observe_callback`, limpar URL, então interpretar.
   - Remover o `console.info('google_calendar_callback_params', …)` atual.
3. Adicionar `contract_version` no retorno de `start`, `complete`, `status`.
4. Publicar preview autorizado e reproduzir uma autorização limpa com `leomateus620@gmail.com`. Capturar (sem valores):
   - Campos de `/oauth2/authorize`.
   - Parâmetros que chegam ao callback.
   - Se `complete` foi chamado.
   - Status e nomes de campos de `/oauth2/exchange`.
   - Estrutura de `GET /api/v1/app-users/connections?connector_id=google_calendar&app_user_id=<user.id>`.
5. Repetir uma vez em produção só se o preview divergir.

Decisão do handshake final segue o retorno comprovado:

| Retorno comprovado | Implementação |
| --- | --- |
| Endpoint `connections` devolve a conexão final por `app_user_id` | Recuperação server-side por usuário (preferido) |
| Callback devolve `code`+`state` | Exchange server-side com validação integral do state |
| Callback devolve só `code` | Aceitar só se `exchange`/lookup comprovar vínculo com o mesmo `app_user_id` |
| `web_message` com código verificável | Mesmo connector com origem e `event.source` estritos |
| Só chave/token chega ao browser | Rejeitar |
| Nenhum modo seguro | Declarar App User Connector inadequado; substituir por OAuth Google server-side na mesma rota |

## Fase 2 — Correção permanente do handshake

- Manter rotas `/cronograma-eventos` e `/google-calendar/callback` e o App User Connector.
- Manter tipos separados `OAuthSessionId`, `OAuthExchangeCode`, `FinalizedConnectionKey`. `session_id` fica só como correlação hash; nunca vira `X-Connection-Api-Key`.
- Abertura atômica da autorização:
  - Uma tentativa ativa por `user_id`; expirar anteriores em todas as orgs.
  - Validar associação ativa à organização.
  - Transição `starting → waiting_authorization`; não tocar em `connected_at`.
- Mesmo `auth.uid()` em `authorize`, lookup/exchange, storage, `status`, sync.
- Exigir `Origin` presente e idêntico à origem permitida, rota exata, tentativa ativa, validade temporal, org ativa.
- Validar `state` sempre que o contrato o devolver. Callback sem `state` só aceito quando o lookup por `app_user_id` comprovar propriedade.
- Claim atômico da tentativa antes de exchange/lookup; anti-replay por estado + hash do código quando aplicável.
- Remover aliases especulativos (`connection_key ?? api_key ?? connection_api_key`). Schema estrito derivado da resposta real.
- `connected` só depois de: chave final obtida, probe Calendar 2xx, conta Google identificada, calendário "FENASOJA — Cronograma" criado/recuperado, `secondary_calendar_id` acessível, org+user revalidados.
- Callback exibe "Validando autorização" → "Preparando calendário"; sucesso só após confirmação do backend.
- `status` reverifica conexões antigas/suspeitas e retorna `reconnect_required` se revogadas.

Interfaces:
- `start` → `authorization_url, attempt_id, expires_at, contract_version`.
- `observe_callback` → só metadados sanitizados.
- `complete` → payload do contrato real; nunca aceita chave enviada pelo browser.
- `status` → conexão verificada, progresso da fila, última sync, `contract_version`.

## Fase 3 — Calendário, backfill, worker

- Confirmar escopos concedidos: `calendar` (criação via POST), `calendar.events`, `openid`, `profile`.
- Recuperação/criação idempotente por `secondary_calendar_id` e busca em `users/me/calendarList`.
- Auditar `leomateus620@gmail.com`: associação ativa, `cronograma_evento_comissoes`, eventos com `start_date`, admins com `full_access`.
- Confirmar dedupe da outbox e do Google por `user_id + org_id + event_id + connection_generation`.
- Worker:
  - Restaurar `verify_jwt = true` em `supabase/config.toml` para `google-sync-worker`.
  - `invoke_google_sync_worker()` volta a usar service-role do Vault; remover `internal_worker_tokens` e o header `X-Worker-Token`.
  - Manter recuperação de `in_flight` vencido, tentativas limitadas, dead-letter.
- Auditar `supabase_migrations.schema_migrations` antes de qualquer SQL. As migrations `20260722234000` e `20260723004740` são quase duplicadas — não reaplicar cegamente; nova migration só aditiva (coluna `callback_observation`).

## Fase 4 — Validação e publicação

- Corrigir os 3 testes focados atualmente quebrados.
- Cobrir: callback real, `state` ausente/mismatch, tentativa ausente, replay, `Origin`/rota incorreta, expiração, dois fluxos simultâneos, usuários/orgs distintos.
- Cobrir: lookup/exchange com schema real, proibição de session ID como chave, probe obrigatório, calendário idempotente.
- Cobrir: admins, comissões, outbox duplicada, retries, dead-letter, acesso revogado, desconexão/reconexão, isolamento entre dois usuários.
- Rodar: lint, `tsc --noEmit`, unit, integração, build de produção, varredura de segredos no diff/histórico da branch.
- Ordem de publicação: migration aditiva → Edge Functions → frontend. Edge nova mantém compat temporária com frontend antigo.
- E2E real com 2 usuários e 2 contas Google: conectar, calendário via API, criar/editar/remover evento, `google_calendar_event_map`, `extendedProperties.private.fenasoja_event_id`, desconectar/reconectar, provar isolamento.
- Rollback: frontend, Edge e cron reverssíveis independentemente; migrations aditivas; nenhuma conexão válida apagada automaticamente.

## Detalhes técnicos

- Migration aditiva:
  ```sql
  ALTER TABLE public.google_calendar_oauth_attempts
    ADD COLUMN IF NOT EXISTS callback_observation JSONB;
  ```
- `supabase/config.toml`: `[functions.google-sync-worker] verify_jwt = true`.
- Remover `internal_worker_tokens` do fluxo (tabela pode continuar no DB por enquanto; drop só depois do worker estabilizado).
- Contrato `contract_version` como string curta (ex.: `"2026-07-23"`), incluída em start/complete/status/observe.
- Sanitização do observe: `{ transport, params: [{name, length}], hasCode, hasState, hasAttempt, hasError, route, contract_version }` — sem valores.

## Fora de escopo
- Rotas de UI além do necessário para o callback.
- Mudança do provider social (segue Google via App User Connector, exceto se Fase 1 provar inadequação).
- Alterações no fluxo de lembretes por e-mail (já validado).
