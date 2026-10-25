# Lavoura demonstrativa: implantação e modelos

Registro de apresentação **2026-10-25-soy-presentation.1**, conferido contra o replay dos dados persistidos da revisão **2028-exporural-2026-10-20.1**. Não há migração, reparcelamento ou alteração de lotes, áreas, preços, vendas, contratos ou permissões neste registro.

A [vista superior vetorial](soy-layout-topview.svg) contém o polígono plantável, as cabeceiras, o acesso ao asfalto, o eixo rodoviário existente e as geometrias de lotes e estacionamento usadas na conferência. É um SVG autossuficiente, sem imagens, fontes ou recursos remotos. Seu eixo vertical é **+z para baixo** e o horizontal é **+x para a direita**; isso não constitui uma indicação de norte geográfico.

## Identificação da superfície e confiança

A mancha exterior das capturas **01.41.03** e **01.41.09** foi identificada no código como `northern-open-parcels`, do catálogo `territoryContext.generated.json`, exposto por `territorialEnvironment.ts` e desenhado em `TerritorialEnvironment.tsx`. Seu tipo é `field`, com superfície em `y = 0,015`. Não é um lote cadastral, uma área TEST-DRIVE ou uma superfície do estacionamento.

O anel de origem é:

```text
(37; −62,2727275)
(63,4363635; −62,2727275)
(69; −53)
(63; −44)
(37; −46)
```

O estacionamento imediatamente abaixo nas capturas corresponde às fileiras de `REAR_PARKING_ROWS` e à circulação de `REAR_PARKING_CIRCULATION`. Na cena, elas separam a mancha dos lotes da Quadra S. Os lotes da ExpoRural e o eixo da BR-472 à direita permitem registrar a orientação das imagens sem inferir norte a partir da posição na tela.

**Confiança:** `SCENE_REGISTERED_PRESENTATION_ESTIMATE`. A identidade da superfície, os anéis comerciais e os pontos do eixo rodoviário são dados existentes do projeto. O desenho plantável, as cabeceiras, a abertura de acesso e as dimensões das máquinas são decisões de apresentação. Não foram medidas distâncias topográficas nas fotografias; não há levantamento vertical novo.

## Coordenadas versionadas

A escala adotada é a vigente no mapa: **0,15 unidade por metro**. As equivalências métricas abaixo são derivadas dessa escala de modelagem, não novas cotas oficiais.

| Elemento | Implantação local / dimensão |
| --- | --- |
| Centro da lavoura | `x = 52; z = −54,5` |
| Polígono plantável | `(43;−57,2), (61;−57,2), (61;−51,8), (43;−51,8)` |
| Dimensão plantável | `18 × 5,4` unidades, equivalentes a `120 × 36 m` no modelo |
| Apoio de plantas e máquinas | `y = 0,024`; segue a superfície exterior plana existente |
| Envelope reservado | `x = 39…66,5; z = −59,5…−48,4` |
| Cabeceira inicial | `x = 39…43; z = −59,5…−48,4` |
| Cabeceira final | `x = 61…66,5; z = −59,5…−48,4` |
| Centros das faixas de trabalho | `z = −56,3; −54,5; −52,7`; sentidos alternados |
| Plataforma e plantadeira | largura `1,8` unidade, equivalente a `12 m` |
| Barras abertas do pulverizador | largura `4,5` unidades, equivalente a `30 m` |
| Corredor do caminhão | largura `0,96` unidade, equivalente a `6,4 m` |
| Colheitadeira estacionada | `x = 62,5; z = −52,7; yaw = π/2` |
| Caminhão na descarga | `x = 62,5525; z = −51,4955; yaw = π/2` |
| Asfalto de destino | `osm-431693361-0`, exibido como BR-472; origem OSM identifica RSC-472 |

A polilinha de registro do acesso é:

```text
(63,2;−49,8) → (66,2;−49,8) → (74;−49,8) → (79,5;−49,1)
→ (81,6;−47,3) → (82,4;−47,05) → (83,35;−49,05)
→ (85,2908;−53,168) → (87,8;−58,078)
```

