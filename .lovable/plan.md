# Aplicação das migrations oficiais dos Pavilhões 1, 3, 5, 7, 8, 12, 13 e 14

## Auditoria pré-execução (já realizada — somente leitura)

| Item | Resultado |
|---|---|
| Commit local | `764fa8a1a84b2f4e16f15062e5c0f6dbeb809013` — **confere com o autorizado** ✅ |
| Project ref | `btfaumhroqtqzxomqorx` (supabase/config.toml) — **confere** ✅ |
| Projetos cartográficos ativos | **1** ✅ |
| Pais canônicos | B1, B2, B3, B4, B5, B6, B8, B10 — exatamente 1 cada ✅ |
| Histórico remoto | 71 versões registradas; mais recente `20260824174017` |
| Arquivos no repositório | As 8 migrations autorizadas existem, byte-a-byte intactas ✅ |

### Estado real dos dados (contagem atual de INTERNAL_STAND por pai)

| Pai | Módulos atuais | Situação |
|---|---|---|
| B2 (Pav. 14) | 186 (M001–M186) | conteúdo já presente |
| B3 (Pav. 12) | 257 (M001–M257) | conteúdo já presente |
| B6 (Pav. 3) | 214 (M001–M214) | conteúdo já presente |
| B1, B4, B5, B8, B10 | 0 | pendentes |

### Divergência detectada (gate de histórico)

- No histórico remoto constam aplicadas apenas `20260824173902` e `20260824174017` das 8 autorizadas.
- `20260824173902` (duplicata semântica de `20260824120000`) está **aplicada**, mas `20260824120000` **consta como ausente** do histórico — exatamente a condição que a especificação marca como **NO-GO por divergência cronológica**.
- Porém, os dados provam que o conteúdo de `20260824120000` já está no banco (B2/B3/B6 completos, e a própria `173902` só pôde passar nas precondições se a base existisse). Ou seja: a execução ocorreu em sessões anteriores, mas **o registro da versão `20260824120000` não foi gravado**.
- As migrations de infraestrutura (`20260710010000`, `20260711010000`, `20260804090000`) também não constam pelo nome no histórico, embora tabelas, segmentos e funções existam e estejam em uso.

**Pela regra estrita, o veredito seria NO-GO.** A única saída que não viola as proibições (sem `repair`, sem insert manual em `schema_migrations`, sem alterar arquivos) é aplicar `20260824120000` pelo runner nativo — ela é idempotente por contrato e passará a constar no histórico na posição cronológica correta, anterior à `173902` já registrada apenas em dados.

**Esta é a decisão que preciso que você autorize explicitamente ao aprovar este plano: aplicar `20260824120000` (e as demais pendentes) pelo runner nativo, superando o gate de divergência, ou encerrar como NO-GO.**

## Execução (se aprovado)

### Etapa 1 — Snapshot pré-migração (somente leitura)
Hashes determinísticos (`md5` de agregado ordenado) e contagens das 10 relações ligadas aos 8 pais: `map_entities`, `map_entity_geometries` (correntes e históricas), `commercial_lots`, `lot_prices`, `lot_reservations`, `lot_negotiations`, `lot_sales`, `lot_contracts`, `lot_contract_versions`, `lot_status_history`, `map_lot_lineage`. Sem credenciais nem PII no relatório.

### Etapa 2 — Testes de contrato
`bunx vitest run` nos testes de contrato das migrations de pavilhões (ex.: `commercialMapPavilions5714Migration.contract.test.ts` e demais existentes) antes de qualquer escrita remota.

### Etapa 3 — Aplicação, uma versão por vez, pelo runner nativo (supabase--migration), conteúdo byte-por-byte
Ordem e status inicial:

| # | Versão | Status inicial |
|---|---|---|
| 1 | `20260823120000_rebuild_pavilion_3_commercial_modules` | pendente (aplicar) |
| 2 | `20260824120000_rebuild_pavilions_12_14_and_correct_pavilion_3` | pendente — **gate de divergência, requer sua autorização** |
| 3 | `20260824173902_a4000c93-…` | já aplicada — não reexecutar |
| 4 | `20260824174017_ae7ac404-…` | já aplicada — não reexecutar |
| 5 | `20260824210000_rebuild_pavilions_1_5_and_correct_pavilion_3` | pendente (aplicar) |
| 6 | `20260825010000_correct_pavilion_1_axis_projection` | pendente (aplicar) |
| 7 | `20260825020000_rebuild_pavilions_8_and_13_official_layouts` | pendente (aplicar) |
| 8 | `20260825030000_rebuild_pavilions_5_7_and_14_official_layouts` | pendente (aplicar) |

Regras: parar no primeiro `RAISE EXCEPTION` sem remendo SQL; registrar início/fim de cada versão; rollback transacional nativo de cada arquivo preservado; nenhuma alteração nos arquivos.

### Etapa 4 — Validação pós-migração (consultas auditáveis)
Por pavilhão: quantidade de entidades/lotes/geometrias correntes vs. esperado (B1=189, B6=214, B8=81, B10=171, B4=114, B3=257, B5=103, B2=186; total 1.315), min/max, lacunas via `generate_series`, duplicações de `public_identifier` e `pavilionModuleKey`, pai/revisão/segmento corretos, módulos sem lote/geometria ou com mais de um de cada — todos os contadores de inconsistência em zero. Geometria: `ST_IsValid`, cobertura pelo footprint do pai, ausência de interseção positiva, exatamente 1 `is_current` por módulo. Segmentação: segmento `industria-comercio-servicos` com 1.203 entidades / 1.166 lotes / `complete = true`; B8 e B10 sem segmento; Exporural inalterada. Comercial: comparação de hashes pré/pós com zero alterações indevidas; lotes novos nascidos neutros (`BLOCKED`, `UNVALIDATED`, `NOT_FOR_SALE`, valores e áreas nulos, `buyerDataImported = false`).

### Etapa 5 — Validação autenticada (Playwright, sessão real com `map.admin`, sem service_role)
Abrir mapa completo e segmento; entrar nos 8 interiores; abrir ficha do primeiro e último módulo de cada pavilhão e dos especiais B1-M141, B4-M090, B5-M025/026/078/079; confirmar que apoios/corredores não recebem seleção comercial e que não há dependência de "Sincronizar módulos". Sem persistir mudança operacional.

### Etapa 6 — Idempotência
Nova listagem do runner deve indicar zero pendências; recontagens idênticas às da Etapa 4 (nenhuma entidade/lote/versão nova).

### Etapa 7 — Relatório final em PT-BR
Decisão GO/NO-GO, project ref, commit, histórico antes/depois, status de cada migration com horários, resultado dos testes de contrato, tabela dos 8 pavilhões, totais, lacunas/duplicações, comparação comercial, neutralidade dos novos lotes, geometria, segmentação, evidência autenticada, segunda passagem e exceção exata em caso de falha. Observação: backup/PITR não é inspecionável por mim — será reportado como "não verificável via ferramentas do projeto" (exportação disponível em Cloud → Advanced settings).

## Detalhes técnicos
- Mecanismo: ferramenta nativa de migrations (uma chamada por versão, SQL idêntico ao arquivo).
- Nenhum arquivo de migration será criado, editado, renomeado ou apagado.
- Nenhum `DELETE`/`TRUNCATE`/arquivamento fora do que as próprias migrations autorizam; nenhuma criação manual em `supabase_migrations`.
- Ponto de interrupção em caso de falha: a versão exata, o `RAISE EXCEPTION` e a precondição violada serão reportados, sem correção automática.
