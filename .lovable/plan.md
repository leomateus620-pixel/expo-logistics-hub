# Corrigir eventos excluídos que reaparecem na Linha do Tempo

## Diagnóstico confirmado

A exclusão atual remove corretamente a linha do banco, mas eventos originados do catálogo oficial embutido no aplicativo são recriados logo depois:

1. Após excluir, a consulta da Agenda é atualizada.
2. A tela mistura novamente todos os eventos do catálogo local com os registros retornados pelo banco.
3. O evento oficial apagado, agora ausente no banco, volta imediatamente pela cópia local.
4. A rotina de “dados oficiais faltantes” interpreta essa ausência como falha de carga e grava o evento novamente no banco com um novo identificador.

Por isso o problema é determinístico para eventos oficiais. Eventos criados manualmente não passam por essa rotina de recriação.

## Implementação

1. **Registrar exclusões oficiais de forma permanente**
   - Criar um registro de exclusões do cronograma por organização e `source_key`, com usuário e data da exclusão.
   - Proteger esse registro com as mesmas regras organizacionais do cronograma e permissões exclusivas de admin/gestor para gravar.

2. **Tornar a exclusão atômica no backend**
   - Criar uma operação transacional para validar organização e permissão, registrar a exclusão oficial e apagar o evento em uma única execução.
   - Eventos manuais continuam sendo apagados normalmente; eventos oficiais recebem o marcador permanente antes da remoção.
   - Se o backend estiver indisponível, não apresentar uma exclusão apenas local como concluída.

3. **Impedir a ressurreição na interface**
   - Carregar os marcadores de exclusão junto com o cronograma.
   - Excluir essas chaves tanto da mescla com o catálogo local quanto da rotina automática que cadastra eventos oficiais faltantes.
   - Atualizar imediatamente o cache e o estado da Linha do Tempo após a confirmação da exclusão, antes do refetch.

4. **Preservar os demais fluxos**
   - Manter filtros, dashboard, concluídos, pendências e calendário derivados da mesma lista já corrigida.
   - Manter a visão restrita por comissão/responsável e as permissões atuais de edição/exclusão.
   - Não alterar a exclusão de subeventos.

## Validação

- Excluir um evento oficial e confirmar que ele some imediatamente da Linha do Tempo.
- Recarregar a página, trocar de mês e abrir outra sessão/aba; o evento não pode reaparecer.
- Confirmar no banco que o evento foi removido e sua chave oficial ficou bloqueada contra recriação automática.
- Excluir um evento criado manualmente e confirmar o mesmo comportamento persistente.
- Confirmar que eventos oficiais nunca excluídos continuam sendo carregados e semeados normalmente.
- Validar que operador/leitura não conseguem excluir e que admin/gestor continuam autorizados.

## Detalhes técnicos

- Principal ajuste no hook `useCronogramaEventos`: mescla, auto-seed, mutação de exclusão e cache.
- Nova operação de banco para exclusão transacional e novo registro de tombstones por `(org_id, source_key)`.
- Cobertura automatizada para `mergeOfficialSeedWithDb`, exclusão oficial, exclusão manual e prevenção de reseed após reload.
