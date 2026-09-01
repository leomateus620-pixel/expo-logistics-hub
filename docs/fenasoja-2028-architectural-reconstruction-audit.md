# FENASOJA 2028 — auditoria de reconstrução arquitetônica

## Escopo e invariantes

Esta reconstrução é uma camada de apresentação sobre o inventário canônico do
Mapa Comercial. B28, D1, D3 e PISTA-CAMPEIRA continuam usando os mesmos IDs,
polígonos, centros, layers, metadados, seleção, hover, busca, labels, câmera e
painel de detalhes. A conexão coberta da Arena é infraestrutura apresentada
com D1 e posicionada em relação a D3/escadaria, não uma nova entidade comercial
ou selecionável.

Nenhum arquivo de vias, lotes, autenticação, banco, rotas ou regras comerciais
é alterado nesta entrega. As dimensões abaixo são unidades cartográficas de
apresentação, não medidas topográficas em metros.

## Registro das evidências

| Anexo | Papel | Dimensões | SHA-256 |
| --- | --- | ---: | --- |
| `IMG_0064.jpeg` | mapa anterior, B28 | 1179×1812 | `2D79F22F5B7B2A67ED474ABECCBA0E4E33D13FDCAD4A2942BCBFF81CCD7349BA` |
| `IMG_0065.jpeg` | mapa anterior, D1 | 1179×1801 | `B3BA4785F3F0D36418C0FCC5A8B19F10A0E3EBDD791558590F2B2F29CDDB0A4D` |
| `IMG_0066.jpeg` | mapa anterior, D3/Arena | 1179×1462 | `060A4D4034722475E0F8B761C2F274243C222375E1D142426CE12EBC66A3353E` |
| `IMG_0067.jpeg` | mapa anterior, D3/Arena oblíquo | 1179×1476 | `C32E6F70ECB63335ABF025DFCDD5B210068E11D613DE81420390D4A975FE35C0` |
| `6267a828-cbe3-4900-aeb0-8b9aecaa45ea.jpeg` | mapa anterior, Pista | 1600×900 | `0C6E2657F83F9698DD4973E455BFEC9F40D682CCB802FE4E33CBEC0C5FB2737F` |
| `IMG_9724.jpeg` | campo, B28 | 1152×1536 | `F782652DEA2BDB20467133DDF2FE8D5314E0C2DE1BB8469B5684CCACA1AB6D8B` |
| `IMG_9699.jpeg` | campo, D1 | 1152×1536 | `D3A72D48BBFF1E8256D3F3F789772E5FD317DA58707983E6E669F864954CB11C` |
| `IMG_9692.jpeg` | campo, acesso Arena pelo vão | 1152×1536 | `FA52A5B2E6BAF99E678CA83666EF77779A5CF679D98F67111B62504B13B0376E` |
| `IMG_9693.jpeg` | campo, acesso Arena pela via | 1152×1536 | `173C319883E000074EDDE733EE08F9126592C285433B0A8D71568263A1F9444E` |
| `IMG_9720.jpeg` | campo, Pista Campeira | 1152×1536 | `C9D045730FD28A4FE0B30947EC4CAE4ED988FC879F8DB86614FF9A9003095ECB` |
| `codex-clipboard-1329…png` | QA integrado: D1 diagonal | 344×190 | `A567C47F12EBF94CD7948046487F4AE368F2C3A19CC50171DE3B5A5C87A8C682` |
| `codex-clipboard-08e6…png` | QA integrado: D1 sem acesso visível | 469×295 | `E0FDC20378D6F17F2A6F202E85943AF5E41AD208F22231AA86BAE717D036222F` |

## Rastreamento do renderer

| Ativo | Fonte canônica | Resolução arquitetônica | Interação preservada |
| --- | --- | --- | --- |
| B28 | `officialReference2026.ts` → `MapEntity` | `landmarks.ts` → `StrategicLandmarks.tsx` → `CooperativismSpace` | proxy original de B28 |
| D1 | `officialReference2026.ts` → `MapEntity` | `landmarks.ts` → `StrategicLandmarks.tsx` → `GastronomicAlameda` | proxy original de D1 |
| D3 | `officialReference2026.ts` → `MapEntity` | renderer específico existente `MirantePavilion`; mantido após auditoria | proxy original de D3 |
| acesso Arena | `parkEnvironment.ts`, visibilidade ancorada em D1 e implantação conferida contra D3/escadaria | `ArenaFrontInfrastructure` → `ArenaAccessStructure` | não selecionável; segue visibilidade/opacidade de D1 |
| PISTA-CAMPEIRA | `officialReference2026.ts` → `MapEntity` | `landmarks.ts` → `StrategicLandmarks.tsx` → `CampeiraTrack` | proxy original da Pista |

