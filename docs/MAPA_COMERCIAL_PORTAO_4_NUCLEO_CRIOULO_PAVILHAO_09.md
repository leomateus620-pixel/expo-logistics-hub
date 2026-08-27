# Distrito do Portão 4 — análise comparativa e evolução 3D

## Escopo e contratos preservados

Esta evolução atua na apresentação compartilhada do Mapa Comercial e mantém como fonte de verdade os identificadores, UUIDs, classificações, metadados, permissões, seleção, busca, edição e persistência já existentes. Os owners continuam sendo `A4`, `D5`, `PAVILHAO-09`, `RUA-BUENOS-AIRES`, `AREA-MOTORHOME` e `TEST-DRIVE`.

A implantação da via é uma correção transitória de apresentação aplicada a uma cópia da entidade `RUA-BUENOS-AIRES`. A geometria persistida não é alterada. O lote `Q-V-06` permanece apenas como referência de adjacência ao destino; ele não é incluído artificialmente no segmento automotivo nem recebe nova regra comercial.

## Análise comparativa anterior à modelagem

| Tema | Estado anterior do mapa | Fotografias reais | Vista de satélite | Decisão de reconstrução |
| --- | --- | --- | --- | --- |
| Núcleo Crioulo D5 | prisma bege baixo e quadrado, sem identidade ou entorno | edifício térreo longitudinal em tijolo, cobertura cerâmica de quatro águas, beirais largos, varanda, pilares, esquadrias de madeira, chaminé, degraus e quatro mastros visíveis | pequeno volume de cobertura avermelhada a oeste da via, inserido em gramado arborizado | preservar a âncora oficial D5 e criar uma hierarquia completa de corpo, cobertura, varanda, pilares, aberturas, chaminé, acesso e mastros |
| Pavilhão 09 | monólito cinza-escuro, cobertura plana e laterais sem modulação | não há fotografia arquitetônica específica entre os anexos | grande volume industrial longitudinal a leste da via | preservar o footprint oficial e assumir linguagem industrial controlada: embasamento, corpo modular, empena, cobertura de baixa inclinação, lanternim e acessos técnicos |
| Portão 4 A4 | marcador genérico deslocado da leitura do corredor | sem fotografia métrica específica | confirma o acesso no extremo norte da relação via/P9/D5 | manter a âncora A4 e deslocar somente o asset visual até o eixo da rua, com vãos veiculares, passagem lateral, guarita e identidade verde/dourada |
| Rua Buenos Aires | começava ao sul do Pavilhão 09; o trecho A4–P9 aparecia como vazio claro | o material real foi descrito como brita; o pedido autoriza asfalto para coerência sistêmica | via estreita norte-sul separando D5 e P9 e prosseguindo para o setor automotivo | completar o corredor com o mesmo ID e o renderer viário compartilhado, conservando largura, meios-fios, material e seleção já adotados no mapa |
| Vegetação e lugar | gramado amplo, poucas árvores e D5 isolado | árvores maduras, copa ornamental rosada, gramado e cerca rústica enquadram o edifício | massas arbóreas e pista circular aparecem a oeste/noroeste | acrescentar composição instanciada e não interativa, incluindo variação ornamental florida, sem transformar interpretações em árvores levantadas |
| Motorhome | textura existente, mas sujeita a perda de leitura em zoom alto e seleção | não aplicável | grande campo aberto | manter macrovariação legível nos mipmaps, eliminar elevação de seleção e reduzir custo de geração |
| Test drive | textura existente encoberta em partes por superfícies interpretadas próximas/coplananres | não aplicável | pátio aberto | colocar as transições interpretadas abaixo da superfície oficial e estabilizar filtragem, fallback e mipmaps |

## Hierarquia de evidências

- **Alta confiança:** ownership dos IDs, frame de coordenadas, footprint oficial de P9, âncora de A4, âncora de D5 e geometria original da Rua Buenos Aires.
- **Média confiança:** relação oeste–via–leste entre D5, Rua Buenos Aires e P9; continuidade norte-sul; orientação longitudinal do Núcleo Crioulo.
- **Referência fotográfica:** materiais, proporções relativas e elementos arquitetônicos de D5.
- **Interpretação visual:** fachada e detalhes de P9, posição fina de árvores, cerca e pista circular.
- **Não levantado:** medidas prediais de engenharia, altimetria, localização métrica de cada tronco e identidade/heráldica das bandeiras.

As bandeiras usam apenas cores de apresentação coerentes com o ecossistema Fenasoja. O plano registra sua identidade como `NOT_DOCUMENTED`, evitando inventar símbolos oficiais.

## Implantação e relação espacial

O plano versionado `2026.8-gate-four.1` registra a extensão visual da Rua Buenos Aires no intervalo PDF `[1600, 1744]–[1648, 3145]`. O trecho original `[1600, 2410]–[1648, 3145]` é conservado como evidência. A extensão fecha o vazio entre A4 e o início oficial sem criar entidade paralela.

D5 permanece a oeste da via e P9 a leste. O asset do Portão 4 conserva a âncora oficial `[1656, 1744]`, mas recebe um offset visual de `[-32, 0]` no frame PDF para cruzar o eixo da rua em `[1624, 1744]`. O acesso de D5 termina na mesma Rua Buenos Aires. `Q-V-06` é apenas o marco adjacente do percurso já existente ao sul.

A referência a “lote 06 do Espaço Automóvel” não identifica univocamente um lote do cadastro: as quadras automotivas U/P/T/O possuem numeração própria e V não pertence a esse segmento. Por isso, a solução completa a ligação com a Rua Buenos Aires existente até o limite sul, conservando suas conexões com U/T e a malha transversal. Não reclassifica `Q-V-06` nem inventa uma ligação atravessando lotes.

