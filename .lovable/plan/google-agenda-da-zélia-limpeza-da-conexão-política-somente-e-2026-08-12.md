# Google Agenda da Zélia: limpeza da conexão + política "somente eventos dela"

## Estado atual (confirmado no banco)

- A conexão é da conta **zelia.savoldi@hotmail.com** (user `74a71a9f…`, org `985888b8…`). Status `connected`, backfill **165/165** — ou seja, **todos os 165 eventos da organização** foram parar na agenda dela, porque a regra atual dá a agenda inteira a quem tem acesso total (ela é gestora).
- Existe uma segunda conta `zelia@fenasoja.com.br` (perfil leitura, sem conexão Google) — não será tocada.
- Regra atual de elegibilidade (`google_user_eligible_for_event`): acesso total → todos os eventos; senão → eventos da comissão do membro.
- **Não há trigger em `cronograma_evento_responsaveis`**: hoje, adicionar/remover a Zélia como responsável não dispara sincronização.
- Já existe `reconcile_google_sync_event(event_id, org_id)` que enfileira `upsert` para quem é elegível e `delete` para quem deixou de ser — será reutilizada.
- Zélia é responsável (vínculo de membro) em **23 eventos**.

## Decisões do usuário

- Política aplicada **somente à Zélia** (piloto). Demais usuários continuam como hoje.
- "Relacionado a ela" = eventos em que ela é **responsável** (vínculo de membro) **+ eventos criados por ela**.

## Implementação

### 1. Limpeza da conexão da Zélia
Ordem importante: primeiro remover os eventos do Google dela, depois apagar os dados locais.

1. Enfileirar operação `delete` para cada evento mapeado dela (`google_calendar_event_map`, 165 eventos) via RPC `queue_google_sync_for_user`.
2. Executar o worker `google-sync-worker` (lotes de 25, ~7 rodadas) até a fila drenar — isso apaga os eventos do calendário "FENASOJA" no Google Agenda dela.
3. Apagar as linhas locais dela: `google_sync_outbox`, `google_calendar_event_map`, `google_calendar_oauth_attempts` e `google_calendar_connections` (somente user `74a71a9f…` + org `985888b8…`).
4. Resultado: o widget dela volta ao estado "não conectado", pronto para o teste limpo.

### 2. Política por usuário (migration)
- Nova tabela `public.google_calendar_sync_preferences` (`user_id`, `org_id`, `sync_scope` = `all` | `mine`), com GRANT apenas para `service_role` e RLS habilitado — configuração server-side, invisível ao app.
- Seed: Zélia (hotmail) → `mine`.
- Nova coluna `sync_scope` (default `all`) em `google_calendar_connections`, copiada da preferência no momento da conexão — assim o reconectar dela já nasce com a política certa, sem passo manual.
- Reescrita de `google_user_eligible_for_event`: quando a conexão do usuário tem `sync_scope = 'mine'`, ele só é elegível se **criou o evento** (`created_by_user_id`) ou é **responsável membro** em `cronograma_evento_responsaveis`. Escopo `all` mantém o comportamento atual (acesso total ou comissão).
- Novo trigger em `cronograma_evento_responsaveis` (insert/update/delete) chamando `reconcile_google_sync_event`: adicionar a Zélia como responsável passa a enviar o evento para a agenda dela; remover, apaga de lá automaticamente.

### 3. Edge function `google-calendar-oauth-callback`
- `prepareInitialBackfill`: ler o `sync_scope` da conexão; se `mine`, os candidatos ao backfill são apenas eventos criados pela usuária + eventos em que ela é responsável (com data definida). Escopo `all` inalterado.
- Redeploy da função.

### 4. Validação
- SQL: conferir que o backfill dela totaliza apenas os eventos dela (~23 como responsável + criados por ela), não 165.
- Teste guiado: Zélia reconecta → agenda recebe só os eventos dela.
- Teste de ida e volta: adicioná-la como responsável em um evento novo → aparece na agenda; remover → some.

## Detalhes técnicos

- Tabelas: `google_calendar_connections` (nova coluna `sync_scope`), nova `google_calendar_sync_preferences`, trigger novo em `cronograma_evento_responsaveis`.
- Funções: `google_user_eligible_for_event` (reescrita), reuso de `reconcile_google_sync_event` e `queue_google_sync_for_user`.
- Edge functions: `google-calendar-oauth-callback` (backfill com escopo); worker `google-sync-worker` executado via service role apenas na etapa de limpeza.
- Nada muda para os demais usuários conectados: escopo default `all` preserva o comportamento atual.
- Nenhuma alteração de UI neste ciclo.
