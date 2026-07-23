## Objetivo

Consolidar o fluxo Google Agenda + notificações para todos os usuários (Leonardo já conectado; Soltis, Zélia e Djeison ao conectar):

1. **Backfill automático ao conectar** — quem conectar recebe todos os eventos já cadastrados no calendário FENASOJA.
2. **Sincronização contínua** — novos eventos cadastrados no futuro sincronizam automaticamente para todas as contas conectadas.
3. **Três lembretes por e-mail** por evento (exceto feriados): **1 dia antes, 2 horas antes e 1 hora antes**.
4. **UI**: quando o backfill atingir 100%, o widget muda de "Em andamento / Sincronizando" para **"Conectado"** automaticamente.

## O que já está pronto (não mexer)

- `google-calendar-oauth-callback` já enfileira **todos os eventos futuros da org** em `google_sync_outbox` no momento em que qualquer usuário conclui a autorização (`prepareInitialBackfill`). Vale para Soltis, Zélia e Djeison assim que conectarem.
- Triggers de `cronograma_eventos` já criam tarefas de upsert no outbox para **cada conexão ativa** quando um evento novo é cadastrado/editado — a sincronização contínua já cobre eventos futuros para todos os conectados.
- RPC `complete_google_sync_task` já muda `status` de `synchronizing` → `connected` quando `backfill_done >= backfill_total`, e o hook `useGoogleCalendarConnection` já mapeia `connected` para o rótulo **"Conectado"** no widget. Nenhuma mudança de UI necessária além de garantir que o backfill dispare para as 3 contas quando conectarem.

## Mudanças a implementar

### 1. Adicionar lembrete de 1 hora antes

**`supabase/functions/event-reminders/index.ts`**
- Ampliar o loop de agendamento para `[1440, 120, 60]` (hoje é `[1440, 120]`), gerando uma linha em `event_reminder_deliveries` para cada offset.
- Ajustar a derivação de `reminderType` no payload de envio: `>=1440 → '24h'`, `>=120 → '2h'`, senão `'1h'`.
- Idempotência preservada pela chave `reminder-{eventId}-{version}-{offset}-{userId}`, então lembretes já enviados de 24h/2h não são reenviados; apenas o novo offset de 60 min entra.

**`supabase/functions/_shared/eventReminderModel.ts`**
- Estender `EventReminderType` para `'24h' | '2h' | '1h'`.
- Validação: aceitar `'1h'` em `normalizeEventReminderTemplateData`.
- Cabeçalho e intro para `'1h'`: "Seu evento começa em 1 hora" / `"${eventTitle}" começa em 1 hora. Revise os detalhes finais e confirme presença.`

**`supabase/functions/_shared/transactional-email-templates/event-reminder.tsx`**
- Ajustar textos condicionais que hoje diferenciam apenas 24h vs 2h para incluir a variante 1h (preview text, saudação, chamada). Mesmos estilos e componentes.

**`src/test/eventReminderEmail.test.tsx`**
- Adicionar um caso cobrindo `reminderType: '1h'` (renderização e texto "1 hora").

### 2. Confirmar comportamento das 3 contas ao conectar

- Nenhuma migração de dados. Ao conectar pela primeira vez, o callback já faz:
  1. Troca de código + criptografia de tokens.
  2. Cria calendário secundário FENASOJA na conta do usuário.
  3. `prepareInitialBackfill` seleciona todos os `cronograma_eventos` futuros da org e insere no `google_sync_outbox` marcando `is_initial_backfill = true` + atualiza `backfill_total` na conexão.
  4. Dispara `google-sync-worker`; a cada tarefa concluída `backfill_done` incrementa e, ao atingir o total, o status vira `connected` → UI mostra **"Conectado"**.

### 3. Deploy

Redeploy das edge functions afetadas:
- `event-reminders`
- (opcional, se editado) `preview-transactional-email` para refletir a variante 1h em pré-visualizações.

## Fora do escopo

- Não alterar backfill/worker existente (já funcional para Leonardo com 150 eventos).
- Não criar novos endpoints de UI — o rótulo "Conectado" já é produzido pelo hook quando o backend transita.
- Não enviar em massa retroativamente lembretes de 1h para eventos que já passaram (o scheduler ignora automaticamente pois `send_after` seria no passado — ainda assim marcamos como `skipped` se ocorrer).

## Validação

1. `bun test src/test/eventReminderEmail.test.tsx` — variante 1h renderiza sem sentinelas.
2. Consulta manual: após deploy, verificar `event_reminder_deliveries` recebendo linhas com `offset_minutes = 60` para eventos futuros.
3. E2E: quando Soltis/Zélia/Djeison conectarem, checar `google_calendar_connections.backfill_total > 0` e status transicionando para `connected` ao final; widget exibindo "Conectado".