Os filhos arquitetônicos usam `NO_RAYCAST`; portanto não duplicam hit targets e
não desviam seleção, label ou drawer da entidade persistida.

## Matriz corrente × referência × alvo

| Ativo | Estado representado nos anexos 1–5 | Evidência real | Estado-alvo implementado |
| --- | --- | --- | --- |
| B28 | bloco baixo genérico, cobertura e fachada sem identidade | A-frame dominante, grandes águas cinza até beirais baixos, tijolo, frontão central, entrada recuada e painéis verdes/vidro | duas águas íngremes com overhang e nervuras, frontão real, alas baixas, alvenaria, entrada recuada, pano verde, vidro, pilastras, fundação e passeio |
| D1 | dois volumes teal sem ritmo ou acesso real; a primeira revisão inclinou o edifício 11,8° dentro do lote | edifício baixo e longitudinal, reto no eixo do lote, cobertura cinza, fachada escura, plataforma elevada, escada central, colunas/corrimãos e cerca de 17 mastros | volume longitudinal reto em Z, fachada para leste, cobertura rugosa nervurada, sete vãos, plataforma, cinco degraus, rampa, guarda-corpos e exatamente 17 mastros instanciados |
| D3 | pavilhão esquemático e desconectado da escadaria | anexos não fornecem fotografia exclusiva do Mirante | o renderer paramétrico específico já presente no código é preservado: cobertura, plataforma, base, pilares, treliças, guarda-corpos, rampa, escada e LOD; sem inventar nova arquitetura |
| acesso Arena | cobertura genérica/posição ambígua junto ao Mirante | grande plataforma aberta, fascia clara, parede lateral única, apoios pretos em V treliçado, estrutura aparente, guarda-corpos e bancos | infraestrutura independente diante da escada e ao sul de D3, com cinco bays, dez V completos, cordas internas, treliças longitudinais/transversais, plataforma, conexão ao patamar, fascia, parede, guarda-corpo, faixa tátil e dois bancos |
| Pista | retângulo amarelo plano | campo verde com solo/grama seca, cercas rurais de madeira e um brete coberto | malha determinística verde/marrom/seca, relevo que zera nas bordas, cerca de três travessas, variação sutil de madeira, abertura leste rastreável e um único abrigo/brete |

## Contratos espaciais e orientação

- B28 preserva bounds locais `x [-7.636, -2.836]`, `z [-10.800, -8.836]`,
  centro `[-5.236, -9.818]` e frente local `+Z`. Q-M-08 está em
  `[-5.523, -6.491]`; o desvio angular residual é aproximadamente 4,9°.
- D1 preserva bounds `x [9.164, 12.436]`, `z [-1.964, 2.618]`. Conforme a
  revisão visual do mapa integrado, o eixo longo permanece exatamente reto em
  Z e a frente local `+Z` usa `π/2 rad`, apontando para leste (+X), diante do
  acesso/escadaria. O vetor para o centro dos degraus fica 11,8° ao nordeste,
  mas não é usado para inclinar o edifício. O frame local continua resolvido
  dentro do envelope oficial, sem deslocar o lote.
- D3 permanece no source bounds `[3990, 2440, 4100, 2830]`.
- A conexão coberta usa `[4005, 2840, 4110, 3068]`: diante da fachada leste de
  D1, ao sul de D3, a oeste dos
  degraus `[4120, 2720, 4480, 3070]`, a leste da Rua Brasília e ao norte da Rua
  Brasil. Sua apresentação depende apenas de D1; D3 é referência de implantação,
  evitando que a ausência/filtro de D3 suprima a estrutura. Essa implantação é
  marcada `FIELD_REVIEW_RECOMMENDED`.
- PISTA-CAMPEIRA preserva `[1990, 1740, 3240, 2175]`, equivalente a
  `27,273 × 9,491` unidades locais. O contato rastreável com Rua Gustavo Bessel
  ocorre apenas no limite leste, perto do canto sudeste; por isso não existe
  abertura arbitrária ao sul.

## Materiais, contato e orçamento

- Coberturas: alto roughness, metalness contido, cumeeiras/nervuras e sombras.
- Tijolo/concreto: resposta difusa não especular e separação física de base.
- Aço: cinza muito escuro, nunca preto absoluto, com brilho suficiente para
  revelar apoios e treliças.
