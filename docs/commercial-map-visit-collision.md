# Modo Visita — colisão, solo e fontes

O sistema utiliza as coordenadas X/Z do mapa existente e Y como elevação. A escala de navegação é de 0,15 unidade por metro, compatível com os contratos de acesso e do bairro lateral. O personagem tem raio de 0,045 e altura de aproximadamente 0,255 unidade. As elevações do cenário são cotas de apresentação; não constituem levantamento topográfico.

## Arquitetura

- `VisitSpatialIndex`: grade uniforme imutável de 2 unidades para colisores e 3 para solo. A consulta reutiliza arrays e uma tabela de marcação para eliminar duplicados.
- `VisitCollisionSystem`: varredura contínua da projeção circular da cápsula contra prismas poligonais e cilindros, intervalo vertical do corpo, recuperação de penetração e deslizamento tangencial. Paredes finas não dependem da distância percorrida em um frame para serem detectadas.
- `VisitGroundingSystem`: polígonos de suporte, vazios, planos e triângulos de terreno derivados dos proprietários existentes. A seleção considera o topo das superfícies visíveis, com as exclusões canônicas da Arena.
- `VisitWorld`: adapta fontes canônicas uma vez por ativação e publica movimento, busca de spawn, altura, oclusão e sondagem da câmera. Não cria meshes, materiais, texturas, luzes ou outra cena.

O movimento e a sondagem da câmera usam apenas candidatos da grade. Não há `scene.children`, raycast recursivo, carregamento de física ou reconstrução de geometria visual no loop da visita.

O apoio do personagem consulta o disco de contato de raio 0,045: centro, projeções mais próximas nas bordas e contornos de vazios. Fendas menores que o pé não provocam queda entre lotes; aberturas maiores continuam sem apoio. O resultado numérico é reutilizado e as superfícies densas delegam ao índice fino. Câmera e oclusão continuam usando a altura exata do ponto, sem expandir artificialmente o terreno visível. A subida adicional de lajes cadastrais pertence somente ao suporte comercial anotado; a varredura das paredes mantém a tolerância física original de 0,045.

## Cobertura das fontes

| Elemento | Fonte e tratamento |
| --- | --- |
| Construções, pavilhões, restaurantes e sanitários | Prismas dos polígonos oficiais recebidos, com altura visual compartilhada. Interiores continuam acessíveis por ação explícita. |
| Sede Fenasoja | `complexWorldPolygon('headquarters', 'footprint')`: o polígono selecionável B12 inclui jardim e não pode ser usado como parede. Monumento com base própria. |
| Lotes externos e estandes | Fontes de solo e interação. Nunca viram colisores de edifício por terem metragens ou dados comerciais. |
| Portões 1/2/3 e Costeiros | Instâncias da arquitetura de acessos; pilares, guaritas, barreiras e cobertura mantêm intervalos verticais separados. |
| Portão 4 e Pórtico das Nações | Pilares, bases, guarita e cobertura; vão central preservado. |
| Estrutura lateral da Arena | Caixas/segmentos de `createArenaAccessLayout`: paredes, suportes, corrimãos, bicicletários e cobertura. |
| Bairro lateral | Plano numérico de `buildLateralResidentialRenderPlan`, incluindo alvenaria, paredes de terrenos, postes e troncos. |
| Contexto territorial | `TERRITORY_BUILDINGS`, troncos de `TERRITORY_TREES` e áreas de água. |
| Árvores do parque | Inventário apresentado fornecido pelo Canvas, com raio do tronco. Copas são volumes exclusivos da câmera. |
| Vegetação complementar | Fontes de acesso, área posterior, Arena e bairro, com dimensões das bases existentes. |
| Postes e transformadores | Instâncias já resolvidas por `electricalSceneLayout` no Canvas; o mundo recebe exatamente as posições renderizadas, incluindo os afastamentos de lotes e ruas da revisão #161. |
| Alameda Gastronômica D1 | Paredes, cobertura, pilares, 17 mastros e guarda-corpos do layout compartilhado; escadas, rampa e piso recortado transitáveis. A extrusão cadastral de `FOOD_AREA` não é usada como piso. |
| Sanitários E-07 | Corpo local de 1,3 × 1,8 unidade, rotação canônica e altura de apresentação compartilhada de 1,2 da revisão #160. |
| Paisagismo Exporural | Triângulos exatos de bordas, talude e terraço do gerador existente. As geometrias temporárias são descartadas após extração; uma grade interna de 0,2 unidade evita consultar todos os triângulos no parque. |
| Poço de Q-R-02 | Cercamento físico pequeno e base; a área restante do lote continua transitável. |
| Núcleo Crioulo | Segmentos de cerca registrados no distrito do Portão 4. |
| Parque de diversões | Envelopes simples das três atrações e postes da cerca. A área aberta entre atrações permanece livre. |
| Palco das Nações | Volume independente do palco distrital. |
| Ruas, estacionamento e gramados | Alturas dos polígonos e perfis compartilhados; fitas de vias particionadas espacialmente. |
| Terreno posterior | Mesmos triângulos da malha original, sem substituir sua superfície por uma fórmula lisa. |
| Solo das quadras A/B e tratamentos comerciais | Células dos dois planos canônicos que o Canvas apresenta. A/B reutiliza `quadrasABGroundVertexHeight` e os mesmos triângulos Float32; tratamentos reutilizam a elevação de cada célula. Duas grades internas de 0,4 unidade preservam os recortes sem consultar milhares de células por frame. |
| Frente do Restaurante | `buildRestaurantFrontagePlan`: gramado, laje e conector com os polígonos e elevações do proprietário visual, inclusive após a unificação C2/C3. |
| Junções, sarjetas e meios-fios | Facetas do próprio `buildRoadNetworkGeometries`, extraídas uma vez e indexadas; buffers temporários descartados. Supressões da apresentação detalhada e vias substituídas são respeitadas no parque. |
| Arena | Mesma triangulação da grade, recortes de zoneamento, degraus e patamares existentes. |
| Praça das Nações | Cotas visuais de 0,022 / 0,062 / 0,096 / 0,136 / 0,172 e polígonos das ilhas. |

