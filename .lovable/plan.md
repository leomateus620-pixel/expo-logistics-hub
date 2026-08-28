# Reconstrução do entorno da Arena Sicredi – Icatu (Mapa Comercial 3D)

## Diagnóstico atual (verificado no código)

- O setor da Arena é desenhado por `ArenaFrontInfrastructure.tsx` a partir de `data/parkEnvironment.ts` (`ARENA_FRONT_LAYOUT`).
- A escadaria hoje tem `stepCount: 18` com `riserHeight: 0.085` e um patamar superior sólido (`upperLandingDepth`), o que gera um bloco de ~1,53 unidade de altura apoiado sobre um plano plano (`plaza.elevation = 0.052`) — é exatamente o degrau flutuante/alto dos anexos 1 e 2.
- Os taludes (`northBerm`/`southBerm`) são cunhas retas ligadas à altura total da escada, sem transição com o terreno.
- Não existe terreno modelado no setor: a área é uma praça pavimentada plana (`arena-front-public-plaza`) com material claro, o que produz as grandes superfícies brancas.
- Não existe campo de futebol em nenhuma fonte de dados (`rg` por campo/field não retorna entidade).
- Texturas procedurais de solo já existem, mas só para `AREA-MOTORHOME` e `TEST-DRIVE` (`openGroundTextures.ts`); o setor da Arena não usa esse sistema.
- Quadras (`multiSportCourt`, `sandVolleyballCourt`) estão corretas e serão preservadas.

## O que será feito

### 1. Escadaria e patamares (recalculados, não apenas rebaixados)
- Recalcular o perfil: reduzir o desnível total para o descenso real (~0,55–0,70 unidade), com `riserHeight` menor, `treadDepth` maior e razão degrau coerente.
- Substituir o "patamar superior maciço" por uma laje de topo fina alinhada à praça alta da Arena.
- Manter os três setores de degraus e os dois patamares intermediários, agora com transições laterais (muretas de arrimo) que encontram o terreno.
- Primeiro e último degrau amarrados às cotas reais do piso adjacente, sem vãos nem interseções.
- Guarda-corpos recalculados sobre o novo perfil (a lógica já existe e será reaproveitada).

### 2. Topografia do entorno
- Substituir o plano branco por uma malha de terreno com descida contínua leste→oeste, subdividida apenas onde há variação relevante.
- Amarração de cota nas bordas: Arena, quadras, ruas e lotes vizinhos permanecem exatamente onde estão.
- Transições suaves grama → solo → caminho → pavimento, sem costuras nem planos sobrepostos.

### 3. Materiais
- Estender o sistema procedural existente (`openGroundTextures.ts`) com novos perfis: grama natural, grama desgastada, solo compactado avermelhado, concreto e cascalho.
- Reaproveitar a política de amostragem já validada (mipmaps, anisotropia, tile grande) que evita cintilação a distância e borrão de perto.

### 4. Campo de futebol
- Novo elemento de apresentação, posicionado pelos anexos 3 e 4 ao lado da Arena, com grama variada, limites desgastados e marcação discreta. Sem traves se a posição não for segura. Não entra em métricas comerciais nem em lotes.

### 5. Quadras
- Geometria, dimensões, posição, orientação e marcações intactas; apenas a base é reassentada na nova cota.

### 6. Vegetação
- Novos grupos arbóreos no setor da Arena usando o sistema instanciado existente (`commercialTrees.ts` + `CommercialTreeLayer`), com escala/rotação variadas, seguindo a distribuição real dos anexos, sem obstruir a Arena nem invadir escada, quadras ou campo.

### 7. Circulação
- Caminhos pedonais entre Arena, escadaria, quadras, campo e vias do parque — apenas o que os anexos sustentam.

### 8. Responsividade
- Enquadramento próprio para desktop amplo/padrão e mobile retrato/paisagem (FOV e distância adaptados, não coordenadas copiadas), respeitando safe areas e os controles do dock.

### 9. Desempenho e não-regressão
- Instancing e LOD para vegetação, materiais/geometrias compartilhados, descarte correto via `disposeInstancedMesh`, sem estado React por frame.
- Nada fora do setor da Arena é alterado: IDs, metadados, seleção, busca, filtros, edição, rotas e autenticação permanecem.

### 10. Validação visual obrigatória
- Playwright no app real: vista aérea completa, frontal, traseira, lateral (descida do terreno), zoom médio e próximo, campo completo, desktop amplo/padrão, mobile retrato/paisagem, com órbita/pan/zoom — iterando até o resultado bater com os quatro anexos.

## Detalhes técnicos

- `data/parkEnvironment.ts`: novo perfil de escadaria (rise/tread/landings), novos taludes por curva, footprint do campo de futebol, caminhos de circulação, bump da `PARK_ENVIRONMENT_REVISION`.
- Novo `data/arenaTerrain.ts` + util de amostragem de cota (reutilizando `utils/spatialSurface.ts`) para que escada, quadras, campo, árvores e caminhos leiam a mesma função de altura.
- `components/canvas/ArenaFrontInfrastructure.tsx`: escada, taludes, campo e caminhos reconstruídos sobre a nova malha; praça branca removida em favor do terreno texturizado.
- `components/canvas/openGroundTextures.ts`: novos perfis de superfície reaproveitando a política de sampling atual.
- `data/commercialTrees.ts`: nova área `ARENA_SECTOR` com blueprints marcados como `FIELD_REVIEW_RECOMMENDED`.
- Testes: extensão de `src/test/commercialMapSpatialSurface.test.ts` (ou suíte nova) cobrindo perfil de degraus, continuidade de cota e footprint do campo.
