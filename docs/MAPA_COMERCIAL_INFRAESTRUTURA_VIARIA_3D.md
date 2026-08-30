# Infraestrutura viária 3D — Mapa Comercial Fenasoja

## Fontes de verdade

O sistema mantém a cartografia oficial 2026 como fonte geométrica. As fotografias de campo recebidas em 20/07/2026 orientam apenas a materialidade: asfalto cinza-escuro neutro, desgaste discreto, meios-fios claros e ausência de sinalização horizontal inventada. Nenhuma árvore, poste ou rua foi posicionada sem coordenada oficial.

Na recalibração cromática, a pista visível na parte superior da referência apresentou amostras próximas de RGB `70/73/80` a `75/83/86`, enquanto a versão anterior do mapa chegava a RGB `53/42/35`. A diferença confirmou excesso de vermelho e falta de azul no material anterior; o trecho marrom visto através do para-brisa não foi usado como referência de pavimento.

A malha validada contém 25 entidades `ROAD` e uma `PEDESTRIAN_PATH`. Todas permanecem no layer `circulation`, na elevação `0`, com as extrusões oficiais de `0,032` e `0,026`, respectivamente. Ruas, avenidas, alameda e rodovia continuam sendo as mesmas entidades pesquisáveis, selecionáveis e editáveis do sistema anterior.

## Continuidade do grafo viário

Quatro corredores já reservados entre quadras existiam como faixa livre, mas sem entidade viária, o que fazia a rua desaparecer visualmente no meio da quadra. Eles foram materializados como vias reais, nas mesmas bandas das ruas homônimas e com pequena sobreposição sobre as vias vizinhas para que o detector de conexões gere as interseções sem costura:

| Corredor | Faixa | Origem |
| --- | --- | --- |
| `RUA-URUGUAI-LESTE` | x `13,31 → 25,31`, z `10,10 → 11,32` | continuação leste da Rua Uruguai |
| `RUA-ARGENTINA-LESTE` | x `13,31 → 25,31`, z `16,17 → 17,56` | continuação leste da Rua Argentina |
| `RUA-MONTEVIDEU-SUL` | x `1,99 → 2,88`, z `-8,18 → 3,38` | continuação sul da Rua Montevidéu |
| `RUA-INTERNA-OESTE` | x `-24,61 → -24,20`, z `-11,45 → 3,27` | eixo entre as quadras V/Q, U/P e T/O |

A regra permanente é verificada em teste: nenhum vão livre entre quadras vizinhas (`0,3` a `4` unidades) pode ficar sem cobertura viária, e nenhum corredor pode invadir lote comercial.

## Construção geométrica

| Camada | Construção | Elevação visual | Função |
| --- | --- | ---: | --- |
| Asfalto | 21 polígonos oficiais mesclados | `0,032` | superfície viária principal |
| Emendas | patches somente em sobreposições e microfrestas até `0,042` | `+0,0025` | continuidade limpa nas interseções |
| Sarjeta | faixa coplanar interna às bordas longitudinais | superfície | transição tonal e leitura de drenagem |
| Meio-fio | prisma claro segmentado | `+0,026` | separação de lotes, gramado e estruturas |
| Caminho | polígono oficial independente | `0,026` | circulação de pedestres com material mineral |

Os meios-fios não fecham as pontas dos polígonos e são interrompidos onde outro corredor encosta ou cruza a via. Isso evita barras de concreto atravessando interseções e mantém os acessos abertos. Quatro pequenas descontinuidades já existentes na fonte são fechadas com patches mínimos: Johan Muller/Pastor Albert Lehenbauer, Gustavo Bessel/Pastor Albert Lehenbauer, Argentina/Montevidéu e Bruno Schwartz/RS 472.

## Materiais e profundidade

- Asfalto base `#4b5054`, cinza-escuro de baixo croma, com variação procedural determinística em escalas fina e ampla.
- Sarjeta `#34393d`, mais escura que a pista sem introduzir preto absoluto ou subtom marrom.
- Meio-fio `#dfe2e0`, coerente com a pintura branca vista em campo e sem brilho plástico.
- Caminho `#b8ad99`, com paginação mineral discreta para não competir com as ruas.
- Materiais não lançam sombra; recebem a sombra ambiental já existente. A profundidade vem da extrusão, sarjeta, meio-fio e oclusão, não de luzes extras.

