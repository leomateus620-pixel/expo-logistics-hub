# Casa Fenasoja: avisos e Google Agenda para Fernanda, Débora e Zélia

## Objetivo
Todo evento da Agenda Fenasoja com local oficial **CASA FENASOJA** chega automaticamente para:
- FERNANDA SECKLER EICH
- DÉBORA LETÍCIA BAMBERG
- ZÉLIA SAVOLDI

Nos dois canais: aviso no celular (novo vínculo + lembretes 24h/2h/1h) e Google Agenda (criar, alterar, cancelar).

## Como vai funcionar
- Regra por local, não por evento: uma lista "acompanhantes do local" (Casa Fenasoja → as três). Não é preciso marcá-las como responsáveis em cada evento, e os responsáveis atuais não mudam.
- Evento criado ou editado para Casa Fenasoja: as três entram no público do evento e recebem o aviso "Novo evento na Casa Fenasoja".
- Evento que sai da Casa Fenasoja: some da Google Agenda delas e os lembretes futuros param.
- Evento cancelado: removido da Google Agenda e sem lembretes.
- Sem duplicidade: se uma delas já for responsável ou da comissão do evento, recebe uma vez só.
- Eventos já existentes na Casa Fenasoja: sincronizados uma única vez (só os futuros recebem lembrete; nenhum aviso em massa de "novo evento" para o passado).
- Só vale o local escolhido no seletor oficial; texto livre parecido com "Casa" não ativa a regra.
- Elas passam a ver esses eventos na Agenda (necessário para receber detalhes), sem ganhar permissão de editar.

## Verificações
- Conferir no banco que as três contas existem, estão na organização e se têm celular registrado e Google Agenda conectada (quem não tiver conectado fica pendente; informo).
- Testes automáticos: evento na Casa → 3 destinatárias; mudança de local → retiradas; cancelado → nada; sem duplicidade.

## Detalhes técnicos
- Nova tabela `cronograma_location_watchers (org_id, location_code, user_id)` com RLS (leitura para membros, escrita só admin), seed das três por UUID (Fernanda 0c320692…, Débora d251d7d6…, Zélia 38e7e8d3…), validando no banco antes.
- Incluir os watchers nas funções que hoje calculam destinatários dos lembretes (`cronograma_reminder_all`/responsáveis/comissões), na fila `event_assignment_notifications` (source novo `location`) e na fila `google_sync_outbox` (upsert/delete ao mudar `location_code` ou status), via trigger em `cronograma_eventos`.
- Incluir watchers no conjunto `cronograma_visible_event_ids` (padrão por conjunto, sem função por linha).
- `buildAssignmentPushMessage`: texto para source `location`. Reimplantar `event-assignment-push` e a função de sincronização Google.
- Backfill idempotente dos eventos futuros com `location_code='casa_fenasoja'`.
- Registrar regra no `src/components/cronograma-eventos/AGENTS.md`.
