# Notificações da Agenda Restaurante e Arena (push + Google Agenda)

## 1. Como funciona hoje (verificado)
- **Push/e-mail:** cron `event-reminders-schedule` (5 min) gera linhas em `event_reminder_deliveries` (offsets 1440/120/60; push só no de 60 min, para quem tem `push_devices` ativo e a preferência de aviso no celular); cron `event-reminders-send` (1 min) envia via `send-push-notification` (FCM fenasoja-gestao). `event-assignment-push` (1 min) avisa atribuições. Idempotência: `idempotency_key` = usuário|evento|versão|offset|canal.
- **Google:** gatilhos enfileiram em `google_sync_outbox` (dedupe_key, connection_generation); `google-sync-worker` (cron 1 min) reivindica via `claim_google_sync_batch`, cria/atualiza/remove e grava em `google_calendar_event_map`.
- **Por que o Restaurante e Arena fica fora:** tudo isso está preso a `cronograma_eventos` — `event_reminder_deliveries.event_id` e `push_send_log.event_id` têm FK para `cronograma_eventos`; o worker Google e os destinatários leem só cronograma/comissões/responsáveis do cronograma. `venue_events` não tem gatilho, outbox nem lembrete.

## 2. Modelo do Restaurante e Arena
- Eventos em `venue_events` (status inclui cancelado/recusado; `version`, `start_at/end_at`, `responsible_user_id`), espaços em `venue_event_spaces` → `venue_spaces.type` (`restaurante` / `arena`).
- Acesso por capabilities `venue_events_access` (4 usuários) e `venue_events_full_access` (4); responsáveis por evento em `venue_event_responsibles`.
- **Roque:** existem **dois perfis** ("ROQUE VANDERLEI LUGOCH" e "Roque Vanderlei Lugoch"), nenhum com capability, push ou Google conectado. Primeiro passo da implementação: confirmar com você qual conta ele usa para entrar.

## 3. Regra de destinatários (sem nome fixo)
Nova tabela pequena `venue_notification_subscriptions` (org, usuário, escopo `restaurante` | `arena`, push on/off, google on/off). Destinatário de um evento =
- inscrito no escopo do espaço do evento **e** com acesso ao módulo (`venue_events_access` ou `_full_access`, revalidado no envio), **ou**
- `responsible_user_id` / `venue_event_responsibles` do evento (se tiver acesso).
Sem depender de `org_members.commission_id`. Tela de administração (aba "Notificações" na Agenda Restaurante e Arena, só full_access) para gerenciar inscritos. O Roque entra por dado: capability de acesso + inscrição em **Restaurante e Arena** (ambos, já que ele responde pelos dois), cada um desligável.

## 4. Fluxos
**Push**
- Avisos imediatos: criação, mudança de data/horário/espaço e cancelamento (gatilho em `venue_events`/`venue_event_spaces` enfileira, sem avisar o autor da mudança).
- Lembretes 24h/2h/1h, mesmo padrão atual (push no de 1h).
- Clique abre `/restaurante-arena?event=<id>` (rota real conferida na implementação).
- Card "Avisos no celular" na agenda com ativação, estados (ativo, negado, abrir fora do editor) reaproveitando o fluxo existente.

**Google Agenda**
- Mesma conexão Google já existente; o worker passa a aceitar tarefas de origem `venue`, gerando evento com título, espaço e horário; remove ao cancelar/excluir/perder acesso.
- Card de status: conectado, conta, último sync, reconectar, desconectar, e chaves por escopo.

## 5. Mudanças técnicas
- Migração: `venue_notification_subscriptions` (+GRANT, RLS própria/admin); colunas `source` ('cronograma'|'venue') + `venue_event_id` em `event_reminder_deliveries`, `push_send_log`, `google_sync_outbox`, `google_calendar_event_map` (FK cronograma mantida e tornada opcional, CHECK de exatamente uma origem, índices únicos por origem); função `venue_notification_recipients(event)` SECURITY DEFINER; gatilhos de enfileiramento em `venue_events`, `venue_event_spaces`, inscrições.
- Edge: `event-reminders` (ramo venue), `event-assignment-push` (avisos imediatos venue), `google-sync-worker` (builder venue); `send-push-notification` sem mudança de credenciais.
- Front: hook `useVenueNotificationSettings`, cards de push/Google e aba de inscritos em `VenueWorkspace`.
- Dados: capability + inscrição do Roque após você confirmar a conta.

## 6. Testes e riscos
- Testes: elegibilidade (inscrito sem acesso não recebe; responsável sem comissão recebe; Arena só para inscritos em Arena), idempotência (reexecução do cron não duplica), criação/alteração/cancelamento, autor não notificado, sync Google sem duplicar após reprocessar e removendo no cancelamento; regressão dos testes atuais de cronograma.
- Riscos: alterar FKs/chaves únicas das tabelas compartilhadas (mitigado com coluna de origem e testes de regressão); perfil duplicado do Roque; Google exige reconexão se escopo atual faltar.
- Sem conflito com o plano anterior (alerta do Centro de Eventos só lê Restaurante). Não mexe no Mapa Comercial; não publica.
