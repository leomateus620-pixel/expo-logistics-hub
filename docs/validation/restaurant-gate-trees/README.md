# Restaurante, Portão 2 e árvores internas — evidência de validação

Esta ampliação integra a PR #173. A referência anterior à ampliação é o commit `9ddda43f`, que já contém a correção da Avenida Benvenuto, do corredor B1/B2 e do recorte verde B14/B12. Não comparar estas novas alterações com uma captura anterior à correção de Benvenuto.

[Abrir a galeria comparativa local](comparison.html): oito vistas antes/depois em desktop e celular emulado, além dos pares complementares de dia/noite disponíveis. A galeria usa os arquivos atuais de `before/` e `after/`; sua existência não significa que a revisão visual ou as medições tenham sido aprovadas.

## Evidência e medidas disponíveis

As seis imagens entregues nesta ampliação foram relacionadas pelo conteúdo, pois os nomes IMG citados no texto não acompanham os arquivos recebidos:

| Arquivo recebido | Conteúdo visível | Uso e limite |
| --- | --- | --- |
| `978eb6b9-b0b6-4c67-9a42-6ea7a70c0cb8.jpg` | Restaurante C2 diante de B1, câmera baixa | Proporção visual do estado anterior; não comprova dimensões reais do restaurante. |
| `1549ec64-ddc4-4ecd-a34f-989469202f92.jpg` | Calçada do Arvoredo e fila de árvores | Problema de troncos sobre a circulação e leitura da calçada. A notificação do celular não é parte da referência cartográfica. |
| `9b4b7909-a47a-4109-a891-9574f853878d.jpg` | Fotografia real do Portão 2 vista da avenida | Silhueta horizontal, apoios inclinados, passagens e atendimento. Perspectiva, vegetação e o poste ocultam partes do edifício. |
| `2a494137-55f4-4898-8e66-f98e849edf77.jpg` | Modelo anterior de A2 | Comparação do bloco baixo com a fotografia real. |
| `a08a217c-9e48-4677-9e8e-a252956d5a53.jpg` | Vista geral das árvores e restaurante | Coerência entre vegetação piloto e árvores antigas. |
| `abbb201a-5e7c-4883-9f78-aadacbfaa8d9.jpg` | Outra vista geral interna | Diversidade, volume e alinhamentos existentes. |

O cadastro é a autoridade para os footprints C2/C3, B1, A2, ruas e calçada. A fotografia de A2 orienta a arquitetura, mas não fornece escala ortográfica para medir fachada, altura, inclinação ou profundidade exatas. Os anexos do restaurante são capturas do próprio mapa, não um levantamento da construção real. Alturas arquitetônicas, espessuras, materiais, folhagem e deslocamentos localizados de troncos são estimativas de apresentação, limitadas pelos polígonos e clearances existentes.

## Responsabilidade de cada camada antes da edição

