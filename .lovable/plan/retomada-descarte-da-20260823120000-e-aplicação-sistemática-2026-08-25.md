# Retomada — Descarte da 20260823120000 e aplicação sistemática das 5 migrações restantes + revisão completa do Pavilhão 3

## Decisão registrada

- **`20260823120000_rebuild_pavilion_3_commercial_modules` — DESCARTADA.** Falhou com rollback integral (bug `42702: project_id ambíguo` no bloco de validação, linhas 1172–1178). O descarte é seguro: seu conteúdo (B6 = 214 módulos) **já existe no banco** — confirmado agora por contagem real (B2=186, B3=257, B6=214) — e a `20260824120000` já incorpora a correção do Pavilhão 3 (extensões 76–83 e 140–147), tornando a descartada redundante.

## Verificação estática pré-execução (já concluída nesta sessão)

| Item | Resultado |
|---|---|
| Histórico remoto | 71 versões; mais recente `20260824174017`; as 5 restantes ausentes |
| `20260824120000` vs. `173902` (já aplicada) | **Byte-idênticas** (única diferença: newline final). O SQL da `120000` já foi executado com sucesso no remoto — risco de sintaxe eliminado; idempotente por contrato |
| Padrão do bug (`project_id` sem qualificação) nas 4 migrações nunca executadas | **Ausente** — os blocos de validação de `20260824210000`, `20260825010000`, `20260825020000` e `20260825030000` usam apenas referências qualificadas (`entity.`, `staged.`, `geometry.`, `lot.`) |
| Estado atual dos dados | B2=186, B3=257, B6=214; B1, B4, B5, B8, B10 = 0 (658 módulos a criar) |

## Execução

### Etapa 1 — Snapshot pré-migração (somente leitura)
Hashes determinísticos (md5 de agregado ordenado) e contagens das 11 relações: `map_entities`, `map_entity_geometries` (correntes/históricas), `commercial_lots`, `lot_prices`, `lot_reservations`, `lot_negotiations`, `lot_sales`, `lot_contracts`, `lot_contract_versions`, `lot_status_history`, `map_lot_lineage`.

### Etapa 2 — Testes de contrato
`bunx vitest run` nos testes de contrato das migrações de pavilhões antes de qualquer escrita remota.

### Etapa 3 — Aplicação, uma versão por vez, pelo runner nativo, byte-por-byte

| # | Versão | Conteúdo |
|---|---|---|
| 1 | `20260824120000_rebuild_pavilions_12_14_and_correct_pavilion_3` | B3 (257), B2 (186) + correção B6 — reexecução idempotente que grava a versão no histórico |
| 2 | `20260824210000_rebuild_pavilions_1_5_and_correct_pavilion_3` | cria B1 (189) e B4 (114) + correção B6 |
| 3 | `20260825010000_correct_pavilion_1_axis_projection` | correção de projeção do B1 |
| 4 | `20260825020000_rebuild_pavilions_8_and_13_official_layouts` | cria B8 (81) e B10 (171), sem segmento |
| 5 | `20260825030000_rebuild_pavilions_5_7_and_14_official_layouts` | layouts oficiais B4/B5 (103) e B2 |

Regras: parar no primeiro `RAISE EXCEPTION` ou erro SQL; rollback transacional nativo preservado; nenhum arquivo criado/alterado; nenhum remendo SQL automático. **Contingência:** se alguma versão falhar por defeito no próprio arquivo, paro, reporto a linha/erro exatos e só corrijo o arquivo mediante sua autorização explícita.

### Etapa 4 — Validação pós-migração (consultas auditáveis)
Por pavilhão: entidades/lotes/geometrias correntes vs. esperado (B1=189, B2=186, B3=257, B4=114, B5=103, B6=214, B8=81, B10=171; **total 1.315**); numeração contínua sem lacunas (`generate_series`); zero duplicações de `public_identifier`/`pavilionModuleKey`; `ST_IsValid`, cobertura pelo footprint do pai, sem interseções, exatamente 1 `is_current` por módulo; segmento `industria-comercio-servicos` com 1.203 entidades / 1.166 lotes / `complete=true`; B8 e B10 sem segmento; Exporural inalterada; hashes comerciais pré/pós sem alterações indevidas; lotes novos neutros (`BLOCKED`, `UNVALIDATED`, `NOT_FOR_SALE`, áreas/valores nulos).

### Etapa 5 — Revisão completa do Pavilhão 3 (B6) — foco pedido
Verificação de que **todos os 214 lotes estão corretamente no banco**:
1. Exatamente 214 entidades `INTERNAL_STAND` ativas sob o pai B6, 214 geometrias correntes e 214 lotes ativos (1:1:1).
2. Numeração M001–M214 contínua (sem lacunas nem duplicados), `public_identifier = B6-M###` e `pavilionModuleKey = B6:module:###` consistentes.
3. Revisão/layout: rótulo de revisão pós-correções (`2026.4-p3.x`), metadados de runs/grupos, discrepâncias documentais sinalizadas em M006 e M156–M159 (`official-range-omission`), extensões 76–83 e 140–147 presentes.
4. Integridade geométrica: `ST_IsValid` em 100%, dentro do footprint do B6, sem sobreposições.
5. Neutralidade comercial dos 214 lotes e zero vínculos comerciais inventados (reservas/vendas/contratos = 0).
6. Smoke test autenticado (Playwright): entrar no interior do Pavilhão 3 no mapa, conferir contagem 214, abrir ficha do M001 e M214 e dos especiais, corredores não selecionáveis, console limpo.

### Etapa 6 — Idempotência e relatório final (PT-BR)
Listagem do runner com zero pendências; recontagens idênticas às da Etapa 4; relatório com status/horário de cada versão, tabela dos 8 pavilhões, lacunas/duplicações (zero), comparação comercial, evidência do Pavilhão 3 e exceção exata em caso de falha.

## Detalhes técnicos
- Mecanismo: ferramenta nativa de migrations (uma chamada por versão, SQL idêntico ao arquivo).
- Projetos ativos: 1 ("Parque Fenasoja — referência oficial 2026"); pais canônicos B1, B2, B3, B4, B5, B6, B8, B10 — um cada.
- Nenhum `DELETE`/`TRUNCATE`/arquivamento fora do que as próprias migrações autorizam; nenhuma escrita manual em `supabase_migrations`.
- Ponto de interrupção: versão exata + erro + precondição violada reportados, sem correção automática.