O runtime acrescenta a saída do ponto de descarga e suaviza o percurso. A junção `(82,4;−47,05)` acompanha o eixo rodoviário existente. A faixa de acesso é cenográfica e não é cadastrada como rua oficial.

**Interpretação espacial adotada:** a área plantável ocupa um núcleo da mancha, reservando cabeceiras largas. O envelope de operação e o acesso avançam em direção ao asfalto; a plantação não preenche toda a mancha original. Isso é uma aproximação de implantação, e não uma confirmação de que todo o terreno marrom pode ser cultivado.

## Exclusões conferidas

Os testes usam os polígonos reais da referência local e do replay de outubro, as fileiras/vagas e a circulação do estacionamento, os corredores rodoviários com acostamentos e os catálogos territoriais de árvores e construções. A área plantável e as cabeceiras não interceptam lotes, vias ou estacionamento. O acesso do caminhão evita lotes, vagas, circulação, árvores e construções, terminando dentro da faixa do eixo BR-472.

`soyHarvestSweptEnvelopes.test.ts` substitui os lotes antigos pelos dados vigentes, conforme o harness de revisão. O teste calcula o envelope conservador a partir da geometria completa do caminhão, percorre a spline real em 501 posições por comprimento e acrescenta 401 amostras da timeline, incluindo a elipse final. Os envoltórios entre posições consecutivas são comparados com lotes, vias internas, vagas/circulação, árvores comerciais/territoriais/posteriores e construções. A faixa de apresentação foi ampliada de 0,72 para **0,96 unidade** após essa verificação: 0,95 ainda deixava parte do envelope fora em uma curva. A ampliação não atinge as exclusões. A contenção também confere o mesmo polígono contínuo triangulado pelo piso, além das cabeceiras e do asfalto de destino. Essa triangulação fecha as lacunas de junção que existiam entre retângulos de segmentos nas curvas. Plantadeira articulada, plataforma, barras abertas e tubo em abertura/recolhimento são verificados pelo envelope completo dos modelos, em 301 poses de trabalho e 71 amostras de descarga.

Os testes são verificações da geometria disponível no projeto. Não validam capacidade agronômica, autorização de uso do terreno ou segurança de uma instalação elétrica real.

## Modelos, materiais e propriedade dos recursos

Os quatro conjuntos de máquinas são geometrias procedurais originais em `harvest/models/soyMachines.ts`. Não foram baixados arquivos GLB, texturas comerciais, fotografias ou modelos de terceiros. A marca textual **JOHN DEERE** e a identificação **X9** são referências ao equipamento solicitado; não há logotipo baixado nem alegação de modelo oficial ou de endosso do fabricante. As marcas continuam pertencendo a seus titulares. As geometrias seguem as condições do próprio repositório; esta entrega não inventa uma licença separada para ele.

Os modelos usam **+z como frente** e são construídos em metros, com escala `0,15` na raiz. Os acabamentos PBR são compartilhados dentro de cada frota. Rodas, molinete, engate, tubo e carga possuem nós próprios para atualização imperativa. A saída da descarga é um objeto filho do tubo articulado; o runtime resolve sua transformação mundial para dirigir o fluxo ao interior da caçamba. Os volumes de grãos são efeitos visuais sem tonelagem ou produtividade associadas.

Cada frota possui e libera suas próprias geometrias, materiais e textura de inscrição. Não existe cache global de máquinas. A lavoura possui seus próprios três buffers instanciados e piso, com descarte explícito das geometrias intermediárias. São 4.500 grupos representativos de plantas, não uma contagem agronômica. O plano distante usa 54 mil triângulos para a folhagem e duas draw calls totais da camada; próximo são quatro draw calls, incluindo caules e vagens. O detalhe é ativado por distância, sem reduzir o DPR do mapa.

**Limitação de custo:** a geometria próxima submete aproximadamente **1.044.000 triângulos**, além do piso. Essa quantidade decorre de 4.500 instâncias de folhas, caules e vagens e não deve ser confundida com o baixo número de draw calls. As máscaras descartam fragmentos das plantas colhidas, mas não eliminam o processamento de seus vértices; portanto, navegar perto do campo colhido ainda paga esse custo. O estado parado não exige frames contínuos. A medição de desempenho da entrega deve considerar essa diferença entre estado parado e navegação.

