# Correção espacial do entorno da Arena Sicredi – Icatu

## Diagnóstico verificado no código

- A malha de terreno natural (`ARENA_FRONT_LAYOUT.terrain.sourceBounds = [4106, 2400, 4912, 3110]`) cobre integralmente a escadaria (`[4120, 2720, 4480, 3070]`) e a praça pavimentada (`[4116, 2682, 4888, 3100]`). É essa sobreposição que coloca grama sobre degraus, patamares e acesso de concreto da Arena.
- O campo de futebol está em `[4138, 2425, 4477, 2636]`, ou seja, a **oeste/noroeste**, encostado no cinturão de lotes da Exporural — exatamente o erro apontado.
- A Arena (entidade `F`, `officialReference2026.ts:581`) ocupa `[4900, 2690, 5385, 3130]`, portanto **a leste** da praça. Nas referências aéreas o campo aparece junto à Arena (lado nordeste/leste), não a oeste.
- Caminhos (`walkways`) e maciços arbóreos (`treeClusters`) foram distribuídos em função do campo errado e cruzam praça e escadaria.
- A face traseira/lateral da Arena (x > 5385) está fora do terreno modelado — daí o plano genérico remanescente.

## O que será feito

### 1. Referencial espacial único
Criar um módulo de zoneamento (`data/arenaSectorZoning.ts`) com os polígonos de cada zona no mesmo espaço de origem do PDF oficial, ancorado em três pontos estáveis: footprint da Arena (`F`), limite do estacionamento adjacente e o traçado das ruas Brasil/Brasília. Todas as superfícies passam a ler desse arquivo — nada mais é posicionado por estimativa isolada.

Zonas mapeadas: footprint da Arena, frente e fundos, praça/acesso de concreto, escadaria, quadra poliesportiva, quadra de vôlei, campo de futebol, estacionamento adjacente, lotes Exporural, Churrascaria, vias e circulação, grama, solo compactado, vegetação, perímetro traseiro.

### 2. Remoção do que está errado
- Recortar do terreno natural, por furos de polígono reais (não por plano sobreposto), a escadaria, a praça, o acesso da Arena, as quadras, as vias e os lotes.
- Excluir por completo o campo de futebol na posição atual — geometria e materiais, sem deixar malha oculta sob outra superfície.
- Recalcular caminhos e maciços arbóreos que existiam só para servir o campo antigo.
- Descarte explícito de geometrias/materiais/texturas substituídos.

### 3. Escadaria e acesso de concreto
- Degraus, espelhos, patamares e base permanecem 100% concreto, com o perfil rebaixado já implantado (18 × 0,032).
- Máscara de concreto com borda limpa: a grama não invade tread nem risers.
- Amarração do primeiro e do último degrau nas cotas reais do terreno vizinho, sem degrau flutuante, borda enterrada ou z-fighting.
- Acesso principal da Arena permanece pavimentação contínua e desobstruída.

### 4. Reposicionamento do campo
- Novo footprint definido a partir do footprint da Arena e do estacionamento adjacente, na área atrás/ao lado da Arena indicada nos anexos 4 e 5 — nunca junto aos lotes Exporural, nunca sobre vagas, quadras ou acesso.
- Caráter informal: grama natural com variação verde/marrom, marcação branca discreta e desgastada, transição suave para solo e vegetação. Traves apenas se a referência sustentar.

### 5. Fundos e laterais
Estender o terreno modelado para todo o perímetro visível: fundos da Arena, lateral do estacionamento, transição campo↔estacionamento, borda externa do parque e ligações laterais com o restante do mapa. Combinação de grama, grama desgastada, solo compactado avermelhado, cascalho e concreto — sem planos brancos/cinza únicos em nenhum ângulo normal de câmera.

### 6. Vegetação Churrascaria / Exporural
Novos agrupamentos usando o sistema instanciado existente, apenas em faixas ambientais do perímetro: espaçamento irregular, escala e rotação variadas. Nenhuma árvore sobre lote, circulação interna, acesso ou sobre a Churrascaria.

### 7. Propriedade exclusiva de superfície
Resolvedor de zonas com prioridade fixa: estruturas > escadaria/concreto > quadras > lotes e estacionamento > vias > acesso pavimentado > campo > grama/solo > vegetação decorativa. Materiais de prioridade menor são recortados contra os de prioridade maior antes de virar geometria, com checagens de interseção em teste automatizado (grama × escadaria, vegetação × lotes, campo × estacionamento/quadras, coplanaridade duplicada).

### 8. Preservado sem alteração
Modelo e identidade da Arena, as duas quadras, lotes Exporural, vagas, Churrascaria, vias, seleção/edição/filtros/metadados e controles de câmera. Nada correto é movido para acomodar geometria nova.

### 9. Materiais
Reaproveitar a política já validada de `openGroundTextures.ts` (escala real, mipmaps, anisotropia, tile grande, sem cintilação a distância): concreto neutro pouco rugoso, grama natural + desgastada, solo avermelhado, cascalho de transição, vegetação instanciada com LOD e materiais compartilhados.

### 10. Responsividade e desempenho
Enquadramentos próprios para desktop amplo/padrão e mobile retrato/paisagem (FOV e distância adaptados, respeitando safe areas e o dock), gestos preservados, instancing e materiais compartilhados, sem estado React por frame e sem redução de qualidade global.

### 11. Validação obrigatória
Playwright no app real: os três ângulos dos anexos 1–3, top-down comparado aos anexos 4–5, vistas frontal, traseira e ambas as laterais, zoom próximo/médio/distante, desktop amplo e padrão, mobile retrato e paisagem — iterando até a concordância visual. Checklist final: zero grama na escadaria e no acesso, campo atrás/ao lado da Arena, nenhum campo junto à Exporural, lotes intactos, sem plano genérico, sem geometria duplicada/oculta, sem z-fighting.

## Detalhes técnicos

- Novo `data/arenaSectorZoning.ts`: polígonos por zona + prioridade + resolvedor de recortes.
- `data/parkEnvironment.ts`: novo `footballField` ancorado à Arena/estacionamento, terreno estendido aos fundos, caminhos e maciços recalculados, `PARK_ENVIRONMENT_REVISION` para `2026.8-arena-zoneamento.1`.
- `data/arenaTerrain.ts`: amostragem de cota estendida ao novo perímetro e ao novo platô do campo.
- `components/canvas/ArenaFrontInfrastructure.tsx`: terreno com furos reais, campo reposicionado, passarelas e vegetação recalculadas, descarte correto via `disposeInstancedMesh`.
- `components/canvas/openGroundTextures.ts`: perfis de cascalho/grama desgastada complementares.
- Testes: `src/test/commercialMapArenaTerrain.test.ts` e `commercialMapParkEnvironment.test.ts` estendidos com as checagens de interseção e o novo footprint do campo.
