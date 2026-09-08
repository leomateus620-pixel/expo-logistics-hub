# Auditoria de Notificações — Fenasoja Log (modo plano)

## 1. Mapa de arquivos

### Envio de e-mail (backend)
```text
supabase/functions/
  auth-email-hook/index.ts          -> e-mails de autenticação (signup, recovery, magiclink...)
                                       renderiza React Email e chama rpc enqueue_email(queue 'auth_emails')
  send-transactional-email/index.ts -> ÚNICO ponto de envio de e-mail de aplicação
                                       (só aceita chamada com service-role); checa suppressed_emails,
                                       cria/reusa token de unsubscribe, renderiza template,
                                       rpc enqueue_email(queue 'transactional_emails')
  process-email-queue/index.ts      -> worker pgmq (auth_emails -> transactional_emails), retries/DLQ
  handle-email-unsubscribe/index.ts -> valida token e grava em suppressed_emails
  handle-email-suppression/index.ts -> webhooks de bounce/complaint
  preview-transactional-email/      -> preview de templates
  _shared/email-templates/*.tsx     -> templates de auth
  _shared/transactional-email-templates/
      registry.ts                   -> TEMPLATES (hoje só 'event-reminder')
      event-reminder.tsx            -> layout do lembrete
  _shared/eventReminderModel.ts     -> normalização/validação de dados + buildCronogramaEventUrl,
                                       buildGoogleCalendarEventUrl
  event-reminders/index.ts          -> agendador + despachante dos lembretes
```

Tabelas de e-mail: `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`.

### Outros canais existentes
- WhatsApp (links `wa.me`, não é envio automático): `supabase/functions/transport-lifecycle/index.ts`, que lê `notification_recipients`.
- Sino em app: tabela `notification_session_seen` (controle de exibição única por sessão).

## 2. Lembretes de evento (`event_reminder_deliveries`)

Agendamento por pg_cron:
- `event-reminders-schedule` a cada 5 min -> `event-reminders?mode=schedule`
- `event-reminders-send` a cada 1 min -> `event-reminders?mode=send`

`mode=schedule` (função `scheduleReminders`):
- Varre `cronograma_eventos` com `has_exact_date = true`, `event_type <> 'feriado'`, `start_date` entre hoje e +30 dias.
- Destinatários por evento (Map deduplicado por `user_id`):
  1. membros ativos de `org_members` cujo `commission_id` está em `cronograma_evento_comissoes` do evento;
  2. vínculos diretos em `cronograma_evento_responsaveis` (`responsible_type='member'`), se ativos em `org_members`;
  3. usuários com `user_capabilities.capability = 'cronograma_reminder_all'` da mesma org (recebem todos os eventos).
- Offsets fixos: **1440, 120 e 60 minutos** antes do início; entregas no passado são ignoradas.
- Idempotência: `idempotency_key = user_id|event_id|event_version|offset` com `upsert ... ignoreDuplicates`.
- Coluna `channel` já existe na tabela, com default `'email'` — hoje nunca é preenchida com outro valor.

`mode=send` (função `sendPending`):
- Pega até 50 entregas `pending` com `scheduled_for <= now`, faz *claim* otimista por `updated_at`.
- Resolve e-mail via `auth.admin.getUserById`; sem e-mail -> `skipped`.
- Monta payload (comissões visíveis ao destinatário, subeventos não cancelados, pendências, CTA e link opcional do Google Agenda) e chama `send-transactional-email` com service-role.
- Grava `sent` / `skipped` / `failed`.

Cancelamento: a função SQL `enqueue_google_sync(event_id, operation)` — chamada pelo trigger `tg_evento_google_sync` em alterações/exclusões de evento — marca todas as entregas `pending` daquele evento como `cancelled`. Como o `event_version` (lock_version) muda, o scheduler recria as entregas na versão nova.

RLS de `event_reminder_deliveries`: `SELECT` só do próprio usuário; escrita apenas service_role.

## 3. Google Calendar

`google-calendar-oauth`, `google-calendar-oauth-callback`, `google-sync-worker`, com `google_calendar_connections`, `google_sync_outbox`, `google_calendar_event_map`, `google_calendar_sync_preferences`. **Não dispara e-mail algum.** A única interseção com e-mail é de leitura: o lembrete usa `google_calendar_event_map` para incluir o link "Ver no Google Agenda". Público do sync é definido por `google_sync_affected_users` (membros de comissão do evento com conexão ativa) — critério parecido, porém mais restrito que o dos lembretes.

## 4. Tabelas de destinatários e permissões

| Tabela | Papel | RLS |
|---|---|---|
| `notification_recipients` | contatos fixos de WhatsApp por org (agentes de viagem). Não participa de e-mail | SELECT: membro da org; INSERT/UPDATE/DELETE: admin/gestor |
| `user_capabilities` | capacidades finas por usuário/org; `cronograma_reminder_all` amplia o público do lembrete | leitura própria/admin |
| `user_roles` | papel global (`admin`/`user`) via `has_role` | leitura própria |
| `org_members.role` (`org_role`) | admin/gestor/operador/leitura por org; base de `get_user_org_role` e `is_org_member` | políticas por org |

