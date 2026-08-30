# Asfalto ausente no Mapa Comercial — causa raiz e correção

## Diagnóstico (verificado)

O mapa 3D **não lê** o arquivo de referência do código: ele renderiza exclusivamente as entidades persistidas no banco (`map_entities` + `map_entity_geometries`), e o reconciliador é explícito em nunca projetar geometria do código sobre o banco.

Consulta feita agora no projeto cartográfico ativo (revisão 2026.4):

- Banco: **21 vias** (`ROAD`) ativas.
- Código: **25 vias**.

Ou seja, os quatro corredores criados na etapa anterior (`RUA-MONTEVIDEU-SUL`, `RUA-INTERNA-OESTE`, `RUA-URUGUAI-LESTE`, `RUA-ARGENTINA-LESTE`) existem apenas no código e por isso **nunca aparecem em nenhum ângulo** — não é problema de material, z-fighting ou ordem de camadas. Além deles, três faixas apontadas nos anexos ainda não têm via nenhuma nas duas fontes.

## O que será feito

1. **Publicar no banco** os quatro corredores já existentes no código, na camada `circulation`, com elevação 0 e espessura 0.032 (idêntico às ruas oficiais).
   - `RUA-MONTEVIDEU-SUL` é exatamente a faixa oeste que acompanha `Q-F-01`/`Q-F-02` e `Q-G-01`/`Q-G-02`.
2. **Criar três novas vias** (código + banco), em faixas livres confirmadas por cálculo de colisão contra todos os lotes:
   - `PRACA-ACESSO-EXPORURAL` — conexão ao lado do Espaço Mirante com o início da Exporural: x 8.95→13.92, z -11.59→-7.66. Amarra Rua Paraguai, Rua Bolívia, Rua Brasília e Rua Pastor Albert Lehenbauer.
   - `RUA-INTERNA-QUADRA-G` — corredor vertical vago da Quadra G (sem lotes 03/04): x 4.40→5.97, z -7.66→-3.03. Liga Rua Bolívia a Rua Chile.
   - `RUA-INTERNA-QUADRA-T` — corredor de `Q-V-06` até `Q-T-12`, entre a 1ª e a 2ª colunas de lotes: x -34.94→-33.57, z -11.59→2.90. Liga Rua Paraguai a Rua Brasil atravessando V, U e T.
   - `RUA-LESTE-EXPORURAL` — faixa leste de `Q-R-55` até `Q-S-19`: x 56.55→57.08, z -37.31→-26.47. Liga Rua Johan Muller, Rua Bruno Schwartz e Rua Ubiretama.
3. Nenhum lote é reduzido, deslocado ou invadido: todas as faixas usam apenas o vão já reservado entre quadras.

## Detalhes técnicos

- Migration versionada inserindo as sete vias em `map_entities` (classification `ROAD`, camada `circulation`, `verification_status` oficial, metadata com `seedManaged` e `sourceRevision` 2026.4) e a geometria correspondente em `map_entity_geometries` (`is_current = true`), idempotente por `public_identifier`.
- `src/features/commercial-map/data/officialReference2026.ts`: acréscimo das três novas vias, mantendo o mesmo padrão de construção por retângulo em coordenadas locais.
- As geometrias entram no pipeline existente `buildRoadNetworkGeometries`, herdando asfalto, meio-fio, sarjeta e fusão de interseções — sem novos draw calls por rua.
- Testes: atualizar `src/test/commercialMapRoadInfrastructure.test.ts` para 28 vias e adicionar asserções de cobertura dos cinco pontos reclamados e de não invasão de lotes.
- Validação visual desktop e mobile nos dois ângulos dos anexos após aplicar a migration.