- Pista: vertex colors determinísticas, sem textura nova ou plano amarelo; as
  cercas e o brete usam cinco batches totais com instancing.
- Acesso Arena: seis batches instanciados; nenhum objeto animado ou raycast.
- `reducedGraphics` reduz malha de terreno, nervuras e sombras sem remover as
  silhuetas essenciais.

## Limites de evidência

As fotos determinam silhueta, material, orientação relativa e vocabulário
estrutural, mas não fornecem levantamento métrico completo. A implantação do
acesso da Arena, a largura exata do portão da Pista e a posição fina do brete
permanecem explicitamente sinalizadas para conferência de campo. Não foram
inferidos silos, postes, bandeiras, fachadas traseiras complexas ou edifícios
auxiliares ausentes das referências.

## Validação final

### Mapa autenticado e múltiplos ângulos

- O mapa completo autenticado foi inspecionado na vista padrão, aérea,
  frontal, traseira e em oblíquas laterais, além de aproximações médias e
  próximas dos cinco ativos.
- B28 continuou pesquisável e selecionável pelo ID original, abriu o painel
  original e apresentou a silhueta A-frame, alvenaria, entrada recuada e
  painéis verdes sem depender do label para identificação.
- D1 continuou pesquisável e selecionável pelo ID original. O eixo longitudinal
  foi conferido reto no envelope oficial, sem a inclinação de 11,8° observada
  na primeira revisão, mantendo a fachada voltada ao acesso/escadaria.
- A conexão da Arena ficou visível junto com D1 e foi conferida diante da
  fachada, antes dos degraus e ao lado do Mirante. A cobertura clara, a parede
  lateral, os apoios pretos em V, as treliças, os guarda-corpos, bancos,
  plataforma e conexão ao patamar permaneceram legíveis nas vistas frontal,
  laterais e aérea.
- O Mirante manteve sua implantação e renderer específico, com cobertura,
  pilares, plataforma, guarda-corpos, escada e rampa conferidos sem extrapolar
  a evidência fotográfica disponível.
- PISTA-CAMPEIRA continuou pesquisável e selecionável pelo ID original. Sem o
  highlight de seleção, a superfície verde/marrom, as cercas, a abertura leste
  e o único abrigo ficaram legíveis nas vistas aérea e oblíquas.
- Busca, hover, seleção, labels, painel de detalhes e centralização de câmera
  continuaram usando os proxies canônicos; nenhuma entidade visual duplicada
  foi criada.

### Viewports e limites de dispositivo

- `390×844`: viewport CSS conferido no Chrome autenticado, canvas presente,
  sem overflow horizontal; busca e seleção de D1 abriram o painel correto.
- `393×852`: viewport CSS conferido, canvas presente e sem overflow horizontal.
- `430×932`: o DPR efetivo de `0,6667` quantizou a janela para `430×931` ou
  `430×933`; ambos os limites adjacentes foram conferidos com canvas presente e
  sem overflow horizontal.
- Esta validação foi feita por redimensionamento autenticado de desktop. Não
  houve dispositivo físico, medição instrumental de FPS, memória de GPU ou
  energia; esses itens permanecem como validação de campo antes da publicação
  final em produção.

### Rotas e regressão automatizada

- `/mapa-comercial`: carregamento autenticado e inspeção visual concluídos.
- `/comissoes/industria-comercio-servicos/mapa-comercial`: a rota respondeu
  `Segmento comercial indisponível` porque a configuração persistida ou a
  autorização da comissão não pôde ser confirmada. Nenhum dado do parque foi
  carregado nessa rota; trata-se de um bloqueio externo de ambiente, registrado
  sem contornar autenticação ou regras comerciais.
- Testes focados dos três contratos novos: `3` arquivos e `12/12` testes
  aprovados.
- Recorte de regressão do Mapa Comercial: `67/71` testes aprovados. As quatro
  falhas são expectativas legadas já incompatíveis com a base atual
  (`commercialMapIndependence` e `commercialMapPresentation`), fora deste
  escopo.
- Suíte completa: `1322/1361` testes aprovados, `39` falhas em `15` arquivos.
  A base anterior tinha as mesmas `39` falhas nos mesmos `15` arquivos; os
  doze testes desta entrega explicam o aumento de `1349` para `1361` testes,
  sem introduzir nova falha.
- `tsc` para `tsconfig.app.json` e `tsconfig.node.json`: aprovado.
- ESLint dos arquivos alterados: aprovado.
- Build de produção: aprovado; permaneceram apenas os avisos herdados de
  `caniuse-lite` desatualizado e chunks acima de 500 kB.
