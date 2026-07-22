## Objetivo

1. Provisionar 3 contas com senha (Presidente, Vice, Assessoria de Marketing).
2. Garantir que cada um receba os e-mails de lembrete (24h antes e 2h antes) de **todos os eventos do cronograma, exceto os do tipo `feriado`**.
3. Validar o fluxo enviando os lembretes do evento **ENCONTRO REGIONAL DE INOVAÇÃO E EMPREENDEDORISMO** (2026-07-24 08:00) para os 3 e-mails.

## Contexto verificado

- Org única: `Fenasoja 2026` (`985888b8-…`).
- Comissão `CENTRAL` existe (`d85594df-…`).
- Evento alvo confirmado: `ee37d7f7-9dac-4797-8b0c-7a0073b5119f`, `start_date=2026-07-24`, `start_time=08:00`.
- `event-reminders` só agenda entregas para membros ativos de `org_members` cujas `commission_id` estão em `cronograma_evento_comissoes` do evento; hoje o filtro exclui feriados naturalmente **apenas se nenhuma comissão for vinculada** — precisamos filtrar explicitamente `event_type <> 'feriado'`.
- Data atual (UTC-3) = 2026-07-22, então 24h dispara 2026-07-23 08:00 e 2h dispara 2026-07-24 06:00 — dentro da janela normal do cron.

## Passos

### 1. Criar/atualizar os 3 usuários (edge function `create-user` via service role)
Para cada e-mail abaixo, criar auth user com `email_confirm=true`, senha temporária forte e vincular como `org_member` (role `operador`) da org Fenasoja 2026, além de linkar à comissão `CENTRAL` para receber os lembretes:

| Nome | E-mail | Cargo |
|---|---|---|
| Soltis | soltis.fs@gmail.com | Presidente FENASOJA 2028 |
| Djeison Drey | djeisondrey@gmail.com | Vice-presidente FENASOJA 2028 |
| Zélia Savoldi | zelia.savoldi@hotmail.com | Assessoria de Marketing |

Observações:
- O e-mail com acento (`zélia…`) não é RFC-válido; usar `zelia.savoldi@hotmail.com` e avisar o usuário.
- Se o e-mail já existir em `auth.users`, apenas atualizar senha (`auth.admin.updateUserById`) e garantir vínculo em `org_members` (upsert por `org_id,user_id`).
- Senhas serão geradas aleatoriamente e informadas no chat apenas 1× (o usuário deve trocar depois).

### 2. Vincular os 3 usuários a **todas** as comissões vinculadas a eventos não-feriado
O agendador só entrega lembretes quando o usuário é membro ativo de uma comissão vinculada ao evento. Para atender o pedido "todos os eventos exceto feriados" sem duplicar entregas, adotar a solução mínima:

- Vincular os 3 aos "grupos" que cobrem 100% dos eventos: `CENTRAL` (já é o hub principal). 
- Estender o `scheduleReminders` em `supabase/functions/event-reminders/index.ts` para tratar como destinatários **todos os `org_members` ativos** com uma nova capability `cronograma_reminder_all` (para os 3 executivos), além dos membros por comissão. Isso evita adicionar os presidentes em 30 comissões e cobre "todos os eventos exceto feriados".
- Filtrar explicitamente `.neq('event_type', 'feriado')` na query de eventos e no `sendPending` (defesa em profundidade).

Registrar a capability em `user_capabilities` para os 3 novos usuários.

### 3. Backfill de entregas futuras
Rodar `event-reminders?mode=schedule` para materializar os `event_reminder_deliveries` para os próximos 30 dias já contemplando os 3 novos destinatários (via a nova regra).

### 4. Teste ponta-a-ponta com o Encontro Regional
- Inserir 6 linhas em `event_reminder_deliveries` (3 usuários × 2 offsets: 1440 e 120), `scheduled_for = now()`, `status = pending`, `event_id = ee37d7f7…`.
- Chamar `event-reminders?mode=send` com o service role.
- Verificar em `email_send_log` que os 6 e-mails saíram usando o template `event-reminder` (o "modelo novo").
- Conferir status final `sent` em `event_reminder_deliveries`.

### 5. Comunicar resultado
Informar no chat: e-mails, senhas geradas, confirmação do disparo do teste e do agendamento futuro. Instruir o usuário a validar a caixa de entrada dos 3 destinatários.

## Detalhes técnicos

- Edge function `event-reminders` recebe uma nova query para `scheduleReminders`: união de (membros por comissão) ∪ (usuários com capability `cronograma_reminder_all` na mesma org). Mantém o `idempotency_key` atual.
- Filtro `event_type <> 'feriado'` aplicado em `scheduleReminders` (query principal) e como guard em `sendPending`.
- Senhas geradas via `crypto.randomUUID().slice(0,12) + "!Aa1"` no lado do agente para exibir uma única vez ao usuário (não usar `generate_secret` porque precisam ser mostradas).
- Nenhuma mudança de schema; usa tabelas existentes (`user_capabilities`, `org_members`, `event_reminder_deliveries`).
- Redeploy da função `event-reminders` após a alteração.
