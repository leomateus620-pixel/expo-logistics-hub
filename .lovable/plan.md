## Objetivo

1. Garantir que eventos criados/editados no sistema apareçam **imediatamente** no Google Agenda dos usuários conectados (não depender do cron de 1 min).
2. Adicionar botão **Excluir evento** na UI de cada card de evento em `/cronograma-eventos`, com confirmação — a exclusão remove o evento do banco e propaga o `delete` para o Google Agenda de **todos os usuários conectados** (hoje: Leonardo, Soltis, Djeison — Zélia ainda em `waiting_authorization`).

## Diagnóstico verificado

- 3 usuários com Google Agenda conectado (`connected`/`synchronizing`); 1 em `waiting_authorization` (Zélia). Os 72 itens antigos em `queued` são todos da conexão inacabada de Zélia — não bloqueiam ninguém.
- O trigger `tg_evento_google_sync` **já** enfileira `operation='delete'` no `google_sync_outbox` no `AFTER DELETE` de `cronograma_eventos` para cada usuário elegível (via `google_sync_affected_users`). O worker já implementa o ramo `delete` no `googleCalendarClient`.
- Portanto a exclusão em cascata para o Google Agenda já existe no backend — falta apenas: (a) a UI de excluir o evento (hoje só existe delete de subevento) e a mutation correspondente; (b) disparar o worker imediatamente após create/update/delete, em vez de esperar o `pg_cron` (que roda a cada 1 min e pode atrasar).
- 480 items `completed` confirmam que o pipeline funciona; o "imediatismo" é o gap.

## Mudanças

### Backend — disparo imediato do worker
- Nenhuma nova migration de schema. Ajustar apenas o hook do frontend para chamar a Edge Function `google-sync-worker` (via `supabase.functions.invoke`, sem token — a função aceita chamadas com service role interno; se falhar por auth, cair silenciosamente pois o cron pega em ≤1 min). Chamada acionada logo após: `saveEventRecord` (create/update), `deleteEvent` (novo) e `deleteSubevent`. Fire-and-forget, sem bloquear UI.

### Frontend — mutation de exclusão de evento
- `src/hooks/useCronogramaEventos.ts`: adicionar `deleteEvent` (React Query mutation) que:
  1. Valida papel (`admin`/`gestor`).
  2. Executa `DELETE FROM cronograma_eventos WHERE id = ?` — o trigger enfileira `delete` no outbox para cada usuário conectado.
  3. Invalida `['cronograma-eventos']` e chama o worker imediatamente.
- Exportar `deleteEvent` no retorno do hook.

### Frontend — UI de exclusão no card do evento
- Localizar o(s) componente(s) que renderizam cards de eventos em `/cronograma-eventos` (workspace/timeline) e adicionar um botão `Trash2` "Excluir evento" quando `canManage`.
- Envolver em `AlertDialog` com texto claro: *"O evento será removido do sistema e do Google Agenda de todos os X usuários conectados."*
- Ao confirmar, chamar `deleteEvent.mutateAsync(eventId)` e mostrar `toast.success`/`error`.

### Observabilidade
- No `catch` da mutation de delete, logar `err.message` no console e mostrar toast com a mensagem real (padrão do projeto para `FunctionsHttpError`).

## Não faz parte deste plano

- Não alterar schema, RLS, triggers ou o worker (já estão corretos).
- Não mexer no fluxo OAuth nem no backfill inicial.
- Não limpar os 72 `queued` órfãos da Zélia — serão processados quando ela concluir a conexão.

## Validação

1. Criar um evento novo → confirmar que aparece nas 3 agendas Google em segundos (não em ~1 min).
2. Excluir esse evento pela UI → confirmar sumiço no sistema e nas 3 agendas.
3. Conferir `google_sync_outbox`: 3 linhas `operation='delete' status='completed'` para o evento excluído.
