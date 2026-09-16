# Metragens individuais dos lotes internos dos oito pavilhões

## Estado verificado agora (banco e PDFs)

Os oito pavilhões estão íntegros no banco e nenhum lote interno tem área:

| Pavilhão | Pai | UUID do pai | Lotes | Numeração | Com área hoje |
|---|---|---|---:|---|---:|
| 1 | B1 | 79613909-…925f | 189 | 1–189 | 0 |
| 3 | B6 | 1023eed6-…d767 | 214 | 1–214 | 0 |
| 5 | B8 | 93e05f88-…9053 | 81 | 1–81 | 0 |
| 7 | B10 | d1ece603-…78e1 | 171 | 1–171 | 0 |
| 8 | B4 | fd3ad68b-…cbea9 | 114 | 1–114 | 0 |
| 12 | B3 | a020da30-…eacdd | 257 | 1–257 | 0 |
| 13 | B5 | e8e160bb-…c211 | 103 | 1–103 | 0 |
| 14 | B2 | 9e6158b2-…737d | 186 | 1–186 | 0 |

Total: 1.315 lotes, 1 entidade para 1 lote comercial em todos, sem duplicidade nem lacuna. Os UUIDs de pai do documento conferem com o banco.

Conferência dos PDFs anexados:
- Pavilhão 3 corrigido: lotes 037–040 aparecem com **3,00 m²**; o PDF declara "213 lotes de 3,00 m² e o lote 36 de 24,00 m²", soma 663,00 m², diferença zero contra o carimbo. A pendência anterior está encerrada.
- Pavilhão 1: 587,85 m², diferença zero. Pavilhão 5: 244,50. Pavilhão 8: 438,50. Pavilhão 12: 771,00. Todos fecham com o carimbo.
- Pavilhão 7: 427,50 m² por 171 células de 2,50 m²; o carimbo cita 57 módulos — ressalva documental mantida, sem reagrupar lotes.
- Pavilhão 13: 351,30 m², com 025/079 = 12,45 e 026/078 = 14,70. O lote 078 tem cotas divergentes (6,80 × 3,40 × 3 daria 15,30) — ressalva individual mantida.
- Pavilhão 14: soma individual 616,00 contra carimbo 616,16 — divergência agregada de 0,16 m², sem rateio.

No banco, `commercial_lots.area_validation_status` aceita apenas `UNVALIDATED`, `CALCULATED`, `VALIDATED`, `REJECTED`, e há check de área positiva. Na interface, `PavilionModuleCard` já lê `lot?.officialAreaSqm ?? cell.areaM2`, e hoje `areaM2` é sempre nulo na fábrica de referência.

## O que será feito

### 1. Tabela tipada de áreas por módulo
Novo arquivo de referência com a área de cada um dos 1.315 módulos, resolvida por pai + número, com origem (área escrita no croqui, área calculada por cotas, malha nominal) e situação de conferência. Sem default global de 3 m²: cada faixa e cada exceção declarada explicitamente, com invariantes de soma por pavilhão verificadas em teste (587,85 / 663,00 / 244,50 / 427,50 / 438,50 / 771,00 / 351,30 / 616,00).

Exceções tratadas individualmente: P1 058 (4,50), 059–064 (3,50), 141 (19,35, recorte em L); P3 036 (24,00); P5 001 (4,50); P8 001–025 e 091–114 (4,00), 026–037 (3,00), 038–089 (3,50), 090 (24,50); P13 025/079 (12,45), 026/078 (14,70); P14 036–151 (3,50).

### 2. Dry-run antes de gravar
Relatório com uma linha por lote (pavilhão, pai, entity_id, lot_id, número, área atual, área proposta, origem, método, situação), mais o resumo por pavilhão. Qualquer vínculo ambíguo, lote ausente/extra ou área pré-existente diferente bloqueia apenas o pavilhão afetado e vai para o relatório; nada é sobrescrito em silêncio.

### 3. Migração nova, restrita e idempotente
Atualiza somente `official_area_sqm` e `area_validation_status` dos 1.315 lotes já existentes, casando por projeto cartográfico + entidade pai + classificação + número + identificador público. `calculated_area_sqm` permanece nulo (é cálculo geométrico independente, que não temos). Status:
- `VALIDATED` para áreas escritas no croqui e conferidas (P1 058/059–064/141, P3 036, P5 001, P8 090, P13 025/026/079);
- `CALCULATED` para as áreas de malha nominal (a maioria), registrando o método;
- `UNVALIDATED` para P13 078, que recebe os 14,70 m² documentais com aviso de cotas divergentes.

Nada de criar, excluir, renumerar ou mover lotes. Geometria, projeção, posições, corredores, apoios, segmentação, preços, reservas, contratos, vendas e status comercial ficam intactos; frontage e depth não são alterados. Snapshot dos valores anteriores por ID em metadados, para reversão seletiva. Reexecução não altera linha alguma.

### 4. Exibição
A área passa a aparecer na ficha do módulo e como rótulo secundário no interior do pavilhão, em pt-BR com duas casas (`3,00 m²`). Em modo conectado a ficha mostra a área persistida e seu status, sem deixar o fallback de referência esconder um valor nulo. Textos distintos (não só cor) para as ressalvas: aviso explícito em B5-M078, nota de contagem documental no Pavilhão 7 e, no Pavilhão 14, os dois totais lado a lado (616,00 calculado / 616,16 carimbo) com suas origens.

Também será corrigido o caminho de referência/sync para que um reload ou uma sincronização não volte a gravar área nula.

### 5. Fora de escopo, preservado
Exporural, lotes externos de Indústria/Comércio/Serviços, Espaço do Automóvel e quadras Q/V não são tocados — comparação de hash antes/depois comprova isso. Nenhuma migration histórica é reexecutada. Nada é publicado.

## Validação

- Contagem idêntica de entidades, lotes e geometrias antes e depois; IDs, pais e numeração preservados.
- Somas por pavilhão conferidas lote a lote, não por média.
- Testes tabulares de todas as exceções e das transições (57/58/59/64/65, 140/141/142, 35/36, 25/26, 37/38, 89/90/91, 93/94, 151/152).
- 1.315 áreas preenchidas, sendo 1.314 sem ressalva individual e 1 (B5-M078) com divergência documentada.
- Segunda execução sem alteração de linhas, sem duplicar metadados ou histórico.
- Persistência após recarregar a página; build e testes de pavilhões, separando falhas preexistentes de regressões.
- Conferência visual autenticada nos oito interiores em desktop e mobile; se a sessão não permitir, será declarado "não verificado" em vez de alegado.

## Detalhes técnicos

Arquivos: nova referência de áreas por módulo em `src/features/commercial-map/data/`, ajuste nos oito `pavilion{N}CommercialReference.ts` e na fábrica `commercialPavilionReference.ts` (campo `areaM2`), `utils/pavilionModuleCommercial.ts`, `components/panels/PavilionModuleCard.tsx`, renderer interno do pavilhão, mais uma migration nova e testes de área. Áreas gravadas como número, nunca string com unidade; zero nunca usado para desconhecido.
