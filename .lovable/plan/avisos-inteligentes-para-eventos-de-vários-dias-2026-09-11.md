# Avisos inteligentes para eventos de vários dias

Hoje o aviso no celular só existe para o começo do evento (1 hora antes). Quando um evento ocupa vários dias (ex.: 11/09 08:00 → 15/09 18:00), os participantes não recebem nada nos dias seguintes. Este plano cria um ciclo de avisos que acompanha o evento do começo ao fim, sem repetir e sem transformar um evento em vários.

## Como vai funcionar

Para um evento de 11 a 15 de setembro, cada pessoa relacionada recebe:

- 11/09: o aviso atual, 1 hora antes do início, agora indicando que o evento segue até 15 de setembro.
- 12, 13 e 14/09: um único aviso às 07:00 dizendo que o evento está em andamento (com "dia 3 de 5" e, na véspera do fim, "encerra amanhã").
- 15/09: um único aviso às 07:00 dizendo que é o último dia e a que horas encerra.

Eventos de um dia só continuam exatamente como estão hoje.

## Regras

- No máximo um aviso de ciclo por pessoa, por evento, por dia — mesmo que o agendador rode de novo, o servidor reinicie ou o envio seja repetido.
- Quem recebe continua sendo exatamente quem já recebe hoje: lideranças das comissões vinculadas, pessoas vinculadas diretamente ao evento e quem tem a permissão global de lembretes. Nada muda no público.
- Só recebe quem tem o aviso no celular ativado.
- Se o evento for cancelado, excluído ou marcado como concluído antes do fim, os avisos dos dias seguintes param.
- Se as datas mudarem (encurtar ou esticar), os dias que deixaram de existir não avisam mais e os novos dias passam a avisar; o histórico do que já foi enviado é preservado.
- Tudo calculado no horário de Brasília, nunca em UTC.
- O toque no aviso abre sempre o mesmo evento, na tela de detalhes.
- Os títulos seguem o padrão em maiúsculas da Agenda, com acentos preservados.

## Detalhes técnicos

Reaproveita a infraestrutura existente (`event_reminder_deliveries`, `event-reminders`, `send-push-notification`, cron seguro por `X-Worker-Token`) — nenhum sistema paralelo.

1. **Migração**
   - `event_reminder_deliveries`: novas colunas `notification_type text NOT NULL DEFAULT 'event_start'` (valores `event_start` | `event_ongoing` | `event_final_day`) e `notification_date date NULL` (dia local do aviso).
   - Índice único parcial `(user_id, event_id, notification_type, notification_date)` para linhas de ciclo, além da unicidade já existente em `idempotency_key`.
   - Índice em `cronograma_eventos (org_id, end_date)` para consulta por sobreposição de intervalo.
   - Chave determinística: `user_id|event_id|<tipo>|YYYY-MM-DD|push`. Sem `event_version` nos tipos de ciclo, para que uma edição não gere um segundo aviso do mesmo dia.

2. **`supabase/functions/event-reminders/index.ts` — `scheduleReminders`**
   - Consulta passa a usar sobreposição: `start_date <= horizonte AND coalesce(end_date, start_date) >= hoje`.
   - Mantém os offsets atuais para o primeiro dia (push só em 60 min).
   - Para eventos com `end_date > start_date`, materializa uma entrega por dia local a partir do dia seguinte ao início: tipo `event_ongoing` nos dias intermediários e `event_final_day` no último dia, `scheduled_for` = 07:00 America/Sao_Paulo daquele dia, `channel = 'push'`, só para usuários com aparelho ativo. `upsert ... ignoreDuplicates` na chave.
   - Reconciliação de edição: entregas `pending` de ciclo cujo `notification_date` caiu fora do novo intervalo viram `cancelled` com `last_error = 'event_range_shrunk'`.
   - Constante central `LIFECYCLE_DAILY_HOUR = 7` (única fonte do horário).

3. **`sendPending`**
   - Revalida o evento imediatamente antes de enviar: status `cancelado`/`cancelled`/`concluido`/`completed`, evento inexistente ou dia fora do intervalo atual → `skipped` com motivo explícito, sem envio.
   - Ramo push usa o novo gerador de conteúdo conforme `notification_type`.

4. **`supabase/functions/_shared/pushMessage.ts`**
   - Nova função única `buildEventLifecycleMessage({ state, eventTitle, dayIndex, totalDays, startTime, endTime, endDateLabel, location, eventId })`, cobrindo `START`, `ONGOING` e `FINAL_DAY`, com as variações "dia X de Y", "encerra amanhã" e "encerra hoje às HH:MM". O `path` continua `/cronograma?event=<id>`. Nada de geração de texto duplicada nos workers.

5. **Cancelamento/exclusão**: o cancelamento existente por `event_id` + `status='pending'` (via `enqueue_google_sync`) já alcança as linhas de ciclo; a revalidação no envio é a segunda barreira.

6. **Observabilidade**: logs estruturados com `eventId`, `lifecycleState`, `notificationDate`, destinatário e motivo de pulo (já enviado, evento concluído, cancelado, sem aparelho), sem dados sensíveis.

7. **Testes** (`src/test/`): geração de conteúdo por estado, cálculo de dias/índices, evento de 1, 2 e 5 dias, virada de mês e de ano, agendador rodando duas vezes, retentativa, encurtamento e extensão de intervalo, cancelamento/conclusão no meio, múltiplos destinatários, múltiplos aparelhos e evento de um dia inalterado.

Nada será publicado em produção.