## Câmera e entrada

A sondagem expande os prismas/cilindros pelo raio da câmera e intersecta primeiro o intervalo vertical do segmento. Isso permite passar acima de telhados e detecta também descidas sobre eles. O retorno é uma fração segura do segmento. A câmera retrai antes do obstáculo; o controlador decide a recuperação com amortecimento.

O mesmo segmento também consulta o campo de altura em intervalos de até 0,06 unidade nos segmentos curtos da câmera, refinando a primeira interseção por busca binária. Há um limite de 2.048 amostras; raios acima de 122,88 unidades usam espaçamento maior. Assim, um talude entre personagem e câmera continua bloqueando a lente mesmo quando os dois extremos estão livres. Superfícies funcionais publicam um limite superior comprovado; segmentos inteiramente acima desse limite dispensam a amostragem. A oclusão de POIs usa amostragem separada, apenas na cadência de interação.

Copas de árvores não bloqueiam a cápsula, mas participam da sondagem da câmera e da altura máxima de passagem aérea. A espécie `scrub` da área posterior representa arbustos baixos: somente esses volumes pequenos de folhagem, nas mesmas dimensões visuais, também bloqueiam o corpo para impedir que a cabeça entre no arbusto. Os corredores viários mantêm a folga existente da fonte. O spawn deve ter cápsula livre e coluna de chegada aérea desobstruída. A busca mantém o ponto próximo ao destino e falha explicitamente quando não encontra posição segura, em vez de colocar o visitante dentro de um objeto.

`VisitCameraFlight` certifica todos os segmentos antes de iniciar a transição. Se a câmera estiver debaixo de uma cobertura, procura primeiro um desvio lateral e uma coluna livre. A chegada em terceira pessoa é validada na posição efetiva da lente, não apenas na coluna do personagem. Cada quina do percurso aparece por pelo menos um frame, evitando cortar uma diagonal através do obstáculo. Poses já inseridas em geometria ou espaços sem saída certificável interrompem a tentativa, sem publicar uma posição final por teleporte.

As camadas de vegetação dos acessos e da área posterior preservam a mesma posição dos troncos em todos os perfis, tanto no mapa tradicional quanto na visita. A política técnica pode simplificar a malha e o orçamento de sombras, mas conserva o inventário e a identidade das plantas. Isso evita que mudanças de espaçamento do gerador reduzido deixem um colisor onde já não há árvore. O LOD comercial e o piloto já preservavam seu inventário completo. Não foi implementada remoção dinâmica de troncos por distância.

