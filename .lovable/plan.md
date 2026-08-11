# Implantação da revisão cartográfica Exporural 2026.4

## Estado verificado agora (evidências de leitura, antes de qualquer escrita)

- Código do workspace já está em 2026.4: `OFFICIAL_REFERENCE_REVISION = '2026.4'` (officialReference2026.ts) e `EXPORURAL_GEOMETRY_REVISION = '2026.4-exporural.1'` (exporuralReference2026.ts).
- A migration obrigatória existe no repositório: `supabase/migrations/20260811153000_apply_exporural_reference_2026_4_fidelity.sql`.
- Banco conectado (produção do projeto): existe **um único** projeto cartográfico ativo, `reference_revision = 2026.3`, `active_version = 1`, `is_published = false`.
- Segmentos existentes: `exporural` e `industria-comercio-servicos`.
- Inventário Exporural atual: **116 entidades ativas / 95 lotes comerciais**. Parque completo: 262 lotes ativos.
- B35, B36, D6-01, D6-02, D6-03 existem, estão ativos e **não possuem nenhum lote comercial vinculado** (0 linhas) — condição exigida para arquivamento.
- A função `apply_exporural_reference_2026` instalada ainda valida 116 e não 111, ou seja, a migration 20260811153000 **ainda não foi aplicada** no banco.
- `map_has_explicit_capability` aceita papel `admin`/`gestor` da organização ou capability `map.admin`/`full_access` — há usuários elegíveis.

Ou seja: preflight limpo, sem bloqueios. Nada foi alterado até aqui.

## Execução proposta

### 1. Aplicar a migration (exige sua aprovação)
Submeter o conteúdo **byte a byte** de `20260811153000_apply_exporural_reference_2026_4_fidelity.sql` pelo fluxo nativo de migrations. Sem fragmentos, sem edição, sem reconstrução. Depois confirmar que `apply_exporural_reference_2026` passou a exigir 111/95 e que o resolver de slug já exclui os cinco identificadores.

Entre esta etapa e a etapa 2 o sistema fica intencionalmente fail-closed (baseline 111 contra banco 116) — janela curta e esperada.

### 2. Rollout autenticado da referência
Executar o fluxo administrativo real em `/mapa-comercial` → Gestão → “Persistir Exporural” → “Validar e versionar”, com sessão autenticada real de administrador (sem service_role, sem JSON montado à mão). O payload sai de `OFFICIAL_REFERENCE_DATA`. Arquivar o JSON retornado (changed, referenceRevision 2026.4, geometryRevision 2026.4-exporural.1, lotsValidated 95, commercialLotsPreserved 95, retiredSeedEntitiesArchived 5, snapshotId, projectId, geometriesVersioned).

Se sua sessão de preview estiver ativa, conduzo esse clique por navegador automatizado com a sessão real injetada; se não estiver, devolvo a instrução exata e aguardo você executar o clique.

### 3. Validação remota
- `validate_commercial_map_segments(project_id)` — exigir 111/111/95/95, `currentGeometryCount = 111`, `complete = true`, zero referências inválidas e zero conflitos de exclusividade.
- `get_commission_map_segment_inventory` do segmento `exporural` — 111/95 e `lineage_delta = 0`.
- Cinco removidos: `is_archived = true`, `segment_id null`, `archivedByReferenceRevision = 2026.4`, `archiveReason = OFFICIAL_EXPORURAL_2026_4_REFERENCE_REMOVAL`.
- Cinco preservados (Q-S-17, Q-R-52..55): exatamente cinco linhas, entidade não arquivada, `archived_at` nulo.
- 111 entidades com `metadata.geometryRevision = 2026.4-exporural.1`, snapshot `APPLIED`, log `EXPORURAL_REFERENCE_2026_APPLIED`, e conferência de que preços, reservas, negociações, vendas e contratos não mudaram (contagens antes/depois).

### 4. RLS por perfil
Smoke com sessões reais: administrador com map.admin, usuário com `exporural_access` (111/95 apenas no segmento, sem escalar por query string/slug/UUID), usuário sem a capability (negado em entidades, geometrias, lotes, preços, reservas, vendas e logs) e ex-membro (negado integralmente). Nenhuma policy é afrouxada para o teste passar.

### 5. QA funcional e visual
Após recarregar com dados persistidos: `/mapa-comercial`, `/mapa-comercial?area=exporural` e `/comissoes/exporural/mapa-comercial`, em 1440×900 e 390×844, vista superior e isométrica, filtro, busca, seleção e câmera. Conferir A8/A9 conectados, Rua 15 de Novembro contínua, Emanuel Brachmann partindo da Rua 15, extensão oeste/A7, R-47 afunilado, R-56–R-59 contínuos, ausência dos cinco overlays, presença e seleção de Q-S-17 e Q-R-52..55, e mesma geometria nas três rotas.

### 6. Publicação
Só com todos os gates verdes: usar o fluxo “Publicar versão” com motivo auditável (“Publicação da revisão cartográfica oficial Exporural 2026.4 após validação remota 111/95, RLS e QA funcional.”) e reconfirmar a persistência com usuário não administrador autorizado.

### 7. Relatório final
Relatório em português com status GO/NO-GO, project ref mascarado, project_id e org_id, migration aplicada, estado antes/depois, JSON do RPC, snapshotId, saída do validate, inventário 111/95, tombstones, lotes preservados, matriz de RLS, rotas e viewports, evidências visuais, publicação e pendências.

## Restrições respeitadas
Sem `db reset`, sem outro projeto ou banco temporário, sem mocks, sem UPDATE/DELETE manual de acerto, sem tocar em rotas, guards, filtros ou autenticação, sem service_role como prova de RLS, e sem rollback como teste. Qualquer erro listado no seu contrato interrompe a execução com NO-GO documentado, sem reparo manual.
