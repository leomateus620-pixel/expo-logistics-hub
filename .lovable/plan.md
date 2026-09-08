# Aviso no celular quando alguém é vinculado a um evento

Hoje o aviso no celular só acontece 1 hora antes do evento. Vamos acrescentar um segundo tipo de aviso: assim que uma pessoa (ou uma comissão/assessoria) é vinculada a um evento, quem passou a fazer parte recebe na hora um aviso no celular.

## Como vai funcionar para o usuário

- Fabiano cria (ou edita) um evento e vincula Leonardo e Cléo: os dois recebem em segundos um aviso "Você foi vinculado ao evento X — dia, horário, local".
- Se o vínculo for por comissão/assessoria, todos os membros ativos daquela comissão recebem o mesmo aviso.
- Quem cria/edita não recebe aviso do próprio vínculo.
- Cada pessoa recebe no máximo um aviso por evento por rodada, mesmo que seja vinculada como responsável e por comissão ao mesmo tempo.
- Tocar no aviso abre o evento direto na Agenda Fenasoja.
- Quem não ativou avisos no celular simplesmente não recebe nada (o e-mail e o lembrete de 1 hora continuam iguais).
- Nada muda em quem pode ver o quê: só é avisado quem já teria acesso ao evento pelas regras atuais.

## Casos cobertos

- Evento novo com responsáveis e/ou comissões já preenchidos.
- Evento existente que ganha um novo responsável ou uma nova comissão.
- Vínculos criados por qualquer caminho (formulário, planejamento de subeventos, importação), porque o gatilho fica no banco.
- Remoção de vínculo: não gera aviso.
- Evento já concluído/cancelado ou com data passada: não gera aviso.

## Detalhes técnicos

**Banco**
- Nova tabela `public.event_assignment_notifications`: `event_id`, `user_id`, `org_id`, `source` (`responsible` | `commission`), `status` (`pending`/`sent`/`skipped`/`failed`), `error_message`, timestamps; índice único parcial por (`event_id`,`user_id`) para pendentes, evitando duplicidade. GRANTs: `service_role` total; `authenticated` apenas SELECT das próprias linhas; RLS habilitado.
- Triggers `AFTER INSERT` em `cronograma_evento_responsaveis` (usuário direto) e `cronograma_evento_comissoes` (expande membros ativos via `commission_responsibles`/membros da comissão) inserindo linhas pendentes, ignorando `auth.uid()` (autor) e eventos concluídos/cancelados/passados.

**Edge function**
- Nova função `event-assignment-push` (verify_jwt = false, protegida pelo mesmo padrão `X-Worker-Token`/`internal_worker_tokens` já usado em `event-reminders`): busca pendentes, filtra quem tem device ativo em `push_devices`, monta mensagem em `_shared/pushMessage.ts` (nova `buildAssignmentPushMessage`, mesmo ícone/branding), chama `send-push-notification` e grava resultado na tabela e em `push_send_log` (`template_name: 'event-assignment'`).
- Wrapper SQL `public.invoke_event_assignment_push(text)` + job `pg_cron` a cada minuto, no mesmo modelo já aprovado.

**Testes**
- Unitário da montagem da mensagem (título/corpo/caminho `/cronograma?event=<id>`).
- Unitário da regra de deduplicação/exclusão do autor e do filtro por device ativo.

Sem publicação em produção.