O mesmo princípio se aplica à disposição física do solo das quadras A/B e dos tratamentos comerciais. A política final de paridade mantém suas células canônicas completas em todos os perfis técnicos e nos dois modos; os parâmetros legados `reducedGraphics` e `preserveVisitGroundPlacement` permanecem compatíveis, sem alterar essa disposição. Na referência oficial, tanto a visita quanto o mapa tradicional em LOW têm 1.052 células A/B e 542 células de tratamentos: a diferença de triângulos de suporte entre os modos é zero, sem novos grupos de material do solo. Essas contagens são orçamento de geometria da fonte, não medição de draw calls da GPU. O teste de estabilidade e o artefato `ground-support-audit.json` foram executados novamente após a política de paridade.

A rota real identificou apoio incorreto diante da Sede no ponto X=15,654378 / Z=18,145764: a cápsula usava a base -0,08 sob o solo visual. O adaptador compartilhado resolve a altura real 0,031881758 e cobre todas as células dessas duas camadas, não somente esse ponto. Não foi adicionado plano visual para ocultar a diferença. A cobertura ampla passou de 5.422 para 5.424 superfícies, com índices finos internos; os 2.439 colisores físicos/de câmera não mudaram. A validação visual desse ajuste exige nova execução da rota, separada dos testes numéricos.

A rodada seguinte identificou dois casos distintos. Na ICS, o centro registrado fica apenas 0,000481 unidade fora do Q-E-08; a laje real está em 0,13, enquanto a fenda cadastral tem largura de 0,06327. O apoio circular mantém a cápsula sobre as lajes e permite a travessia desde a base. No Restaurante faltava o gramado de `RestaurantFrontageLayer`, agora derivado do mesmo plano, com apoio 0,03 no ponto registrado. Já o ponto registrado no percurso Brasília fica 0,05019 unidade fora da Rua Bolívia, além do raio do pé: seu apoio correto permanece -0,08. A regressão verifica também a subida subsequente no asfalto e no meio-fio real, sem elevar essa margem por conveniência visual. Esses ajustes exigem novas capturas de validação visual. O inventário numérico atualizado tem 5.430 superfícies amplas e os mesmos 2.439 colisores; não adiciona geometria à cena.

## Limites e validação

Os limites técnicos reutilizam `COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds`. O terreno base está em -0,08 e a superfície de algumas ruas chega a 0,032. Por isso o orçamento de subida entre superfícies de apresentação é separado da altura de pequenos obstáculos; não se permite atravessar uma mureta usando esse orçamento de solo. O amortecimento vertical da câmera pertence ao controlador de câmera.

As suítes `commercialMapVisitCollision.test.ts`, `commercialMapVisitWorld.test.ts`, `commercialMapVisitCurrentMain.test.ts` e `commercialMapVisitSiteGround.test.ts` verificam paredes finas em deslocamentos grandes, cantos, deslizamento, recuperação de penetração, troncos, copas exclusivas da câmera, passagens sob cobertura, colisão com parede/telhado, limites, deduplicação espacial, preservação dos lotes, imutabilidade, cobertura dos edifícios, posições elétricas, acesso à Alameda e correspondência dos triângulos do talude/terraço Exporural. Também cobrem o ponto registrado diante da Sede, cada célula de solo A/B/tratamentos e estabilidade de apoio entre qualidades. A aprovação definitiva depende também do relatório de execução no navegador e dos dispositivos efetivamente disponíveis.

Executar `VISIT_COLLISION_AUDIT=1` com a suíte de cobertura também grava `artifacts/visit-mode/collision-source-audit.json`, com IDs, classificação, vínculo de colisores, contagens e spawn da referência oficial. A suíte de solo grava `ground-support-audit.json` com a regressão da Sede e orçamento das células. `commercialMapVisitGroundContact.test.ts` grava `ground-contact-audit.json` e testa fendas da ICS, aproximação do lote, margem viária, meio-fio, frente do Restaurante, vazios reais e permanência de paredes/platôs bloqueados. Os artefatos distinguem verificação numérica de FPS, dispositivos físicos e tráfego de produção.

Os colisores são aproximações físicas deliberadas. Copas podem antecipar a retração da câmera; volumes fechados de pavilhões não descrevem paredes internas. O acesso explícito reaproveita a inspeção de interiores existente; caminhada livre e colisores internos ainda não fazem parte desta implementação. As atrações usam envelopes estáticos da operação, sem física por cabine. Mobiliário decorativo pequeno e veículos animados não recebem simulação individual. Não há evidência de teste físico em iPhone/Android apenas por estes testes numéricos, nem comprovação de ausência de vazamento de GPU a partir da contagem de colisores.
