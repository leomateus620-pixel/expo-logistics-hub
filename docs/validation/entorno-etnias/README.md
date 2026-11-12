# Implantação 3D ao lado das Etnias

Na vista de cima com a avenida no topo, a área fica depois da última faixa residencial da Rua Fenasoja (Q5) e antes da lateral de `NationsDistrict`, com a Avenida dos Imigrantes na frente e a faixa arborizada no fundo. Na cena, a origem da implantação é `[10.36, 27.49]` em `[X, Z]`, calculada de `[3825, 4235]` pela função `officialPdfPointToLocal`. X cresce em direção às Etnias, Z avança da avenida para o campo e Y é a altura.

A rota `/mapa-comercial` abre o `CommercialMapCanvas` após a verificação de `map.view`. Na comparação inicial, `territoryContext.generated.json` e `territoryRoadSource.json` não forneciam edificações nem o acesso interno da área. O perímetro fica dentro da faixa de contexto carregada. A Q5 em `lateralResidentialDistrict.ts` continha duas aproximações genéricas do mesmo conjunto deslocadas para o lado das residências. A vista de cima do mapa confirmou os dois volumes, seus acessos independentes e o vazio a leste deles.

`EtniasAdjacentSiteLayer` substitui essas duas aproximações e seus pátios na ambientação exterior `residential-district`. As seis residências da Q5 e as estruturas de `NationsDistrict` continuam com suas implantações de origem. A camada acompanha a visibilidade do contexto, e as copas acompanham o controle de vegetação. Os objetos são apenas visuais e dispensam raycast. Os lotes e a circulação oficial continuam vindo das fontes do mapa.

## Alinhamento e escala