As texturas são geradas localmente em `96 × 96`, sem download, imagem pesada ou aleatoriedade entre renderizações. O asfalto usa roughness `0,98`, relevo `0,005` e variação tonal limitada para permanecer legível sem ruído. O modo gráfico reduzido amplia o passo de amostragem dos meios-fios e omite a malha de sarjeta na cena.

## Interação preservada

O renderer compartilhado usa `NO_RAYCAST` para manter o comportamento anterior do canvas: seleção direta continua reservada aos lotes. Vias permanecem acessíveis pela busca e pelo explorador de entidades. Ao selecionar uma rua, uma sobreposição elevada e um contorno dourado reaproveitam a mesma entidade, o mesmo foco de câmera, o mesmo painel de detalhes e o mesmo fluxo de edição/persistência. Filtros, opacidade de layers e estado `match/dim` continuam aplicados ao material viário.

## Orçamento de renderização

A rede inteira é consolidada por material e layer em no máximo cinco draw calls-base: asfalto, caminho, emendas, sarjetas e meios-fios. A meta automatizada é inferior a 5.000 triângulos, sem novos shadow casters. Esse orçamento substitui a renderização individual de cada via e seus contornos, preservando `frameloop="demand"`, `AdaptiveDpr` e a navegação fluida já existentes.

## Matriz de validação

- visão geral: continuidade, contraste com quadras/lotes e leitura dos eixos;
- vista superior: fidelidade às 22 geometrias oficiais e interseções sem tampas;
- vista isométrica/elevada: espessura, sarjeta, meio-fio e sombras coerentes;
- aproximação: textura sem ruído, emendas discretas e bordas limpas;
- entidade selecionada: destaque integrado sem ocultar o asfalto adjacente;
- desktop e mobile: controles, busca, explorador e navegação sem sobreposição;
- build, TypeScript, lint e Vitest: estabilidade funcional e orçamento geométrico.

## Conexões viárias 2026.4 — publicação no banco

O canvas 3D lê exclusivamente `map_entities` + `map_entity_geometries`; o arquivo
`officialReference2026.ts` é apenas semente e nunca é projetado sobre o banco
(`reconcileExporuralReference`). Por isso corredores criados só no código não
aparecem em nenhum ângulo. Os oito trechos abaixo foram publicados no projeto
cartográfico ativo (revisão 2026.4), camada `circulation`, elevação 0 e
espessura 0.032:

| Identificador | Faixa local (x / z) | Função |
| --- | --- | --- |
| `RUA-URUGUAI-LESTE` | 13.31→25.31 / 10.10→11.32 | continuidade leste da Rua Uruguai |
| `RUA-ARGENTINA-LESTE` | 13.31→25.31 / 16.17→17.56 | continuidade leste da Rua Argentina |
| `RUA-MONTEVIDEU-SUL` | 1.99→2.88 / -8.18→3.38 | faixa oeste das Quadras F e G |
| `RUA-INTERNA-OESTE` | -24.61→-24.20 / -11.45→3.27 | corredor entre V/U/T e Q/P/O |
| `PRACA-ACESSO-EXPORURAL` | 8.95→13.92 / -11.59→-7.66 | conexão ao lado do Espaço Mirante com o início da Exporural |
| `RUA-INTERNA-QUADRA-G` | 4.41→5.93 / -7.66→-3.03 | corredor vago da Quadra G (Bolívia ↔ Chile) |
| `RUA-INTERNA-QUADRA-T` | -34.93→-33.58 / -11.59→2.90 | Q-V-06 até Q-T-12 (Paraguai ↔ Brasil) |
| `RUA-LESTE-EXPORURAL` | 56.55→57.08 / -37.31→-26.47 | Q-R-55 até Q-S-19 (Johan Muller ↔ Bruno Schwartz ↔ Ubiretama) |

Nenhuma faixa invade lotes: a checagem de colisão contra `SELLABLE_LOT`,
`INTERNAL_STAND`, pavilhões e atrações retorna zero interseções, e o teste
`commercialMapRoadInfrastructure` cobre continuidade e não invasão.