| Área | Fonte e camada visual | Contrato preservado |
| --- | --- | --- |
| C2/C3 | `utils/fenasojaRestaurant.ts` unifica a apresentação; `StrategicLandmarks.tsx` constrói o salão, telhados e detalhes | Dois footprints oficiais continuam no cadastro; uma apresentação identificável como C2 mantém C3 pesquisável, entrada para a Calçada do Arvoredo e seleção existente. |
| Calçada do Arvoredo | Entidade `CALCADA-ARVOREDO` / `RoadInfrastructure`; refinamento em `restaurantFrontage.ts` e `RestaurantFrontageLayer.tsx` | O piso detalhado, aberturas e solo devem coincidir com troncos; não deslocar a entidade pedonal nem criar uma segunda identidade comercial. |
| Árvores do Arvoredo e do bosque de A2 | `commercialTrees.ts` → seleção espacial → `CommercialTreeLayer` | IDs e quantidade permanecem; somente os 12 troncos do Arvoredo e 3 junto a A2 recebem posição corrigida com origem preservada. |
| A2 | Âncora e orientação em `parkAccessSpatialPlan.ts` / adaptador; arquitetura agrupada em `parkAccessArchitecture.ts`; desenho em `ParkAccessInfrastructure.tsx` | A entidade A2 continua selecionável na mesma posição cadastral; passagem e ligação com o Caminho do Bosque continuam disponíveis. |
| Árvores canônicas internas | `CommercialTreeLayer`, inventário em `commercialTrees.ts`, elevação em `treeLayer.ts` | 274 registros canônicos. Exclusões de apresentação já existentes continuam independentes da conservação do inventário. |
| Árvores piloto | `VegetationPilotTreeLayer`, `vegetationPilotAssets.ts`, `vegetationPilotMaterial.ts` | 74 registros canônicos em Quadras A/B e estacionamento de expositores/visitantes, subconjunto do total de 274, não um inventário adicional. Três famílias, atlas compartilhado e instanciamento existentes. |
| Árvores ambientais do acesso | `ParkAccessEnvironmentLayer` / `resolveParkAccessEnvironmentPresentation` | 23 instâncias determinísticas em ambos os níveis de qualidade. São ambientais, não entidades comerciais. |
| Árvore Lunar G | `StrategicLandmarks.LunarTree` | Modelo particular do memorial/apolo, com identidade própria; recebe pequenas folhas e casca, preservando as seis massas de copa e sua âncora. Não integra os 274 registros canônicos ao redor. |
| Estacionamento posterior | `rearParkingVegetation.ts` → `reconcileRearParkingTrees` → `CommercialTreeLayer` | Inventário derivado separado: 32 candidatos, 26 após reconciliação com as entidades oficiais nesta auditoria. Ficam fora dos donos internos comprovados nesta intervenção. |
| Vegetação externa | `RearParkEnvironmentLayer`, `RegionalLandscapeLayer`, `TerritorialEnvironment`, bairro residencial e `exteriorVegetation.ts` | Árvores do corredor parque–BR-472, do bairro e da paisagem regional não recebem o novo material por compartilhamento genérico. |

`ExporuralLandscape` desenha terreno, bordas, taludes e poço; não é um segundo sistema de árvores.

No commit de referência, o restaurante limitava a altura visual a 1,1–1,3 unidade; o salão ocupava 60% da profundidade, paredes 44% da altura e a elevação do telhado 36%. Estes são parâmetros de apresentação do código, não metros medidos no local. A geometria de A2 já usava altura inferida de 4,5 m, mas concentrava a fachada em fechamento opaco; a deficiência não se resolve apenas multiplicando sua escala.

## Arquitetura implementada nesta ampliação

### Restaurante e Calçada do Arvoredo

O salão mantém exatamente o footprint unificado C2/C3 e a fachada voltada à Calçada do Arvoredo. O volume principal passa a ocupar 74% da profundidade do modelo, conservando o espaço da varanda no mesmo polígono. A comparação oblíqua intermediária ainda mostrava o restaurante muito baixo junto a B1; a segunda revisão elevou principalmente as paredes e a varanda, com menor variação da elevação do telhado. Pelas coordenadas oficiais e pelos parâmetros atuais, a cumeeira de C2 fica em aproximadamente **76% da altura visual de B1**. Essa relação é uma escolha de apresentação estimada, não uma medida obtida das fotografias.

`fenasojaRestaurant.ts` fornece as dimensões independentes para paredes, cobertura, varanda, pilares e aberturas; `StrategicLandmarks.tsx` recompõe essas peças sem aplicar escala global. Portas e janelas têm limites próprios para não crescer na mesma proporção do pé-direito. O avental e os guarda-sóis permanecem contidos no footprint, e o poste decorativo antes situado no eixo central da entrada foi removido. Os enquadramentos 02/03 da galeria registram a proporção antes/depois com câmera e alvo idênticos.

A laje da Calçada do Arvoredo tem **12 aberturas geométricas reais**, construídas por `restaurantFrontageGeometry.ts`. Cada canteiro mede .32 unidade do mapa para caber entre o par de troncos mais próximo, sem mover árvores adicionais ou sobrepor os aros. O solo fica em .030, abaixo do topo de concreto .039 e acima do piso cadastral .026. Essas cotas são parâmetros da apresentação local, não cotas altimétricas levantadas. Os aros usam quatro segmentos por abertura em um único grupo instanciado; o solo também é instanciado. As juntas são interrompidas no contorno dos canteiros, e os três arbustos remanescentes ocupam apenas os espaços com folga.

