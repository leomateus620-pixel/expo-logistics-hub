# Exporural 2026.4 — Fases 5 a 9 (rollout autenticado e validação)

A migration `20260811153000` já está aplicada e conferida byte-a-byte contra o arquivo do repositório. O baseline do segmento já é 111/95 e o resolver já exclui B35, B36 e D6-01/02/03. Falta apenas o rollout autenticado e as validações remotas.

Estado confirmado agora no banco:
- `map_projects.reference_revision = 2026.3`, projeto ativo `0538d132-…`, org `985888b8-…`
- os cinco alvos ainda estão ativos e sem lote comercial vinculado
- `map_reference_migration_snapshots` está vazia (nenhum rollout registrado)
- sessão autenticada disponível no sandbox (`AUTH=injected`)

## Fase 5 — Rollout autenticado

Executar pelo fluxo administrativo existente, com a sessão real restaurada no navegador (sem `service_role`, sem montar JSON manualmente):

1. Abrir `/mapa-comercial` autenticado.
2. Abrir o painel de Gestão.
3. Acionar “Persistir Exporural” e confirmar “Validar e versionar”.
4. O app chama `applyExporuralReference`, que envia o payload canônico de `OFFICIAL_REFERENCE_DATA` (111 entidades Exporural + 95 lotes) para `apply_exporural_reference_2026`.
5. Arquivar o JSON retornado.

Se a sessão injetada não tiver `map.admin`, a operação para com `MAP_PERMISSION_DENIED` e eu reporto NO-GO indicando qual conta precisa entrar — nada é contornado.

Critérios de aceite do retorno: `changed = true`, `referenceRevision = 2026.4`, `geometryRevision = 2026.4-exporural.1`, `lotsValidated = 95`, `commercialLotsPreserved = 95`, `retiredSeedEntitiesArchived = 5`, `retiredIdentifiers` com os cinco IDs, `snapshotId` e `projectId` válidos, `geometriesVersioned` coerente com as 111 entidades.

## Fase 6 — Validação remota do banco

- `validate_commercial_map_segments(<project_id>)` para `exporural`: 111/95 esperados e efetivos, `entityCount = 111`, `lotCount = 95`, `currentGeometryCount = 111`, `complete = true`, `invalidSegmentReferences = 0`, `exclusiveAssignmentConflicts = 0`.
- `get_commission_map_segment_inventory` do segmento `exporural`: 111/95 e `lineage_delta = 0`.
- Os cinco removidos: `is_archived = true`, `segment_id` nulo, `archivedByReferenceRevision = 2026.4`, `archiveReason = OFFICIAL_EXPORURAL_2026_4_REFERENCE_REMOVAL`.
- Q-S-17 e Q-R-52/53/54/55: entidades não arquivadas, lotes com `archived_at` nulo — exatamente cinco linhas.
- 95 entidades com lote ativo; 111 entidades com `metadata.geometryRevision = 2026.4-exporural.1`.
- Snapshot com status `APPLIED` e log `EXPORURAL_REFERENCE_2026_APPLIED`.
- Conferência de que preços, reservas, negociações, vendas, contratos e histórico não sofreram alteração além da trilha esperada.

## Fase 7 — RLS por perfil

Smoke com sessões reais, nunca com `service_role` e sem relaxar policies:
- `map.admin`: executa o rollout e vê o parque completo;
- usuário com `exporural_access`: só o segmento autorizado, inventário 111/95, sem escalar por query string, slug, UUID ou cache;
- usuário sem a capability: portal negado e consulta direta negada;
- ex-membro: acesso integralmente negado.

Se os perfis 2 a 4 não existirem hoje no banco, eu não crio contas por conta própria: registro essas linhas da matriz como BLOCKED e peço autorização para provisionar contas de QA descartáveis.

## Fase 8 — Validação funcional e visual

Após recarregar com dados persistidos, em `/mapa-comercial`, `/mapa-comercial?area=exporural` e `/comissoes/exporural/mapa-comercial`, em 1440×900 e 390×844, vista superior e isométrica: A8 e A9 conectados, Rua 15 de Novembro contínua, Emanuel Brachmann partindo da Rua 15, extensão oeste/A7 correta, R-47 afunilado, R-56 a R-59 contínuos, os cinco overlays ausentes, Q-S-17 e Q-R-52/55 selecionáveis, sem geometria quebrada ou sobreposição.

## Fase 9 — Publicação

Só depois de todos os gates: usar “Publicar versão” com o motivo “Publicação da revisão cartográfica oficial Exporural 2026.4 após validação remota 111/95, RLS e QA funcional.”, sem burlar gates de calibração ou verificação, e reconfirmar a persistência recarregando com um usuário autorizado não administrador.

## Detalhes técnicos

- Nenhum arquivo do projeto será alterado nesta etapa: o trabalho é de execução e verificação.
- Nenhum `UPDATE`/`DELETE` manual para acertar contagens; nenhum mock; nenhum `db reset`.
- Rollback não será executado como teste.
- Qualquer erro listado no contrato (`EXPORURAL_REFERENCE_PAYLOAD_CONFLICT`, drift de inventário, ausência de `map.admin`, etc.) interrompe o processo e vira NO-GO documentado, com etapa, `project_id` e snapshot.
- Entrega final: relatório em português com as 15 seções exigidas.
