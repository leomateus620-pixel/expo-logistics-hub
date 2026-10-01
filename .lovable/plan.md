# Pavilhão 13 — ilha central centralizada e sem áreas cinza-escuras

## O que muda (só visual)
- A ilha central (boxes 27–78) desce para ficar no meio do pavilhão, alinhada aos módulos laterais, em vez de "colada" no topo com um bloco vazio embaixo.
- As áreas cinza-escuras (embaixo da ilha e ao lado dos boxes 27–33) passam a ser corredor claro, igual ao restante da circulação.
- Vale para o mapa interno, o modo Vendas e o link público do Pavilhão 13.

## O que não muda
- Metragens (3 m² por box, 345 m² no total), números dos boxes, preços, regras de cálculo, status, vendas e IDs.
- Módulos laterais (01–26 e 79–104), entradas, saídas e acessos aos Pavilhões 3 e 8.

## Passos
1. Na planta de referência, mover os dois blocos da ilha (27–52 e 53–78) para o centro da altura do pavilhão (de z 3–29 para cerca de z 5,9–31,9), mantendo a largura e o centro horizontal.
2. Redesenhar os corredores para cobrir todo espaço livre: circulação norte em toda a largura entre as laterais, corredores principais até a ilha e circulação sul encostando no fim da ilha — sem sobras escuras.
3. Atualizar no banco apenas a posição desenhada dos 52 boxes centrais (nova versão `2028.2-p13.5`), guardando a versão anterior para desfazer; área oficial e valores ficam intactos. É o que o link público lê.
4. Ajustar os testes do Pavilhão 13 (posição da ilha, sem sobreposição, sem lacunas, áreas inalteradas) e rodá-los.
5. Conferir por captura de tela o mapa interno e o link público, no computador e no celular.

## Detalhes técnicos
- Arquivo: `src/features/commercial-map/data/pavilion13CommercialReference.ts` (`PAVILION13_COMMERCIAL_REFERENCE_RUNS` central-* e `PAVILION13_COMMERCIAL_REFERENCE_CORRIDORS`).
- Migração idempotente: arquiva a geometria atual em `map_geometry_versions` e atualiza `map_entity_geometries` de B5-M027–078 com deslocamento em z; não toca `commercial_lots.official_area_sqm` nem preços.
- Sem publicação.
