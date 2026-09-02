# Acesso total à Agenda Fenasoja para a Assessoria de Imprensa

## Situação atual (verificada no banco)

- **Deise Anelise Froelich** (deisefroelich1@gmail.com) e **Francine Maria Boijink** (francineboijink@hotmail.com) estão ativas na Assessoria de Imprensa com perfil **leitura**.
- Ambas possuem apenas as permissões `cronograma_eventos_access` (abrir o menu) e `cronograma_scoped_access` (ver **somente** os eventos vinculados a elas).
- Elas não têm `cronograma_eventos_write`, então o banco recusa criar, editar, vincular comissões/responsáveis e concluir eventos.
- A exclusão de eventos e subeventos hoje é restrita a admin/gestor, tanto no banco quanto na tela.

## O que será feito

1. **Ver toda a Agenda**: remover a marcação de visão restrita das duas, passando a enxergar todos os eventos do cronograma (exceto os de planejamento restrito, que continuam reservados).
2. **Criar e editar**: conceder a permissão de escrita da Agenda, liberando cadastro de eventos, edição, alteração de datas/horários, seleção de comissões/assessorias e de pessoas responsáveis, anexos, subeventos e conclusão — igual a um administrador, porém apenas dentro da Agenda Fenasoja.
3. **Excluir**: liberar exclusão de eventos e subeventos para quem tem a permissão de escrita da Agenda (hoje só admin/gestor), para que o acesso delas seja realmente equivalente ao de admin nesse menu.
4. **Nenhum outro menu muda**: elas continuam com perfil de leitura na organização; Logística, Mapa Comercial, Financeiro, Frota, Restaurante/Arena e área administrativa seguem inacessíveis.
5. A liberação é por permissão nominal das duas contas — sem regra por e-mail no código e sem alterar o restante da Assessoria de Imprensa.

## Detalhes técnicos

- Dados: `DELETE` de `cronograma_scoped_access` e `INSERT` de `cronograma_eventos_write` em `user_capabilities` para os dois `user_id` (`be5eee02-…`, `d53cbc3e-…`) na org atual.
- Migração: ajustar a política `cronograma_eventos_delete` (e as políticas de exclusão equivalentes de subeventos/relacionamentos) para aceitar `has_capability(auth.uid(), org_id, 'cronograma_eventos_write')`, mantendo o bloqueio de `planning_restricted`.
- `cronograma_eventos_insert/update` já aceitam a capability — nada a mudar ali; `_cronograma_require_writer` também já cobre as RPCs `cronograma_save_event` / `cronograma_save_subevent`.
- Frontend `src/hooks/useCronogramaEventos.ts`: trocar as travas que ainda usam `isWritableRole(myRole)` (linhas ~992, ~1252 e a mutação `deleteEvent`) por `canWriteCronograma`, e derivar `canDeleteSubevents` da mesma regra, para a UI espelhar exatamente o backend.
- Sem alteração em `useModuleAccess`/`CapabilityGuard`: o acesso ao menu já vem de `cronograma_eventos_access`.

## Validação

Login real com as duas contas: Agenda completa visível; criar evento novo; editar evento de terceiro; adicionar comissão e responsáveis; criar/editar/excluir subevento; excluir evento; e confirmar que nenhum outro módulo aparece ou abre.