A identificação selecionável continua pertencendo à entidade pedonal existente. `VisitGroundingSystem.ts` usa as mesmas aberturas e cotas de solo; `VisitWorld.ts` modela o salão, anexo e pilares a partir do layout, permitindo circular pela varanda em vez de bloquear todo o retângulo cadastral.

### Portão 2 — A2

`parkAccessArchitecture.ts` reconstrói a cobertura e a platibanda horizontais, quatro apoios inclinados, o atendimento central com paredes separadas e esquadrias recuadas e as duas passagens abertas. A face +Z está voltada para a avenida, com a orientação explícita no plano e no adaptador. Âncora e identidade cadastral A2 são preservadas. Os valores 22 × 5,5 m e 4,5 m de altura continuam sendo estimativas arquitetônicas do plano existente; não foram medidos a partir da imagem em perspectiva.

`ParkAccessInfrastructure.tsx` usa o recurso oficial FENASOJA já existente no projeto, sem datas ou publicidade histórica, em uma textura de 512 × 128 e um desenho adicional para a marca. O piso de chegada do próprio plano foi conectado à borda exata da avenida, na mesma cota .044, para evitar uma faixa verde atravessando o acesso.

A chegada genérica do Modo Visita usava o pequeno losango cadastral A2 e colocava o visitante atrás do atendimento. `VisitSpawnManager.ts` agora resolve o ponto de chegada pela passagem direita voltada à avenida, pela mesma API usada nas entradas reais de Visita. Os apoios inclinados e as paredes têm colisões correspondentes em `VisitWorld.ts`. O roteiro complementar registrou a travessia da passagem, seleção e iluminação nos dois perfis, além do cancelamento de toque no mobile emulado; resultados em [RESULTS.md](RESULTS.md).

### Vegetação interna e memorial G

`internalTreeVisuals.ts` delimita a aplicação pela propriedade espacial já documentada abaixo. As árvores canônicas conservam suas variações por espécie/ID e as massas de copa existentes; a apresentação interna usa troncos proporcionais em tons de madeira, ramificações e lóbulos de folhagem com planos estáticos distribuídos em volume. O atlas compartilhado de 256 × 256 tem folhas pequenas irregulares, com cobertura alfa preservada nos mipmaps. A geometria é instanciada e não realiza atualização por folha a cada frame.

`CommercialTreeLayer`, `ParkAccessEnvironmentLayer` e `VegetationPilotTreeLayer` mantêm suas responsabilidades. O sistema piloto conserva suas três famílias e materiais/atlas próprios; a harmonização não converte todo o parque em um modelo único. O inventário completo das árvores canônicas permanece em todos os níveis de qualidade, enquanto o detalhe secundário segue o LOD de cada sistema. Posições, bases e colisões usam as mesmas fontes determinísticas; a troca de qualidade não cria uma nova distribuição de árvores.

A Árvore Lunar **G** recebe a linguagem de folhas e casca interna no modelo próprio de `StrategicLandmarks.LunarTree`, mantendo suas seis massas de copa e a composição do memorial. A identidade G, a clareira, o foguete e sua interação permanecem separados das árvores canônicas. Nenhuma destas mudanças autoriza aplicar o novo material às árvores do bairro, dos Costeiros ou da paisagem regional.

## Delimitação das árvores internas

O repositório não oferece um único perímetro topográfico completo do parque. `internalGroundCoverage.ts` delimita donos positivos do piso e declara que os limites de câmera/CORE não são um perímetro. Por isso a seleção visual usa:

- Polígonos internos já existentes: quadras, estacionamentos canônicos, Praça das Nações, bosque, Arena, Calçada do Arvoredo, Rua Brasil, Rua Argentina e Área Motorhome.
- As aberturas de solo das duas árvores do pátio B1/B14/B12.
- Pontos exatos dos registros já classificados como árvores internas nas bordas B22/bosque/Rua Brasil/Praça das Nações, onde a cobertura do piso termina antes do tronco. Não há faixa genérica de proximidade nem expansão retangular do parque.
- Os cinco pontos determinísticos das faixas de plantio do acesso a B22.

A auditoria inicial das máscaras de piso deixava 25 registros internos fora da linguagem nova. A seleção corrigida cobre os **274 registros canônicos**. Entre as **23 árvores ambientais**, **13** pertencem aos donos internos e **10** das faixas externas da via dos Costeiros conservam a apresentação anterior. Isso não muda nenhum ponto, ID ou contagem ambiental.

