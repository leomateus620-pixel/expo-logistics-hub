# Aviso no celular: apenas 1 hora antes do evento

## O que muda
- O aviso no celular passa a ser enviado **uma única vez, 1 hora antes** de cada evento.
- Os avisos de 24 horas e 2 horas antes deixam de existir no celular.
- Os **e-mails continuam exatamente como estão** (24h, 2h e 1h) e as mesmas pessoas de sempre continuam recebendo — nada muda em quem recebe.

## Como será feito
1. Na rotina que prepara os lembretes (`supabase/functions/event-reminders/index.ts`), o canal `push` passa a ser criado somente quando o intervalo é de 60 minutos; o canal de e-mail mantém os três intervalos.
2. Limpeza pontual: remover os avisos de celular ainda pendentes que tenham sido criados para os intervalos de 24h e 2h (nenhum já enviado é afetado).
3. Publicar a função atualizada e conferir, para a reunião de hoje às 18:30, que existe apenas o aviso de celular das 17:30.

## Detalhes técnicos
- Em `scheduleReminders`, o laço de offsets `[1440, 120, 60]` continua gerando linhas `channel='email'`; a linha `channel='push'` fica condicionada a `offset === 60` e à existência de aparelho ativo em `push_devices`.
- A chave de idempotência do push (`...|push`) não muda, então não haverá duplicidade nem reenvio.
- `DELETE FROM event_reminder_deliveries WHERE channel='push' AND status='pending' AND offset_minutes IN (1440,120)`.
- Sem alteração em RLS, capabilities, resolução de destinatários ou nas rotinas agendadas.
- Nada será publicado em produção.