A soja tem folhas largas em trios, ramificações e vagens alongadas. O crescimento revela os nós e abre as folhas; a maturação muda a coloração e reduz a folhagem. As instâncias seguem máscaras por faixa, derivadas do mesmo percurso dos implementos. A lavoura estática não carrega o pacote dos modelos e não mantém um loop próprio de invalidação.

## Fontes primárias consultadas em 25/10/2026

- [Embrapa — Estádios vegetativos](https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/cultivos/soja/pre-producao/caracteristicas-da-especie-e-relacoes-com-o-ambiente/estadios-de-desenvolvimento/estadios-vegetativos): conteúdo localizado pelo índice de busca; abertura direta retornou HTTP 403. O mesmo ocorreu com as páginas de desenvolvimento e estádio reprodutivo fornecidas no pedido.
- [Embrapa Soja — SECA, Estádios Fenológicos](https://bioinfo.cnpso.embrapa.br/seca/index.php?Itemid=435&catid=84&id=74:estadios-fenologicos&option=com_content&view=article): conteúdo integral acessível, com descrições de cotilédones, folhas trifolioladas, desenvolvimento de vagens, enchimento de grãos e maturação, além das ligações para fotografias das fases.
- [John Deere — X9 1000](https://www.deere.com.br/pt/colheitadeiras/colheitadeira-x91000/): página e referências da galeria consultadas. Uma tentativa de abrir a fotografia frontal retornou timeout.
- [John Deere — chegada da X9 ao Brasil](https://www.deere.com.br/pt/a-nossa-empresa/not%C3%ADcias/sala-de-imprensa/2024/abr/nova-colheitadeira-x9-no-brasil/): descrição da plataforma draper, tubo articulado e ligação para fotografia da máquina no campo.
- [John Deere — Pulverizador M4030](https://www.deere.com.br/pt/tratos-culturais/pulverizador-m4030/): página e ligação da imagem de estúdio consultadas, orientando cabine elevada, rodas estreitas e barras laterais.
- [John Deere — folheto de tratores 6M](https://www.deere.com.br/assets/pdfs/region-3/products/tractors/6m-series/cqp00188-6m-series-tractors.pdf): consulta tentada, mas o arquivo de aproximadamente 26,3 MB excedeu o limite de leitura da ferramenta. Não se afirma inspeção completa desse folheto.

As proporções procedurais são inspiradas nessas referências, com simplificações para a cena. Não reproduzem todas as dimensões ou peças de um equipamento de engenharia.

## Compressão temporal e elipses implementadas

A timeline conserva **48 segundos** e os sete intervalos definidos no pedido. Crescimento e maturação são comprimidos; os deslocamentos agrícolas usam **elipses explícitas**, representadas por breves dissoluções das máquinas. A informação acessível pelo botão “i” explica essa escolha.

O percurso completo continua sendo três retas de 18 unidades e duas semicircunferências de raio 0,9, totalizando `59,6549` unidades, aproximadamente `397,70 m` na escala do modelo. Esse percurso não é mostrado como uma corrida contínua. Cada passada apresenta um trecho central em velocidade moderada; a entrada não mostrada, o restante da linha e a manobra são percorridos quando a máquina está totalmente dissolvida. As posições continuam vindo do mesmo caminho contínuo, e as máscaras acompanham o ponto real de deposição ou de corte, inclusive nos intervalos não mostrados. Não há desaparecimento global da lavoura nem reinicialização de uma faixa.

| Trecho visível | Velocidade na escala do modelo | Comportamento |
| --- | --- | --- |
| Trator e plantadeira | **18 km/h** | Trecho central de cada uma das três passadas; demais trechos condensados durante a dissolução |
| Pulverizador | **18 km/h** | Passagem central com barras abertas e névoa localizada; início e fim resumidos |
| Colheitadeira em trabalho | **10,8 km/h** | Três trechos centrais, com corte sincronizado e elipses para o restante das linhas/manobras |
| Aproximação final à descarga | **12 km/h** | Reaparece a baixa velocidade na cabeceira, estabilizando antes da abertura do tubo |
| Caminhão, primeiros 1,2 s após a descarga | **30 km/h** | Saída contínua sem movimento enquanto houver fluxo de grãos |
| Caminhão, restante visível da saída | Aceleração contínua até **60 km/h** | O restante até a BR-472 é condensado somente entre `47,8–48 s`, após sair do enquadramento |

As dissoluções dos conjuntos agrícolas usam descarte pontilhado no shader, mantendo os materiais opacos. Não acrescentam meshes nem exigem ordenar dezenas de superfícies transparentes. As variantes de materiais pertencem ao runtime, são restauradas e descartadas antes da liberação da frota. Rodas e molinete acompanham a distância amostrada; nenhuma velocidade adicional é obtida alterando o tamanho das máquinas.

Os testes amostram as velocidades enquanto há visibilidade, a monotonicidade das máscaras, as manobras completamente ocultas e a aproximação à descarga. Também conferem o envelope completo do caminhão fora do frustum em `47,8 s` nas viewports `1920×1080`, `1366×768` e `390×844`, tanto com câmera cinematográfica quanto com redução de movimento. Essa conferência geométrica não substitui a gravação do resultado real, documentada no relatório principal.

A câmera portrait amplia a distância em 2,2 vezes e conclui a aproximação do plano de descarga em `37 s`, preservando as poses e os tempos da câmera desktop. A conferência usa a área real do Canvas móvel (`390×766`, descontado o cabeçalho): os envelopes completos da plataforma, tubo e caminhão mantêm ao menos 5% de margem nas bordas entre `37–44 s`, e a colheitadeira final permanece integralmente enquadrada. O teste da saída do caminhão antes da elipse também cobre essa área útil.

A descarga permanece contínua entre `38,5–43 s`; o fluxo cessa antes de recolher o tubo e antes de o caminhão sair. Uma navegação por etapas em pausa calcula uma amostra estática do fluxo, sem avançar o relógio nem emitir novos grãos.

## Validação deste módulo

- `soyHarvestLayout.test.ts`: quatro testes passaram, incluindo limites comerciais/viários, estacionamento, envelopes e conexão com BR-472.
- `soyHarvestModels.test.ts`: dois testes passaram, incluindo articulação, escala, interior da caçamba e descarte de recursos em três construções completas da frota.
- `soyHarvestSweptEnvelopes.test.ts`: três testes passaram; verificam o caminhão completo na spline e timeline reais contra exclusões, sua contenção na faixa efetivamente desenhada e os envelopes de plataforma, barras, plantadeira e tubo articulado.
- `commercialMapSoyHarvestSceneCleanup.test.tsx`: um teste passou, com três montagens/desmontagens durante preparação pendente, liberação dos buffers de instância das partículas e descarte único das geometrias compartilhadas.
- Chrome real, viewport 1920 × 1080, revisão local: a camada atingiu `commercialMapReady=true`, sem erros de shader após a correção da quebra de linha do prefixo GLSL. Uma captura próxima em pausa no segundo 14 foi inspecionada para folhas, fileiras e continuidade do enquadramento.
- `commercialMapSoyHarvestRuntime`, `Overlay`, `Machinery` e `Preparation`: **26 testes passaram**, cobrindo estados, relógio, velocidades visíveis, máscaras, envelope do caminhão, descarga mundial, materiais das dissoluções e preparação local cancelável de shaders. `typecheck` passou após essas alterações.
- Após corrigir o corte da plataforma no enquadramento portrait, a rodada de `Runtime` e `Machinery` aprovou **20 testes**, incluindo o novo teste dos envelopes projetados e a saída do caminhão no Canvas móvel útil.
- A validação integral, os clipes e as medições comparativas pertencem ao relatório principal da entrega. Esta nota não afirma execução de cenários que não foram medidos aqui.