`tree-inventory-before.json` foi produzido importando as fontes exatas de `git show 9ddda43f:<arquivo>`, sem usar o arquivo atual alterado. Inclui IDs, posições de origem e locais, raios canônicos e as duas listas ambientais. `tree-scope-audit.json` registra os 13/10 pontos ambientais cobertos/excluídos pelo novo seletor.

Os únicos registros autorizados a mudar de posição são:

- Arvoredo: `tree-i-01..06`, `tree-i-08`, `tree-j-04..08` (12).
- A2: `tree-pavilions-1-14-56..58` (3).

A fonte anterior fica em `previousSourcePosition`. Os 259 demais registros conservam posição de origem/local e raios; a redução visual do tronco não altera o cadastro.

## Reprodução das capturas e medições

A primeira inspeção posterior revelou repetição de galhos verticais com folhas grandes, parecendo espigas. A correção usa um atlas interno de 256² com 64 folhas pequenas em arranjo irregular e 40 cards tangenciais por lóbulo (80 triângulos, sem aumentar o orçamento). O giro das faces e o atlas quebram a repetição; faces voltadas para dentro não são rasterizadas. O atlas piloto e as árvores externas permanecem independentes. Essa decisão reduz a área de cards e o trabalho desnecessário de frente/verso; seu efeito medido é registrado por percurso e perfil em [RESULTS.md](RESULTS.md), sem extrapolação para outros aparelhos.

A folhagem interna usa iluminação difusa Lambert e recorte alfa, sem BRDF especular por fragmento; troncos conservam o material PBR. Sombras projetadas das copas canônicas são reservadas aos perfis HIGH/ULTRA. Em MEDIUM/LOW permanecem árvores completas, troncos, ramos e contatos no solo: o perfil não altera pontos, colisões ou inventário. As árvores piloto e externas mantêm suas políticas. A Árvore Lunar, que tem uma API própria sem perfil adaptativo, conserva as sombras existentes do único memorial.

O roteiro está em `scripts/commercial-map-performance/restaurant-gate-trees.cjs`. Usa o Canvas e os controles existentes, com instrumentação opt-in da página de diagnóstico. Os oito enquadramentos fixos cobrem restaurante aéreo/oblíquo/baixo, Arvoredo, A2 frontal/lateral, árvores gerais e bosque ao nível do solo. Há ainda capturas noturna e de Modo Visita.

Após atualizar as capturas, execute `node scripts/commercial-map-performance/restaurant-gate-gallery.cjs` para regenerar `comparison.html`. A galeria não usa servidor, bibliotecas externas ou imagens remotas. Ela sempre lista as oito vistas por perfil, sinaliza arquivos ausentes e inclui inspeções complementares somente quando ambos os PNGs do par dia/noite existem. Os pares complementares não são apresentados como comparação antes/depois quando pertencem somente ao build atual.

As capturas anteriores já estão em `before/`: desktop 1440 × 900 e celular **emulado** 390 × 844, ambos em Chrome 154 / ANGLE D3D11 / Intel UHD, nova sessão por perfil, sem limitação artificial de rede. O servidor da referência entrega build de produção imutável de `9ddda43f`.

O roteiro mede entrada até pronto/hidratação completa, três trechos determinísticos de navegação de oito segundos, draw calls, triângulos, contagens de recursos e estimativas de bytes de buffers/texturas. A memória estimada é calculada a partir dos recursos JavaScript da cena; **não é medição de VRAM real do driver**. Os resultados abaixo e em [RESULTS.md](RESULTS.md) usam o mesmo roteiro e os mesmos enquadramentos; cache do driver, temperatura e carga do sistema não são totalmente controlados. A emulação não comprova desempenho de um celular físico.

## Estado da validação desta ampliação

Arquivos principais: `fenasojaRestaurant.ts` e `StrategicLandmarks.tsx` controlam as proporções arquitetônicas; `restaurantFrontage.ts`, `restaurantFrontageGeometry.ts` e `RestaurantFrontageLayer.tsx` controlam piso/canteiros; `parkAccessSpatialPlan.ts`, seu adaptador, `parkAccessArchitecture.ts` e `ParkAccessInfrastructure.tsx` controlam A2. `commercialTrees.ts`, `internalTreeVisuals.ts`, `CommercialTreeLayer.tsx`, `ParkAccessEnvironmentLayer.tsx` e `vegetationPilotAssets.ts` delimitam inventário e apresentação vegetal. `VisitWorld.ts`, `VisitGroundingSystem.ts` e `VisitSpawnManager.ts` mantêm apoio, colisões e chegada coerentes com os modelos.

