# Restringir a visão da Bruna apenas aos eventos dela

## Diagnóstico confirmado

O banco já está correto: com as regras de acesso atuais, a conta da Bruna enxerga **2 eventos** (os vinculados a ela e à comissão Acolhimento e Bem Comum) de um total de 218.

O problema está na tela. O módulo "Agenda FENASOJA" mantém um **catálogo oficial de eventos embutido no próprio código do aplicativo** e o mistura com o que veio do banco antes de exibir. Como esse catálogo é local, ele aparece para qualquer pessoa logada — inclusive para usuários com visão restrita — dando a impressão de que a restrição não funciona. O mesmo catálogo também é usado como estado inicial da tela, então ele aparece já no primeiro carregamento.

## O que será feito

1. Para contas com visão restrita (como a da Bruna), a tela passa a exibir **exclusivamente** os eventos retornados pelo banco, sem nenhuma mescla com o catálogo local.
2. O estado inicial da tela dessas contas começa vazio (com indicador de carregamento) em vez de pré-preenchido com o catálogo.
3. A rotina automática que recria eventos oficiais faltantes fica desativada para essas contas — elas não devem semear nem gravar eventos que não são delas.
4. Verificações derivadas da mesma lista (resumo da semana, dashboard, timeline, concluídos, pendências e calendário) passam a refletir a lista já filtrada, sem alterações adicionais de lógica.
5. Nada muda para admin, gestor e operador: continuam vendo o cronograma completo com o comportamento atual.

## Validação

- Entrar como a Bruna e conferir que timeline, dashboard, concluídos, pendências e calendário mostram apenas os eventos vinculados a ela/à comissão.
- Entrar com um usuário admin e confirmar que os 218 eventos continuam visíveis e que nada foi perdido.

## Detalhes técnicos

- Arquivo principal: `src/hooks/useCronogramaEventos.ts`.
- O sinal de visão restrita é a capability `cronograma_scoped_access`, já lida via `useCapabilities()` no hook.
- Alterações pontuais:
  - `sessionEvents` inicia como `[]` quando `capSet.has('cronograma_scoped_access')`.
  - No efeito que chama `mergeOfficialSeedWithDb(officialSeedEvents, dbEvents)`, usar `[]` no lugar de `officialSeedEvents` para contas restritas.
  - Bloquear `seedMissingOfficialData` quando a conta é restrita (além da checagem de papel já existente).
- Não haverá migração de banco: `cronograma_eventos_select`, `has_scoped_cronograma_access` e `cronograma_scoped_event_visible` já estão corretos e a view `cronograma_eventos_full` usa `security_invoker=on`.
