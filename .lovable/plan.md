
## Objetivo
Validar o fluxo completo criando um evento real e disparando: (1) e-mail para leomateus620@gmail.com, (2) sino de notificação no app, (3) sincronização no Google Agenda do usuário Leonardo.

## Passos

### 1. Descoberta de IDs (via `supabase--read_query`)
- Localizar `user_id` do Leonardo pelo e-mail `leomateus620@gmail.com` em `auth.users`.
- Confirmar `org_id` ativo e `commission_id` da comissão CENTRAL vinculada ao Leonardo em `org_members`.
- Verificar em `google_calendar_connections` se Leonardo tem `status=connected` (pré-requisito da sincronização automática no Google Agenda). Se não estiver conectado, avisar e prosseguir apenas com e-mail + sino.

### 2. Criação do evento de teste (via `supabase--insert`)
Inserir em `cronograma_eventos`:
- `title`: "REUNIÃO COM OS SOLTIS — PRESIDENTE FENASOJA 2028"
- `start_date`: amanhã (quarta-feira, data calculada em UTC-3)
- `start_time`: `13:30`
- `has_exact_date`: true
- `category`: representações
- `location`: (deixar null ou preencher se o usuário indicar)
- `org_id` e `created_by_user_id` do Leonardo.

Inserir vínculos:
- `cronograma_evento_responsaveis` → user_id do Leonardo.
- `cronograma_evento_comissoes` → commission_id CENTRAL (para que o `next-events-feed` traga esse evento no sino).

### 3. Disparo do agendamento
- Chamar `event-reminders?mode=schedule` via `supabase--curl_edge_functions` para materializar as entregas em `event_reminder_deliveries` (offsets 1440min e 120min).
- Como o evento é amanhã 13:30 e agora estamos ~22h de hoje, o lembrete de 24h já está no passado → forçar envio imediato do lembrete de 24h ajustando temporariamente `scheduled_for` para "agora" via `supabase--insert`/update SQL, de modo que o worker `send` colete e envie.
- Chamar `event-reminders?mode=send` para processar as entregas pendentes → envia o e-mail via `send-transactional-email` (template `event-reminder`).

### 4. Sincronização Google Agenda
- Se Leonardo estiver conectado: inserir uma linha em `google_sync_outbox` (op=`upsert_event`, event_id do novo evento, user_id do Leonardo) e invocar `google-sync-worker` via `supabase--curl_edge_functions`. Isso cria o evento no calendário secundário "FENASOJA — Cronograma" do Leonardo.
- Se não estiver conectado: reportar ao usuário que o passo do Google Agenda foi ignorado e pedir para conectar via o widget no dashboard.

### 5. Validação
- Consultar `email_send_log` para confirmar `status='sent'` do lembrete.
- Consultar `event_reminder_deliveries` para confirmar `status='sent'` e `sent_at`.
- Consultar `google_calendar_event_map` para confirmar o `google_event_id` criado (se conectado).
- Chamar `next-events-feed` como o Leonardo para confirmar que o sino/`UpcomingEventsBell` retorna o evento.
- Reportar o resultado consolidado ao usuário: e-mail enviado ✔, sino ativo ✔, Google Agenda ✔/pendente.

## Observações
- Tudo pode ser executado sem alterações de código — apenas dados + invocação de edge functions já implantadas.
- Nenhum arquivo será modificado neste turno.
