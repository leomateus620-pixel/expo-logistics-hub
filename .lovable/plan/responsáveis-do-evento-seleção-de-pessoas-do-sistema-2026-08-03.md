# Responsáveis do evento: seleção de pessoas do sistema

Hoje o campo "Responsáveis do evento" no cadastro do cronograma abre um buscador vazio ("Nenhum resultado"), porque a lista de opções está fixada como vazia — só é possível digitar um nome livre. Vamos alimentar essa lista com as pessoas reais do sistema, mantendo a digitação livre para quem não tem usuário.

## O que muda

- O seletor passa a listar as pessoas cadastradas na organização (membros com usuário no sistema), com busca por nome, cargo/papel e comissão, ignorando acentos.
- As opções ficam agrupadas:
  - "Membros do sistema" — pessoas com usuário (vínculo real por `user_id`, usado para notificação/Google Agenda).
  - "Responsáveis institucionais" — presidentes/responsáveis das comissões e assessorias oficiais que ainda não têm usuário.
- Continua possível adicionar um nome livre quando a pessoa não existe no sistema (opção "Adicionar '<nome digitado>'"), salvo como responsável externo.
- Um dos responsáveis pode ser marcado como Principal (comportamento atual mantido).
- Duplicidade evitada: pessoa já selecionada não reaparece na lista, e nome livre igual a um membro existente é reconciliado com o membro.

## Detalhes técnicos

- `src/components/cronograma-eventos/EventForm.tsx`
  - Usar `useOrgMembers()` (já importado no arquivo) para montar `responsibleOptions`: `{ id: user_id, label: nome_exibicao, hint: cargo ?? commission_nome, group: 'Membros do sistema' }`.
  - Complementar com responsáveis vindos de `useOrgCommissions()` (`unit.responsibles`) que não tenham `userId` correspondente já listado: `{ id: 'custom:<nome normalizado>', label: displayName, hint: nome da unidade, group: 'Responsáveis institucionais' }`.
  - Passar essa lista em `options` do `RelationalMultiSelect` de responsáveis (hoje `options={[]}`) e manter `allowCustom`.
  - `selectionsToResponsibleLinks` já trata IDs `custom:`/`external:` como responsável externo e demais como `member` (`userId`), então a persistência via `cronograma_save_event` não muda.
  - Deduplicar por nome normalizado (`normalizeSearchTerm`) para não repetir a mesma pessoa entre os dois grupos.
- Sem migração de banco e sem alteração nas RPCs.

## Validação

- Abrir "Novo evento": buscar por parte de um nome de usuário e confirmar que aparece na lista agrupada.
- Adicionar um nome que não existe e confirmar que é salvo como responsável externo.
- Salvar e reabrir o evento conferindo que os vínculos persistem, com o Principal correto.
