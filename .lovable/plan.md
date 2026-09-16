# Auditoria técnica — Mapa Comercial e preparação da precificação por m² (2028)

Somente leitura: nenhum arquivo do projeto foi alterado, nenhuma migration aplicada, nada publicado.

## 1. Lotes internos dos pavilhões (1, 3, 5, 7, 8, 12, 13, 14)

- Cada módulo é uma entidade `map_entities` com `classification = 'INTERNAL_STAND'`, `parent_entity_id` apontando para o pavilhão (B1, B6, B8, B10, B4, B3, B5, B2), `public_identifier` no formato `B6-M037` e `metadata->>'moduleNumber'`.
- O registro comercial é `commercial_lots` (1:1 com a entidade via `entity_id`).
- Área oficial persistida em `commercial_lots.official_area_sqm`; `calculated_area_sqm` permanece NULL (área calculada é intencionalmente separada da documental); `area_validation_status` marca a evidência.
- Estado atual (ativos): 1.315 módulos com área preenchida — B1 189/587,85; B2 186/616,00; B3 257/771,00; B4 114/438,50; B5 103/351,30; B6 214/663,00; B8 81/244,50; B10 171/427,50. Validação: 14 `VALIDATED`, 1.300 `CALCULATED`, 1 `UNVALIDATED` (B5-M078).
- Referência em código: `src/features/commercial-map/data/pavilionModuleOfficialAreas.ts` (revisão `2026.4-pavilion-module-areas.1`), consumida por `commercialPavilionReference.ts`, `utils/commercialPavilionModules.ts`, `data/officialReference2026.ts`.
- Exibição: `components/panels/PavilionModuleCard.tsx` (área individual + rótulo de origem/ressalva) e `components/canvas/CommercialPavilionModuleLayer.tsx` (rótulo de m² na textura 3D).

## 2. Lotes externos (Indústria/Comércio/Serviços, Espaço do Automóvel, Exporural R/S)

- Todos são `map_entities.classification = 'SELLABLE_LOT'` + `commercial_lots`, com `block` (quadra) e `lot_number`. 264 lotes ativos, todos `VALIDATED`, somando 81.618,64 m².
- Vínculo de segmento: `map_entities.segment_id` → `map_segments`. Existem **apenas 2 segmentos**: `exporural` e `industria-comercio-servicos`.
- Distribuição por quadra: Exporural R 59 / S 36; Indústria D 12, E 13, F 8, G 8, I 16, J 16, L 16, M 16.
- **Achado importante:** as quadras do Espaço do Automóvel (O 14, P 14, Q 6, T 12, U 12, V 6 = 64 lotes) estão com `segment_id` NULL no banco. O segmento `espaco-automovel` existe apenas no código (`data/commercialMapSegments.ts`, `COMMERCIAL_MAP_SEGMENT_IDS.automotive`) e é derivado por regras de bloco no cliente (`utils/areaScope.ts`, `buildCommercialMapSegmentIndex`). Qualquer regra de preço por segmento no banco falharia para essas quadras hoje.
- Áreas documentais externas em `src/features/commercial-map/data/externalLotOfficialAreas.ts` (169 lotes / 33.733,77 m²) e Exporural em `data/exporuralReference2026.ts`.

## 3. Campos e tabelas já existentes para preço e ciclo comercial

- `lot_prices`: `id, lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price, is_active, valid_from, valid_until, created_by, created_at` — já é versionada por vigência. Hoje: 1.577 linhas, todas `is_active = true` e `pricing_mode = 'NOT_FOR_SALE'`, com `base_price`, `price_per_sqm` e `asking_price` todos nulos.
- `commercial_lots.status` (`AVAILABLE, RESERVED, IN_NEGOTIATION, SOLD, BLOCKED, UNAVAILABLE`), `is_corner`, `is_covered`, `frontage_meters`, `depth_meters`, `infrastructure`.
- `lot_reservations`, `lot_negotiations` (com `proposed_value`), `lot_sales`, `lot_contracts` + `lot_contract_versions`, `lot_status_history`, `map_activity_logs` — todas existem e estão vazias (0 linhas), exceto os logs.
- Não existe hoje nenhuma tabela de regra/tabela de preços por pavilhão, quadra, faixa de módulos ou etapa.

## 4. Services, hooks e components que convertem e exibem

- `src/features/commercial-map/services/commercialMapService.ts`: seleciona `lot_prices(is_active, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price)`, escolhe a linha ativa e converte para o domínio (`pricingMode`, `basePrice`, `pricePerSqm`, `askingPrice`, `minimumPrice` em `types.ts`).
- `src/features/commercial-map/utils/geometry.ts` → `calculateAskingPrice` (cálculo de exibição no cliente).
- UI: `components/commercial/LotEditDialog.tsx` (edição de preço), `LotWorkflowDialog.tsx` (reserva/venda/contrato), `components/editor/LotCreationWorkspace.tsx`, `components/panels/MapPanels.tsx`, `PavilionModuleCard.tsx`.
- Hook de dados: `hooks/useCommercialMap.ts`. Permissões: `utils/permissions.ts` (`canManageLots`, `canManageSales`, `canManageContracts`).