O teto de triângulos da infraestrutura passou de 6.000 para 6.200 para incluir os quatro apoios e as aberturas de atendimento de A2, e seu teto de draws primários passou de 12 para 13 por causa da placa oficial. A vegetação ambiental usa um lote adicional para separar folhas internas das árvores externas preservadas. Esses custos explícitos são medidos na cena completa, sem esconder a ampliação em expectativas antigas.

130 testes em 17 arquivos passaram (`final-tests.json`), incluindo os quatro contratos de Benvenuto, C2/C3, A2, chegada e travessia dos vãos, vegetação, inventário espacial, apoio dos pés e a borda contínua do concreto B14/B12. TypeScript, ESLint dos arquivos alterados, build normal de produção e build com diagnóstico passaram; tempos e códigos de saída estão em `build-checks.json`. O teste piloto de solo foi repetido isoladamente após exceder seu limite de 30 s com dois workers; passou sem mudança de expectativa. A rodada final usa um worker e passou integralmente.

A revisão intermediária encontrou dois problemas, documentados em `diagnostics/`: folhagem repetitiva com queda de FPS no desktop e chegada de A2 atrás da parede. A versão intermediária foi rejeitada. O material interno passou a difuso com recorte alpha, cards menores orientados para fora, atlas irregular e projeção/recepção de sombras de copa somente em HIGH/ULTRA; troncos, ramos e contato permanecem nos perfis menores. A chegada canônica A2 passou para a abertura voltada à avenida e o teste exige atravessá-la.

Na rodada final deste percurso, os oito enquadramentos têm diferenças de câmera/alvo exatamente zero nos dois perfis. FPS desktop: 27,517 → 34,459; mobile emulado: 53,480 → 56,550. P95: 40,200 → 30,700 ms no desktop e 22,700 → 19,500 ms no mobile. Tempo até mapa pronto: 21,665 → 14,241 s no desktop e 18,755 → 15,183 s no mobile. Esses números são observações locais, sujeitas a aquecimento e carga do sistema; não se declara ganho generalizado de fluidez ou carregamento. A avaliação também inclui o [percurso independente de Benvenuto](../benvenuto/RESULTS.md). A versão descartada de 22,209 FPS está em `diagnostics/intermediate-desktop.json`.

Os smokes C2/A2 passaram nos dois perfis, incluindo seleção, câmeras iguais dia/noite, chegada pela avenida, travessia efetiva da passagem e retorno. O mobile emulado também registrou toque cancelado sem deriva. Canvas/renderer/controles permanecem 1/1/1. Os seis registros de recursos aquecidos são idênticos em cada perfil: 606/138/240 no desktop e 590/137/240 no mobile (geometrias/texturas/programas). Não houve erro de página. [RESULTS.md](RESULTS.md) contém entrada, draw calls por percurso, buffers, estimativas parciais de texturas e todos os resultados de interação.

Inspeção das capturas: C2 tem maior presença junto a B1, com varanda e aberturas recompostas; as árvores do Arvoredo coincidem com os canteiros e a passagem permanece livre. A2 mostra a fachada, profundidade dos vãos e conexão pavimentada; a chegada deixa de mostrar uma parede preenchendo a tela. Copas internas têm folhas menores e silhuetas variadas. A noite conserva a iluminação existente, sem novas luzes; o portão permanece uma área pouco iluminada do parque. Nenhuma medida arquitetônica estimada substitui um levantamento real.


A fonte final está identificada em `candidate-source.json` pelo commit `a56197e5` e hashes LF. A última indicação do usuário alinhou a borda B14/B12 e transferiu sua antiga saliência de concreto para o asfalto existente. Os JSON anteriores à alteração permanecem em `diagnostics/pre-alignment-*`; contêm também resultados desfavoráveis, sem substituição seletiva. As vistas retrato 09/10 complementam o enquadramento das estruturas inteiras e não participam das medições de FPS.
