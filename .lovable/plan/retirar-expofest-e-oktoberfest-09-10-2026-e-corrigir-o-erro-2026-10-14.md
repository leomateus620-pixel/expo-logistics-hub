# Retirar EXPOFEST e OKTOBERFEST (09/10/2026) e corrigir o erro de permissão

## O que foi encontrado
- Os dois eventos estão salvos no banco com data 09/10/2026, situação "planejado". Foram criados por `leomateus620@gmail.com` na carga do ciclo 2026 (`2026-expofest-ijui` e `2026-oktoberfest-santa-rosa`).
- Também existem duas cópias sem data no ciclo 2027 ("aguardando definição"). Elas **não** serão removidas, a menos que você peça.
- Causa do erro: a exclusão faz duas verificações de permissão que não batem entre si.
  1. A primeira aceita administrador/gestor **ou** quem tem permissão de escrita na Agenda.
  2. A segunda, interna, exige **só** a permissão de escrita na Agenda.
  Por isso um administrador ou gestor sem essa permissão explícita passa pela primeira e é barrado pela segunda, e aparece "Você não tem permissão para esta operação".

## O que será feito
1. **Corrigir a regra de exclusão (banco):** nova migração que alinha a verificação interna à mesma regra da externa (administrador/gestor da organização ou permissão de escrita na Agenda). As outras verificações continuam iguais: visibilidade do evento, controle de versão, vínculo com o restaurante e bloqueio contra exclusões simultâneas. Nenhuma permissão nova é concedida a ninguém.
2. **Retirar os dois eventos de 2026** pelo próprio fluxo oficial de exclusão. Ele grava um registro de remoção por evento, o que impede que uma recarga dos dados os traga de volta. Auditoria atribuída à conta administradora.
3. **Conferir:** confirmar no banco que os dois sumiram e que os registros de remoção existem. Testar a exclusão como gestor dentro de uma transação desfeita, sem apagar eventos reais. Conferir a Linha do tempo de outubro na prévia.

## Detalhes técnicos
- `agenda_private.cronograma_begin_delete` chama `_cronograma_require_writer`, que exige somente `cronograma_eventos_write`. Já `cronograma_delete_event` aceita `get_user_org_role in ('admin','gestor')`. A ideia é criar `_cronograma_require_deleter(org)` com a regra da função externa e usá-la só no caminho de exclusão, sem tocar no lock (`pg_advisory_xact_lock`) nem em `source_visible`.
- A exclusão dos IDs `59892e9e-…` e `77c7f4a6-…` passa por `cronograma_delete_event` (tombstone por `source_key`), sem DELETE direto.
- Nada será publicado.