## 5. Lógica de preço derivada de área já existente

Sim, em dois lugares que precisam continuar sendo a única fonte da regra:

- Cliente: `calculateAskingPrice` só calcula `area × preço_m²` quando `pricingMode = 'PRICE_PER_SQUARE_METER'` **e** `areaValidationStatus = 'VALIDATED'`.
- Banco: a RPC `update_commercial_lot` recalcula `asking_price = official_area_sqm × price_per_sqm` e levanta `VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE` se a área não estiver `VALIDATED`, além de `MINIMUM_PRICE_ABOVE_ASKING_PRICE`.
- Outras RPCs relevantes: `create_commercial_lot` (recebe parâmetros de preço), `merge_commercial_lots`, `split_commercial_lot`, `reserve_commercial_lot`, `register_lot_contract_version`.

**Risco central:** 1.300 dos 1.315 módulos internos estão como `CALCULATED`, não `VALIDATED`. Com as regras atuais, uma precificação automática por m² nos pavilhões seria **rejeitada pelo banco** — ou, pior, alguém seria tentado a promover as áreas para `VALIDATED` só para destravar preço, o que corromperia o significado da evidência documental.

Outros riscos de sobrescrita: `lot_prices` hoje tem uma linha ativa por lote; um backfill que faça UPDATE em vez de nova vigência apaga preço manual sem histórico; `asking_price` gravado manualmente pode divergir de `area × preço_m²` se a área for corrigida depois.

## 6. Ponto de integração mais seguro para a tabela de regras 2028

Camada nova, **sem alterar** `lot_prices` nem as RPCs existentes:

- Nova tabela `lot_price_rules` (proposta): `id, project_id, stage ('RENOVACAO' | 'SEGUNDA_ETAPA'), scope_type ('PAVILION' | 'BLOCK'), pavilion_identifier, block, module_from, module_to, is_corner (nullable = indiferente), price_per_sqm, valid_from, valid_until, is_active, notes, created_by`. Grants + RLS explícitos, como as demais tabelas públicas.
- Aplicação por RPC dedicada (ex.: `apply_lot_price_rules(p_stage, p_dry_run)`), que resolve a regra **mais específica** por lote, calcula `total_lote = official_area_sqm × price_per_sqm`, e **insere nova linha em `lot_prices`** desativando a anterior (`is_active = false`, `valid_until = now()`), preservando histórico.
- Um lote só entra no cálculo se tiver `official_area_sqm` não nulo e > 0, não estiver arquivado, e não estiver `SOLD` nem com contrato/reserva ativa.
- Preço manual protegido: marcar origem na linha de preço (ex.: `notes`/coluna `source` = `RULE_2028` vs `MANUAL`) e nunca sobrescrever linha ativa de origem manual sem confirmação explícita.
- Resolver a questão da validação: ou a regra aceita `CALCULATED` explicitamente para módulos internos (parametrizado na própria regra), ou a RPC nova calcula o total sem passar por `update_commercial_lot`. Recomendo a segunda: não relaxar a invariante existente.
- Antes de qualquer gravação, rodar dry-run com contagem por pavilhão/quadra e soma esperada, como foi feito no backfill de áreas.

## 7. Como manter o Pavilhão 7 sem preço

Pavilhão 7 = entidade **B10** (`d1ece603-4dc0-4809-8928-2265322878e1`), 171 módulos, 427,50 m².

Três travas combinadas: (a) nenhuma regra cadastrada para B10 em `lot_price_rules`; (b) lista de exclusão explícita na RPC de aplicação (`pavilion_identifier <> 'B10'`), para que uma regra genérica futura não o alcance; (c) manter seus lotes em `pricing_mode = 'NOT_FOR_SALE'` e status `BLOCKED`, com teste automatizado afirmando que B10 permanece sem `price_per_sqm` e sem `asking_price`.

## Invariantes para evitar preço incorreto

1. `total_lote = official_area_sqm × price_per_sqm`; nunca usar `calculated_area_sqm` nem área derivada de pixels.
2. Área nula ou zero nunca gera preço — ausência de área é ausência de preço, não zero.
3. Uma única linha `is_active = true` por lote em `lot_prices`; mudanças criam nova vigência, nunca UPDATE destrutivo.
4. Preço de origem manual prevalece sobre regra automática até revogação explícita.
5. Lotes `SOLD`, arquivados, ou com contrato/reserva ativa não são reprecificados.
6. Não promover `area_validation_status` para `VALIDATED` como efeito colateral de precificação.
7. `minimum_price` nunca acima do `asking_price` (já garantido pela RPC).
8. Valores monetários como `numeric`, arredondamento definido uma única vez, formatação pt-BR só na exibição.
9. B10 (Pavilhão 7) permanece sem preço; B3 = Pavilhão 12, B5 = Pavilhão 13, B8 = Pavilhão 5 — não confundir código com número.
10. Espaço do Automóvel precisa de `segment_id` ou de regra por `block`, senão suas 64 unidades ficam de fora silenciosamente.