Ou seja: **quem recebe lembrete = vínculo por comissão + vínculo direto + capability global**, sempre restrito a membros ativos da org do evento. RLS não participa da seleção (o worker roda com service-role), mas espelha o mesmo escopo para leitura no app.

## 5. Push / FCM / service worker

- Nenhum código de Firebase, FCM, `PushManager`, `Notification.requestPermission` ou VAPID no projeto.
- `public/sw.js` existe (cache offline, `install`/`activate`/`fetch`/`message`) e **não tem** listeners `push` nem `notificationclick`.
- Não há tabela de tokens de dispositivo.
- Conclusão: canal push é greenfield; só a coluna `channel` em `event_reminder_deliveries` já antecipa multicanal.

## 6. Logo da Fenasoja nos e-mails

O template `event-reminder.tsx` **não usa imagem** — é tipográfico (sem `<Img>`). O logo oficial existe apenas no app: `src/assets/fenasoja-logo-oficial.png` (usado por `src/components/brand/FenasojaBrand.tsx`). Para e-mail/push seria preciso uma URL pública absoluta (bucket público do backend ou `https://fenasojagestao.com/...`), já que o import do Vite não é acessível fora do app.

## 7. Fluxo atual: gatilho -> destinatários -> canal

```text
cron 5min  -> event-reminders?mode=schedule
                -> eventos com data (30d)
                -> destinatários: comissões + responsáveis diretos + capability global
                -> event_reminder_deliveries (channel='email', 3 offsets, idempotente)

cron 1min  -> event-reminders?mode=send
                -> claim otimista -> resolve e-mail do auth.users
                -> send-transactional-email (service-role)
                -> suppressed_emails? -> enqueue_email(transactional_emails)
                -> process-email-queue -> provedor -> email_send_log

edição/exclusão de evento -> trigger -> enqueue_google_sync -> cancela pendentes
```

## 8. Onde encaixar o canal `push` (FCM) sem mudar quem recebe

Princípio: **não tocar na resolução de destinatários**. O conjunto de `user_id` já calculado em `scheduleReminders` é a fonte única; push apenas ganha linhas paralelas com `channel='push'`.

Pontos exatos:

1. **Nova tabela `push_devices`** (`user_id`, `org_id`, `fcm_token` único, `platform`, `user_agent`, `last_seen_at`, `revoked_at`), com GRANTs e RLS por `user_id = auth.uid()` + service_role. É a única estrutura nova de dados.
2. **`event-reminders/index.ts` → `scheduleReminders`**: no laço de offsets, após o upsert de e-mail, inserir a entrega equivalente com `channel: 'push'` e `idempotency_key` sufixado (`...|push`), **apenas para `user_id` que tenham device ativo** — mesmo Map de destinatários, zero mudança de regra.
3. **`event-reminders/index.ts` → `sendPending`**: ramificar por `delivery.channel`. `email` mantém o caminho atual; `push` chama uma nova função `send-push-notification` com o mesmo payload lógico (título, data/hora, local, CTA `buildCronogramaEventUrl`).
4. **Nova edge function `send-push-notification`** (espelho de `send-transactional-email`): aceita apenas service-role, busca tokens em `push_devices`, envia via gateway do conector Firebase Cloud Messaging (`v1/projects/_/messages:send`), registra em um `push_send_log` e apaga tokens que retornarem 404/UNREGISTERED. Registrar em `supabase/config.toml`.
5. **Cancelamento**: `enqueue_google_sync` já cancela por `event_id` + `status='pending'`, independentemente do canal — nada a alterar no SQL.
6. **Frontend**: hook `usePushRegistration` + botão de opt-in nas Configurações (permissão exige gesto do usuário e aba própria, não o preview em iframe), gravando o token em `push_devices`.
7. **`public/sw.js`**: adicionar apenas listeners `push` e `notificationclick` (abrir a URL do evento), preservando a estratégia de cache atual. Um `public/firebase-messaging-sw.js` separado atende o SDK do FCM.
8. **Conector**: ligar o Firebase Cloud Messaging com a opção *Include web push* (chave web, app ID e VAPID) antes de qualquer código de registro.

Nenhuma alteração em `notification_recipients`, `user_roles`, `user_capabilities`, `org_members`, RLS existente, ou nos critérios de visibilidade da Agenda.

## 9. Observações e riscos

- Ausência de logo em e-mail: se quiser branding em push (ícone) e e-mail, publicar o PNG em URL absoluta primeiro.
- Push não passa por `suppressed_emails` (que é específico de e-mail); o opt-out de push é a própria revogação do token.
- Os três offsets (24h/2h/1h) seriam replicados para push; se preferir menos ruído, definir offsets específicos para push é uma decisão a confirmar antes da implementação.
