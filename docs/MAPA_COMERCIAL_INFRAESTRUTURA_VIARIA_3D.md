# Infraestrutura viária 3D — Mapa Comercial Fenasoja

## Fontes de verdade

O sistema mantém a cartografia oficial 2026 como fonte geométrica. As quatro fotografias de campo recebidas em 20/07/2026 orientam apenas a materialidade: asfalto carvão com subtom terroso, desgaste discreto, meios-fios claros e ausência de sinalização horizontal inventada. Nenhuma árvore, poste ou rua foi posicionada sem coordenada oficial.

A malha validada contém 21 entidades `ROAD` e uma `PEDESTRIAN_PATH`. Todas permanecem no layer `circulation`, na elevação `0`, com as extrusões oficiais de `0,032` e `0,026`, respectivamente. Ruas, avenidas, alameda e rodovia continuam sendo as mesmas entidades pesquisáveis, selecionáveis e editáveis do sistema anterior.

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

- Asfalto base `#453a35`, com variação procedural determinística de baixa frequência, alta rugosidade e relevo sutil.
- Sarjeta `#302b29`, suficiente para marcar a borda sem desenhar uma faixa artificial.
- Meio-fio `#ddd8cb`, coerente com a pintura branca vista em campo e sem brilho plástico.
- Caminho `#b9ad98`, com paginação mineral discreta para não competir com as ruas.
- Materiais não lançam sombra; recebem a sombra ambiental já existente. A profundidade vem da extrusão, sarjeta, meio-fio e oclusão, não de luzes extras.

As texturas são geradas localmente em `96 × 96`, sem download, imagem pesada ou aleatoriedade entre renderizações. O modo gráfico reduzido amplia o passo de amostragem dos meios-fios e omite a malha de sarjeta na cena.

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