## Arquitetura entregue

### Núcleo dos Criadores de Cavalos Crioulos

- corpo térreo longitudinal com textura procedural de tijolo e juntas legíveis;
- telhado de quatro águas em cerâmica, beiral, cumeeira e cursos de telha;
- varanda frontal e lateral, piso mineral, sequência de pilares de tijolo;
- portas, venezianas, molduras, faixa de embasamento e assinatura simplificada;
- chaminé de tijolo com capeamento;
- quatro mastros com bandeiras não heráldicas;
- acesso em degraus, cerca rústica e pista circular de solo compactado;
- árvores da camada cartográfica compartilhada, inclusive copas ornamentais rosadas.

### Pavilhão 09

- embasamento e corpo industrial separados;
- cobertura metálica de duas águas com baixa inclinação, cumeeira/lanternim e beirais;
- modulação repetida nas fachadas longas;
- acessos de empena e serviço, painéis, rodapé e detalhes de ventilação;
- LOD progressivo para preservar a silhueta no zoom aberto e revelar modulação apenas quando útil.

### Portão 4

- dois vãos de circulação sob pórtico verde/dourado;
- pilares e travamentos com leitura nos quatro lados;
- guarita, passagem lateral, balizadores e setas direcionais;
- contorno de apresentação calculado para pórtico e guarita, compartilhado por clique, hover e seleção e deslocado junto com o asset, sem raycast nos detalhes; a âncora do label permanece canônica.

## Estabilidade das superfícies abertas

A inspeção do código não encontrou troca de material/LOD por distância nessas superfícies, e os UVs do topo são definidos em unidades de mundo. Os problemas identificados foram a perda da microvariação na cadeia de mipmaps, o custo síncrono alto da fonte procedural, a elevação da malha selecionada e a sobreposição vertical de superfícies interpretadas sobre `TEST-DRIVE`. Nas vistas verificadas no navegador, a correção não exigiu desabilitar frustum culling nem alterar clipping de câmera.

A correção mantém base cromática não branca mesmo sem mapa, textura power-of-two `256 × 256`, repeat em unidades de mundo, `sRGB`, mipmaps, filtro trilinear, filtro linear de aproximação e anisotropia limitada à capacidade real do renderer. A fonte é compartilhada e cada entidade recebe clone independente. O ruído usa hash inteiro determinístico e três oitavas, reduzindo para um quarto a memória/pixel work da antiga fonte `512 × 512`.

`AREA-MOTORHOME` e `TEST-DRIVE` não sobem quando selecionadas. As transições `costeiros-yard-exposed-soil`, `costeiros-field-transition` e `costeiros-forest-transition` ficam abaixo da tampa visual `0,026`, eliminando disputa de profundidade e encobrimento em vista oblíqua.

As dez árvores do distrito resolvem seu apoio pelo mesmo topo de apresentação: troncos em `0,030` e sombras em `0,028` no motorhome. A extrusão cadastral `0,055` permanece intacta. Quando uma sombra alcança a via, a superfície de asfalto é resolvida independentemente; os outros 230 exemplares conservam os critérios anteriores.

## Integração com a rede elétrica

As novas alturas arquitetônicas expuseram duas insuficiências de folga na apresentação dos condutores. Seis postes recebem offsets visuais explícitos e condicionados à presença dos respectivos owners: três do alinhamento `AH-010` junto a A4 e três de `AV-018` junto a P9. O plano registra `PROJECTED_CLEARANCE` e `FIELD_REVIEW_REQUIRED`; posições-fonte, IDs, circuitos, alturas e topologia permanecem intactos.

Os testes amostram o condutor trifásico contra o envelope do portal/guarita e do pavilhão. As folgas mínimas verificadas foram `0,26354` e `0,29242` unidades do mapa, superiores ao contrato visual de `0,22`. Essas unidades não representam certificação de afastamento elétrico em metros.

## Performance e ciclo de vida

- nenhuma animação contínua nova; o canvas permanece em `frameloop="demand"`;
- detalhes repetidos usam instancing e todas as peças visuais têm raycast desabilitado;
- texturas arquitetônicas são `DataTexture` de `64 × 64` com mipmaps;
- árvores novas compartilham os quatro draw calls primários da camada existente;
- LOD usa distância e seleção, evitando gerar detalhes finos em visão geral;
- geometrias, texturas, materiais derivados e instanced meshes possuem descarte explícito;
- o modo gráfico reduzido continua omitindo sombras e detalhes de maior custo conforme os contratos globais.

## Matriz de aceitação

- visão geral: silhueta de P9, cobertura cerâmica de D5, corredor A4–setor automotivo e massas vegetais;
- distância intermediária: leitura de varanda, pilares, empena industrial, portal e bordas da via;
- vista superior: alinhamentos, footprint preservado, separação oeste/leste e continuidade do pavimento;
- vista oblíqua/foco: telhas, tijolos, chaminé, aberturas, mastros, modulação e acessos;
- interação: busca por aliases, seleção pelo mesmo UUID, clique, duplo clique, foco, filtros e labels;
- superfícies: motorhome e test drive em zoom aberto, alto, próximo e oblíquo, selecionados e não selecionados;
- responsividade: desktop e viewport móvel em modo gráfico completo/reduzido;
- regressão: TypeScript, ESLint focado, testes Vitest, build de produção e inspeção de console.

Uma inspeção de campo continua recomendada antes de tratar árvores, cerca, pista circular, fachadas não fotografadas de P9 ou bandeiras como documentação executiva.
