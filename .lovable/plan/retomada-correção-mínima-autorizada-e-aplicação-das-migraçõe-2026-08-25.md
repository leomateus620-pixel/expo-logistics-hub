# Retomada — Correção mínima autorizada e aplicação das migrações restantes dos pavilhões

## Contexto e estado atual (verificado)

- **Aplicada:** `20260824120000` (B2/B3/B6) — histórico em 72 versões; B6=214, B3=257, B2=186 módulos ativos.
- **Descartada (ordem do usuário):** `20260823120000` — nunca executada.
- **Falhou com rollback integral:** `20260824210000` — erro exato:
  `ERROR: 42702: column reference "pavilion_identifier" is ambiguous` (linha 751, `jsonb_build_object` de `_p135_staged_modules`).
- **Banco íntegro pós-rollback:** B1=0, B8=0, B6=214, segmento `industria-comercio-servicos` ainda em 797 entidades, hash/comercial inalterados.

## Diagnóstico confirmado do defeito

Na CTE `projected` (linhas 694–703), `SELECT footprint.*, cell.*` com `JOIN ... USING (pavilion_identifier)` produz **duas** colunas de saída chamadas `pavilion_identifier` (em Postgres, `a.*, b.*` duplica a coluna do USING; só `SELECT *` a deduplica). A referência sem qualificação no SELECT final é, portanto, ambígua.

Verificação exaustiva das colunas: `pavilion_identifier` é a **única** colisão entre `_p135_footprints` (project_id, org_id, pavilion_id, layer_id, industry_segment_id, elevation, calibration_version, spec.*, min/max, centers, clear/model width/depth) e `_p135_cells` (17 colunas: module_number, public_identifier, pavilion_module_key, lot_number, run_id, group/cluster, orientações, center/width/depth, rings, render_parts). Todas as demais referências do SELECT final existem em apenas um dos lados.

As migrações `20260825020000` e `20260825030000` já usam o padrão seguro (`frame.*` + lista explícita `cell.<coluna>`) — o defeito não se repete nelas.

## Etapa 1 — Correção mínima autorizada (única edição de arquivo)

Em `supabase/migrations/20260824210000_rebuild_pavilions_1_5_and_correct_pavilion_3.sql`, linha 697: substituir `cell.*` pela lista explícita das 16 colunas de `cell` **sem** `pavilion_identifier` (que passa a vir exclusivamente de `footprint`, com valor idêntico por ser a chave do join):

```sql
  SELECT
    footprint.*,
    cell.module_number,
    cell.public_identifier,
    cell.pavilion_module_key,
    cell.lot_number,
    cell.run_id,
    cell.group_key,
    cell.cluster_key,
    cell.sequence_orientation,
    cell.module_orientation,
    cell.center_x,
    cell.center_z,
    cell.width,
    cell.depth,
    cell.normalized_ring,
    cell.normalized_label_anchor,
    cell.render_parts,
    CASE WHEN footprint.segment_slug IS NULL ... (restante inalterado)
```

Semântica preservada: nenhuma coluna perdida, nenhum valor alterado, nenhuma outra linha do arquivo tocada. É exatamente o padrão que as migrações irmãs (020000/030000) já usam.

## Etapa 2 — Aplicação sequencial pelo runner nativo (conteúdo byte-por-byte do arquivo corrigido)

| # | Migração | Alvo |
|---|----------|------|
| 2 | `20260824210000` (corrigida) | B1 (189) + B8 (81) + correção B6 (214, rev `2026.4-p3.3`) |
| 3 | `20260825010000` | Correção de projeção de eixo do Pavilhão 1 |
| 4 | `20260825020000` | B8 — Pav. 8 (81) + B10 — Pav. 13 (171) |
| 5 | `20260825030000` | B4 — Pav. 5 (114) + B6 — Pav. 7 (214) + B2 — Pav. 14 (186) |

Regras mantidas: uma versão por vez; parar no primeiro `RAISE EXCEPTION`/erro SQL sem remendo; rollback transacional nativo preservado; se **novo** defeito de arquivo surgir, parar e reportar (fail-closed). Gate estático antes de cada aplicação: confirmar ausência do padrão `footprint.*, cell.*` no arquivo da vez (010000 será verificada nesse gate). Observação: o runner registra a versão com o timestamp da aplicação (ex.: `20260825101138`), comportamento nativo já observado.

## Etapa 3 — Validação pós-migração

Inventário final esperado por projeto ativo: B1=189, B6=214, B8=81, B10=171, B4=114, B3=257, B5=103, B2=186 (**total 1.315**), numeração contínua sem lacunas, sem duplicidade de `public_identifier`/`pavilionModuleKey`, geometrias `ST_IsValid`, exatamente 1 `is_current` por módulo, 1:1:1 entidade↔geometria↔lote, segmento `industria-comercio-servicos` com 1.203 entidades e `complete=true`, lotes novos neutros (`BLOCKED`/`UNVALIDATED`/`NOT_FOR_SALE`, áreas nulas), hashes comerciais pré/pós inalterados nas tabelas fora de escopo.

## Etapa 4 — Revisão completa do Pavilhão 3 (B6)

- 214 entidades `INTERNAL_STAND` ativas, numeração M001–M214 contínua, zero lacunas/duplicatas;
- 214 geometrias correntes válidas, cobertas pelo footprint do pai, sem interseções positivas;
- 214 lotes vinculados 1:1, neutros e com metadata oficial (revisão `2026.4-p3.3` após a migração 2/5);
- conferência dos módulos especiais documentados e das revisões aplicadas;
- smoke test autenticado no preview: mapa completo + interior do B6, contagens e seleção de módulo.

## Etapa 5 — Idempotência e relatório final

Listagem do runner sem pendências; recontagens idênticas; relatório final em PT-BR com status de cada versão, horários, contagens por pavilhão, validações e evidências da revisão do Pavilhão 3.

## Detalhes técnicos

- Única alteração de código em todo o trabalho: a substituição de uma linha (`cell.*`) por 16 linhas explícitas na Etapa 1.
- Nenhuma escrita manual em `supabase_migrations.schema_migrations`; nenhum `DROP`/`TRUNCATE` fora do escopo das próprias migrações; nenhuma outra migração pendente será aplicada junta.
- Sem credenciais, PII ou segredos em qualquer saída.
