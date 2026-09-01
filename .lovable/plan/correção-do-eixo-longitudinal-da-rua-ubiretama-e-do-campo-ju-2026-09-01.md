# Correção do eixo longitudinal, da Rua Ubiretama e do campo junto à Arena

## O que foi verificado no código

- O eixo N–S que aparece cortando o bosque (o traçado marcado como "essa rua aqui não existe") é gerado por `REAR_CALIBRATED_AXES.brasiliaNorthToJunction` + `brasiliaJunctionToSouth`, na faixa de origem x ≈ 3948–3964, consumidos pelos segmentos `brasilia-north-junction` e `brasilia-junction-south` em `rearParkRoadNetwork.ts`. É superfície procedural (`generated-surface`), não a superfície cadastral interna da `RUA-BRASILIA` — dá para removê-la sem tocar no cadastro.
- A Rua Ubiretama hoje é composta por `ubiretama-west-junction` (superfície oficial, aproveitando a Rua Uruguai) e `ubiretama-junction-a5` (`ubiretamaJunctionToA5`, de x 3964 até o Portão 5). Ela nasce no cruzamento com o eixo antigo — por isso o trecho entre o acesso da Expo Rural e a via vertical fica incompleto no render.
- A conexão com a BR mostrada no anexo 2 é o trevo do Portão 5: `a5CenterAccess` + `a5NorthRamp` + `a5SouthRamp`, com largura 36 e acostamento 5 em unidades de origem, mais os trechos da BR-472. Esse conjunto está correto e não será alterado — vira o padrão de execução.
- O campo a ser retirado é `ARENA_FRONT_LAYOUT.footballField` (`sourceBounds [4660, 2860, 4880, 3200]`, grama sem marcações), protegido no terreno pela zona `football-field` (`SPORTS_FIELD`) em `arenaSectorZoning.ts`.
- A cicatriz de terreno após remover/mover uma via já é tratada automaticamente: `rearRoadGroundIntegration.ts` recorta e nivela o solo a partir de `GENERATED_REAR_ROAD_SEGMENTS`, então o corredor antigo volta a ser terreno/vegetação assim que o segmento sai da lista.

## O que será feito

### 1. Remoção da via incorreta
- Excluir os eixos `brasiliaNorthToJunction` e `brasiliaJunctionToSouth` e os dois segmentos que os consomem. Com isso somem geometria, material, sarjeta/bordas, footprint de recorte de solo, colisor de exclusão e âncora de label — nada fica órfão.
- O terreno e a vegetação voltam a fechar sobre a faixa liberada pelo próprio pipeline de recorte; as exclusões de árvore (`rearRoadTreeClearance`) passam a ser recalculadas sobre o traçado novo, devolvendo o bosque ao corredor antigo.
- A entidade cadastral `RUA-BRASILIA` continua intacta no banco e no núcleo interno do parque.

### 2. Nova via longitudinal correta
- Criar um eixo novo no corredor das linhas verdes centrais: paralelo e a leste do antigo, descendo pela borda dos estacionamentos até o Portão 5, com curvatura suave (sem quinas) e largura equivalente à das vias internas já validadas.
- Traçado por dentro/ao longo da área de estacionamento, respeitando os polígonos de `rearParkingFootprint`/`arenaSectorZoning` para não atravessar edificação, quadra, pavilhão nem mata densa.
- No trecho inferior a via encaixa no acesso já existente do Portão 5 (`gate5InternalApproach`), sem duplicar pista e sem criar segunda entrada.

### 3. Rua Ubiretama contínua
- Reconstruir a Ubiretama como um eixo único e contínuo do acesso da Expo Rural até o encontro com a nova via longitudinal, eliminando a dependência do cruzamento antigo.
- A interseção Ubiretama × nova via será um cruzamento real: pontos coincidentes de eixo, largura compatível, concordância curva nas quatro pontas e patch de junção na mesma elevação, sem gap, sem sobreposição de malha e sem z-fighting.

### 4. Padrão de execução herdado do anexo 2
- A nova ligação reproduz a lógica do trevo do Portão 5: alargamento gradual antes do encontro, raios laterais suaves, mesma proporção entre pista principal e braços, mesma faixa de acostamento e mesma transição de borda asfalto → acostamento → solo → grama.
- Nenhum ponto de `a5CenterAccess`, `a5NorthRamp`, `a5SouthRamp` ou dos eixos da BR-472 é modificado.

### 5. Campo removido e piso restaurado
- Remover `footballField` de `parkEnvironment.ts` e a zona `football-field` de `arenaSectorZoning.ts`.
- Substituir a área por superfície pavimentada contínua, anexando o retângulo à zona de concreto vizinha (`CONCRETE_ACCESS`) com a mesma margem de costura já usada, para que o piso leia como continuação do pátio e não como remendo.

## Detalhes técnicos

- `utils/rearSpatialCalibration.ts`: remoção dos dois eixos antigos, novo eixo longitudinal em pontos de origem e reescrita do eixo contínuo da Ubiretama; bump da revisão de calibração.
- `data/rearParkRoadNetwork.ts`: substituição dos segmentos `brasilia-*` pelo novo eixo, unificação dos segmentos da Ubiretama, nós do grafo atualizados (`roadGraphPath` deve continuar ligando Ubiretama → Portão 5 → BR-472) e novas âncoras de label contextual; bump de `REAR_PARK_ROAD_REVISION`.
- `data/parkEnvironment.ts` e `data/arenaSectorZoning.ts`: campo removido, zona convertida em concreto.
- Testes atualizados/estendidos: `commercialMapRearRoadNetwork.test.ts` (ausência do eixo antigo, continuidade da Ubiretama, chegada ao Portão 5, orçamento de draw calls/triângulos), `commercialMapRearRoadGround.test.ts` (sem cicatriz no corredor removido), `commercialMapArenaTerrain.test.ts` (campo inexistente, superfície pavimentada).
- Validação visual obrigatória via Playwright: vista superior equivalente ao anexo 1, aproximação do cruzamento Ubiretama × nova via, aproximação do trevo do Portão 5 e da área do campo removido, desktop e mobile, console limpo.
