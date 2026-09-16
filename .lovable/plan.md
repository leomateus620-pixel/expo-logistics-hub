# Motor oficial de precificação por m² — Fenasoja 2028

Objetivo: cada lote passa a ter, de forma rastreável, `área oficial × valor do m²` nas duas etapas (Renovação e 2ª Etapa), sem taxas e sem tocar em áreas, geometria, numeração ou dados comerciais.

## O que a conferência no banco já mostrou

- Todos os 1.579 lotes têm área oficial preenchida e desenho no mapa. Nenhum ficou sem metragem.
- Os pavilhões estão identificados como P1, P3, P5, P7, P8, P12, P13, P14 (número comercial), com 189, 214, 81, 171, 114, 257, 103 e 186 módulos.
- Áreas externas: D 12, E 13, F 8, G 8, I 16, J 16, L 16, M 16, O 14, P 14, Q 6, T 12, U 12, V 6, R 59, S 36.
- **Nenhum lote está marcado como esquina hoje** (todos com "esquina = não"). Ou seja, a regra de esquina só existirá depois da auditoria geométrica.
- Não há nenhum preço lançado ainda; nada será sobrescrito.
- O PDF oficial 2028 confere com as faixas do pedido. A categoria "ARTESANATO" do Pavilhão 14 não tem vínculo cadastral no sistema.

## Etapa 1 — Tabela oficial de regras 2028

Nova tabela de regras (exercício 2028), com etapa RENOVACAO e SEGUNDA_ETAPA, tipo de escopo (pavilhão, faixa de módulos, quadra, faixa de lotes, esquina, artesanato), pavilhão/quadra, faixa inicial/final, condição de esquina, valor do m², prioridade, origem documental e ativo/inativo. Valores em decimal, nunca ponto flutuante.

Carga inicial exatamente conforme o PDF: Pav 1, 3, 5, 8, 12, 13, 14; Indústria/Comércio/Serviços (D, E, I, J | F, G, L, M | Q, V) com valor normal e de esquina; Espaço do Automóvel (O, P | T, U) normal e esquina; Exporural R (1–12, 13–40, 41–59) e S (1–36).

Pavilhão 7: nenhuma regra cadastrada. Exclusão explícita no motor, mais teste automático garantindo que os 171 módulos continuem sem preço.

## Etapa 2 — Auditoria geométrica de esquinas

Usando os polígonos dos lotes e as 29 vias já existentes no mapa:

1. reconstruir o perímetro de cada quadra a partir dos seus lotes;
2. identificar as vias que encostam em cada lado da quadra;
3. localizar os cruzamentos entre vias;
4. verificar quais lotes ocupam os vértices e têm frente para duas vias distintas;
5. classificar cada lote como CORNER_CONFIRMED, NOT_CORNER ou REVIEW_REQUIRED.

Relatório por quadra: lote, área, esquina no banco, esquina detectada, vias adjacentes, cruzamento, regra encontrada e situação. Nada é corrigido em silêncio: só lotes CORNER_CONFIRMED recebem valor de esquina; casos ambíguos vão para pendências. Geometria, posição e quadra não são alteradas.

## Etapa 3 — Resolvedor determinístico

Ordem de precedência: exclusão explícita → classificação especial documentada → faixa específica → esquina confirmada → quadra → pavilhão → demais módulos. Duas regras de mesma prioridade para o mesmo lote = ambiguidade, e o lote fica sem preço, registrado no relatório.

Cada lote elegível produz: área oficial, valor/m² Renovação, total Renovação, valor/m² 2ª Etapa, total 2ª Etapa. As duas etapas coexistem; nenhuma sobrescreve a outra.

## Etapa 4 — Dry-run antes de gravar

Relatório completo lote a lote (identificador, segmento, pavilhão/quadra, número, esquina, área, situação da área, regra aplicada, os quatro valores) com classificação OK / SEM ÁREA / SEM REGRA / REGRA AMBÍGUA / EXCLUÍDO / PREÇO MANUAL EXISTENTE, mais totais por grupo. Só depois disso a gravação é executada.

## Etapa 5 — Persistência auditável

Os preços calculados entram como nova vigência na estrutura de preços existente, com origem RULE_2028, etapa, valor/m², área usada, total, data/hora e referência da regra. Linha manual ativa nunca é sobrescrita. Lotes vendidos, reservados ou com contrato não são reprecificados. Reexecutar não muda resultado nem duplica registros.

O status de validação da área não é alterado: o motor 2028 usa a área oficial cadastrada por um caminho próprio, sem enfraquecer a regra atual de validação.

## Etapa 6 — Exibição

No painel do lote e no cartão de módulo do pavilhão:

```text
ÁREA          450,00 m²
RENOVAÇÃO     R$ 42,00 / m²      R$ 18.900,00
2ª ETAPA      R$ 46,00 / m²      R$ 20.700,00
```

Total em destaque maior que o valor por m². Formato pt-BR. Pavilhão 7 mostra "Valor ainda não definido" — nunca R$ 0,00.

## Etapa 7 — Testes

Fronteiras de todas as faixas (Pav 1 64/65, 68/69, 98/99, 106/107, 136/137, 140/141; Pav 3, 8, 12, 13, 14; R 12/13 e 40/41; S; Q e V; O/P/T/U), esquina x normal, módulo com metragem excepcional, Pavilhão 7 sem preço, e precisão decimal (5,00 × 50,00 = 250,00 exato, sem 249,999999).

## Pendências que serão relatadas, não adivinhadas

- **Artesanato do Pavilhão 14**: não existe no sistema nenhuma marcação que diga quais módulos são artesanato "Santa Rosa" ou "fora". Esses módulos ficarão com o preço comercial do Pavilhão 14 e a categoria artesanato (R$ 342,00 / R$ 376,00) fica cadastrada como regra inativa até você confirmar a lista de módulos.
- **Q e V**: para preço, seguem a regra de Indústria, Comércio e Serviços, resolvida pela quadra e não pela segmentação do mapa. A cartografia não é alterada.
- **Esquinas**: como hoje nenhum lote está marcado, o número de esquinas virá inteiramente da auditoria geométrica e será apresentado para sua conferência.

## Entrega final

Estrutura de regras criada, tabela de regras importadas, quantidade precificada por grupo, excluídos, pendências, testes executados, exemplos reais de cálculo, e confirmação explícita de que o Pavilhão 7 segue sem preço, que nenhuma taxa foi incluída e que área, geometria e numeração permanecem intactas. Nada será publicado em produção.

## Detalhes técnicos

- Tabela `commercial_price_rules` (exercício, etapa, escopo, pavilion_identifier, block, faixa, is_corner, price_per_sqm numeric, priority, source, is_active) com GRANTs e RLS por organização.
- Classificação de esquina persistida em coluna/metadata própria com status e evidência, mantendo `commercial_lots.is_corner` como espelho só quando CORNER_CONFIRMED.
- Motor em `src/features/commercial-map/pricing/` (regras, resolvedor, cálculo decimal) + RPC dedicada `apply_lot_price_rules_2028(p_stage, p_dry_run)` que grava nova vigência em `lot_prices` sem passar por `update_commercial_lot`, preservando a invariante VALIDATED existente.
- Integração de leitura em `commercialMapService.ts` / `useCommercialMap.ts`; exibição em `PavilionModuleCard.tsx`, `MapPanels.tsx`, `CompactDetailSheet.tsx`.
- Auditoria geométrica sobre `map_entity_geometries` (1.579 polígonos atuais) e as 29 entidades de via, com relatório versionado em `docs/validation/`.