Os anexos 1 e 2 foram usados para localizar a faixa na vista 3D do parque. O anexo 3 orientou o recorte, e o 4 forneceu a projeção dos telhados e caminhos. A vista consultada em 12/11/2026 mostrou a imagem de 19/03/2026 no recorte medido. [Google Earth](https://earth.google.com/web/@-27.84285941,-54.47753886,321.50633617a,372.38827732d,35y,243.00301298h,0t,0r/data=CgRCAggBOgMKATBCAggASg0I____________ARAA)

O encaixe de cada anexo foi calculado separadamente por transformação afim usando A, B e C. D foi conferido depois. As posições em pixels são aproximadas, com origem no canto superior esquerdo de cada imagem.

| Âncora | Anexo 3 (1122 × 1402) | Anexo 4 (1122 × 1402) | Earth (1280 × 720) |
| --- | --- | --- | --- |
| A · Quina na borda da avenida junto ao limite residencial | 369, 396 | 287, 479 | 463, 255 |
| B · Quina dos fundos da última residência | 354, 909 | 287, 1118 | 475, 576 |
| C · Início da divisa das Etnias junto ao campo | 840, 900 | 887, 1119 | 771, 559 |
| D · Quina inferior direita da cobertura cinza da frente das Etnias | 969, 553 | 1051, 657 | 852, 334 |

A régua do Earth indicou **96,52 m** de B a C e **104,38 m** de A a B. Com essa escala, o erro em D foi de cerca de **5,7 m** para o anexo 3 e **4,8 m** para o anexo 4. A escala estimada por eixo foi de 0,198–0,204 m/pixel no anexo 3 e 0,161–0,163 m/pixel no 4. Ambos mantêm a ordem das âncoras sem espelhamento. A margem no ponto de conferência inclui as diferenças de captura e de leitura da quina da cobertura.

As três âncoras geográficas de `territoryRoadSource.json` e a projeção de `scripts/territory/align-osm.py` situaram a referência entre X ≈ 12 e 26,5, Z ≈ 28 a 44. Para encaixar o trecho à planta em uso, a frente foi ligada ao limite cadastral da avenida (PDF Z 4235), e o lado das Etnias foi ajustado ao limite visual existente (PDF X ≈ 4490). A implantação usa **0,15 unidade de mundo por metro**. A transição de gramado a oeste absorve a diferença de posição da faixa residencial existente. O alinhamento no satélite orienta a implantação e os afastamentos, com dimensões estimadas de modelagem.

## Geometria, grama e acabamento

| Elemento | Implantação |
| --- | --- |
| Edificação maior | Projeção de cerca de 30,5 × 32 m, aproximadamente um terço da largura da área. Alas cinza, sequência metálica clara, recuos e barra posterior de 29 × 7,4 m. |
| Edificação menor | Aproximadamente 17 × 25 m do outro lado do acesso. Cumeeira longitudinal, águas nas duas alas e reentrância com cobertura mais baixa sobre o acesso pedonal. |
| Acesso e pátio | Boca de cerca de 6,5 m na borda da avenida. O eixo afunila, inflete e termina entre as edificações. Dois caminhos claros alcançam a entrada menor. O pátio recua da implantação do Portão 3 e deixa três aberturas para árvores. |
| Estrutura isolada e equipamentos | Cobertura de 5 × 4,4 m com apoio pavimentado. Três elementos circulares claros de cerca de 2,9 a 3,8 m de diâmetro, bases baixas e um suporte vertical. |
| Vegetação | 33 árvores com posições fixas junto à avenida e ao acesso, nas laterais e na faixa posterior. As clareiras centrais ficam abertas. |

`etniasAdjacentSite.ts` concentra as cotas estimadas. As coberturas têm projeções maiores que as paredes nos beirais expostos. Os beirais principais ficam entre cerca de 3,2 e 4,3 m e a cumeeira mais alta chega a aproximadamente 5,4 m. O suporte esbelto foi representado com 8,5 m. Funções dos prédios e equipamentos, alturas, inclinações, fachadas e espécies de árvore seguem como informações a confirmar em campo.

O plano de terreno existente é a referência das fundações. Uma rampa curta leva o asfalto local à cota da avenida, e os caminhos ficam cerca de 12 cm acima da grama na escala de modelagem. O gramado usa o **mesmo atlas das Etnias**, com albedo, normal, rugosidade e variações verde/marrom na mesma fase em coordenadas de mundo. A cobertura do material alcança a borda das Etnias e se mistura com a grama exterior junto às residências e à faixa posterior. O acabamento é aplicado no plano de terreno existente.

As paredes, coberturas, pavimentos e peças pequenas são agrupados por material. A vegetação usa uma única malha instanciada e o LOD já usado no entorno. Os detalhes de fachada e equipamentos usam a histerese de distância do bairro. As duas silhuetas, as copas e os caminhos principais continuam disponíveis em todos os perfis.

## Capturas

Capturas da rota `/mapa-comercial` com sessão e dados comerciais de teste. Os pares usam as mesmas câmeras do diagnóstico local `groundQa`.

| Vista | Antes | Depois |
| --- | --- | --- |
| Superior, avenida no topo | [Abrir](antes-superior.webp) | [Abrir](depois-superior.webp) |
| Aproximação oblíqua pelo campo | [Abrir](antes-obliqua.webp) | [Abrir](depois-obliqua.webp) |
| Visão geral do parque | [Abrir](antes-geral.webp) | [Abrir](depois-geral.webp) |
| Aproximação pelo lado da avenida | | [Abrir](depois-avenida.webp) |
| Aproximação em perfil econômico | | [Abrir](depois-economico.webp) |

| Câmera | Alvo `[X, Y, Z]` | Posição `[X, Y, Z]` |
| --- | --- | --- |
| Superior | [17.6, 0, 35.7] | [17.6, 31, 35.71] |
| Oblíqua | [17.6, 0.35, 34.7] | [17.6, 14.6, 53.7] |
| Geral | [0, 0, 2] | [0, 96, 95] |
| Avenida | [17.6, 0.35, 35.7] | [31.3, 10.6, 21.7] |

## Desempenho e verificações

Chrome 157 headless em macOS com Apple M5, ANGLE/Metal, viewport de 1440 × 900 e buffer WebGL de 1440 × 828 (DPR 1). Comparação local entre a `main` em `db0ac9fd` e a revisão, com documento visível e em foco. Cada linha tem duas passagens de navegação pelo diagnóstico `TerritoryQa` por versão. Os tempos resumem o tempo médio de quadro e as consultas de tempo de GPU coletadas pelo renderizador.

| Perfil e vista | Draw calls antes → depois | Triângulos antes → depois | Quadro médio antes → depois | GPU média antes → depois |
| --- | ---: | ---: | ---: | ---: |
| HIGH · oblíqua | 395 → 399 | 684.981 → 695.944 | 16,67 → 16,67 ms | 14,20 → 17,91 ms |
| HIGH · geral | 848 → 853 | 770.129 → 771.184 | 16,69 → 16,67 ms | 17,49 → 16,01 ms |
| LOW · oblíqua | 376 → 380 | 684.962 → 695.925 | 16,67 → 16,67 ms | 6,44 → 7,35 ms |
| LOW · geral | 829 → 834 | 770.110 → 771.165 | 16,67 → 16,67 ms | 11,44 → 12,34 ms |

Em uma abertura local por versão, o primeiro quadro interativo ficou em **4,00 → 3,67 s**, e a hidratação secundária terminou em **11,25 → 12,24 s**. O inventário registrou 144 texturas nos dois lados. O P95 de quadro na aproximação HIGH foi de 18,45 → 17,50 ms. Os ensaios indicam o custo neste desktop. As consultas de GPU descartaram algumas amostras na vista geral HIGH.

O build de produção abriu em `/mapa-comercial` e o controle **Gráficos reduzidos** ativou os efeitos LOW. No enquadramento de validação, o clique em uma cobertura manteve a seleção vazia e o clique no lote vizinho abriu a seleção de Q-D-11. A roda do mouse aproximou a câmera, e o arraste mudou a vista oblíqua.

O typecheck, o build e 53 testes focados passaram. A suíte integral passou em 4.296 testes e apresentou as mesmas 91 falhas por nome na cópia da `main`. As capturas e as passagens de navegação terminaram com renderizador pronto e zero perdas de contexto.
