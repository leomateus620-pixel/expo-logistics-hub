# Implantação permanente — ExpoRural, 25/10/2026

Revisão de apresentação `2026-10-25-exporural-scene.1`, sobre a revisão cadastral `2028-exporural-2026-10-20.1`. Base Git consultada: `d1490efe58f130d107faaec1affc6e008182bcd1`. O replay de outubro foi confrontado com leitura de produção pelo conector Lovable durante esta implementação: os polígonos de Q-R-01 e Q-R-34 coincidem. Nenhuma migração ou gravação comercial foi executada para estas correções.

A referência estática `OFFICIAL_REFERENCE_DATA` ainda contém retângulos antigos da ExpoRural: ela não foi usada para inferir a posição dos lotes atuais. O modelo elétrico especial só é aplicado quando seu envelope cabe em Q-R-34 carregado, evitando deslocá-lo para o antigo Q-R-36 da referência. Os dados persistidos continuam responsáveis pelas superfícies, identificação e métricas.

## Referências e confiança

Foram disponibilizados oito arquivos, apesar de o texto referir nove anexos. As funções foram reconhecidas pelo conteúdo: capturas 01.27.06/01.27.11 mostram os postes; 01.27.40 mostra Q-R-01; 01.39.19 mostra a árvore aérea; 01.41.03/01.41.09 mostram a área exterior; as duas fotografias WhatsApp 01.31.28/01.31.41 mostram o transformador. Não foi necessário o arquivo adicional `image-edit-target-aaec2a32615bf657.png`, ausente da lista efetiva.

Confiança: **implantação interpretada das fotos e registrada na cena**. Os nomes das ruas, divisas, IDs e alturas de superfície foram conferidos nos dados. Recuos, copa, proporções dos apoios e equipamento são dimensões de apresentação; não equivalem a levantamento topográfico ou especificação elétrica. A rua horizontal de referência de Q-R-01 é **Rua Gustavo Bessel** (`RUA-GUSTAVO-BESSEL`); Pastor Alberto Lehnenbauer é a via perpendicular.

## Árvore

- Identidade única: `tree-exporural-r01-01`; área explícita `EXPORURAL`, sem atribuição fictícia às quadras D/I/J/E.
- Apoio: `Q-R-01`, entidade `7cbfc7ab-a8fe-4643-ac8b-b9d2b2a63791`; área oficial preservada: **896,85 m²**.
- Tronco local: **x 8,625689; z −18,940**. Altura resolvida neste snapshot: **y 0,134**, incluindo folga de 0,004 sobre a extrusão de 0,13.
- Alinhamento: `pole-ref-146`, x 8,625689; z −20,565995, do outro lado da Gustavo Bessel.
- Copa de raio nominal 1,02, tronco nominal 0,14, fuste 0,72, copa 1,48 unidades locais. A camada existente aplica o afinamento visual do tronco e as folhas instanciadas; somente este exemplar recebe escala local dos lóbulos. Nenhuma espécie é inferida. A revisão após o close oblíquo aumenta a escala dos agrupamentos (.86→.99), equivalente a cerca de 32% na área nominal da escala, sem medir cobertura visual e afina o tronco local (.18→.14), conservando os centros dos lóbulos e os espaços entre massas.
- A seleção autoriza a árvore por Q-R-01 no mapa completo e no recorte ExpoRural. A altura acompanha a superfície atual, inclusive elevação/extrusão diferentes; sombra e controle de vegetação usam o caminho existente. Raycasts decorativos permanecem desativados.

## Elétrica

O sufixo de `pole-ref` é identidade do inventário, não número de lote. As indicações visuais do pedido foram mapeadas por posição e pelas projeções já aplicadas pelo resolvedor. As células históricas do PDF não coincidem com a numeração persistida de outubro, razão pela qual a associação anterior apresentava os postes em Q-R-34/35/37 nas divisas das faixas mencionadas pelo usuário.

| Marcador fonte | x/z fonte preservado | x/z renderizado anteriormente | Revisão de apresentação |
| --- | --- | --- | --- |
| `pole-ref-134` | 28,699080 / −20,700025 | 30,121539 / −20,714143 | Apoio alto esquerdo em 30,680 / −21,050 |
| `pole-ref-135` | 28,973869 / −20,699939 | 31,785235 / −20,727841 | Apoio alto direito em 31,080 / −21,050 |
| `pole-ref-136` | 33,045056 / −20,694770 | 35,109843 / −20,715240 | Retirado somente da apresentação; terminal substituído pelo direito |
| `pole-ref-138` | 36,334739 / −20,650875 | 36,767905 / −20,655155 | Preservado, dentro de Q-R-38 |

Conjunto `exporural-r34-transformer-assembly`: centro **x 30,880; z −21,050**, apoio **Q-R-34**, entidade `300b4d2d-6313-4e91-8673-4649e5816245`, y **0,036** no snapshot. Envelope x **30,48–31,28**, z **−21,30–−20,73**, integralmente dentro do lote. Dois apoios altos de 1,68 e apoio central frontal de 0,84; plataforma a 0,82; tanque de 0,36. Postes retangulares afunilados, recortes/perfurações de apresentação, bases claras, plataforma, mãos francesas, tanque compacto, tubos de refrigeração, buchas, cruzetas e braço curvo de iluminação.

O inventário PDF original permanece intacto. A seleção aplica um grafo de apresentação: mantém os dois IDs fonte como terminais dos apoios altos, elimina a autorreferência que resultaria da substituição de 136 por 135, redireciona a ligação 139 para 135→138 e acrescenta uma ligação local 134→135 identificada como `PHOTO_PRESENTATION`. Os demais vãos conservam seus registros. As cruzetas dos dois terminais obedecem ao eixo físico do conjunto e os fios são calculados a partir das posições resolvidas.

Quatro geometrias mescladas, quatro materiais compartilhados com a camada elétrica, sem loop próprio. O componente descarta apenas suas geometrias; a camada elétrica é proprietária dos materiais. A árvore entra nas instâncias existentes. Os números de draw calls são orçamentos de construção; a medição integrada consta da evidência geral.

## Vista superior e verificação

[Vista superior vetorial de implantação](implantacao-permanente.svg): divisas atuais, árvore, poste de alinhamento, postes anteriores, conjunto e poste preservado. Os eixos são locais x/z, sem atribuir norte a “acima” dos anexos.

Executados: `commercialMapTrees`, `commercialMapTreePresentation`, `commercialMapTreeSurfaceResolver`, `commercialMapTreeControls`, `commercialMapInternalVegetationScope`, `commercialMapPavilion12FrontTrees` e `exporuralSceneCorrections`: **50 testes aprovados em sete arquivos**. Os quatro testes novos cobrem unicidade/escopo/apoio da árvore, envelope do conjunto, preservação de Q-R-38, integridade dos terminais, imutabilidade de dados e recusa da geometria antiga.

`commercialMapElectricalInfrastructure`: 13 aprovados e duas falhas preexistentes, reproduzidas no checkout original: projeção de fachada de `transformer-ref-007` e 996 violações históricas da verificação geral de folga dos fios. Essas falhas usam o inventário cru original, fora do adaptador local. Não foram alteradas expectativas para mascará-las. Registro inicial: `/tmp/exporural-baseline-tests.log`, com ambas as falhas; o relatório geral deve consolidar o resultado final de toda a suíte.

O typecheck passou após as correções permanentes; a validação integrada do ciclo e da câmera é relatada separadamente. As capturas reais antes/depois são produzidas pelo harness de revisão de outubro; este documento não declara publicação em produção.
