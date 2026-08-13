# Personagens executivos 3D — Mapa Comercial Fenasoja

## Objetivo e limite desta entrega

Esta experiência apresenta Fabiano Soltis e Djeison Drey como dois personagens 3D independentes, sentados lado a lado no sofá do interior da **B12 — Sede Fenasoja / Comissão Central**, contexto de apresentação da Casa da Soja. Cada personagem preserva identidade visual, proporção, roupa, acessórios, postura e movimento próprios.

Os personagens aparecem **exclusivamente dentro desse interior**. O card/menu executivo, o circuito externo, o acompanhamento de câmera, a reação por proximidade e todo o estado global associado a caminhada ou aceno foram removidos. Eles não são renderizados nas vias, no mapa geral, nos segmentos isolados ou nos demais interiores.

A implementação pertence à camada de apresentação 3D. Ela **não cria nem renomeia `MapEntity`**, não altera lotes, geometrias oficiais, segmentos, permissões, persistência ou inventários do parque. A revisão cartográfica vigente continua sendo a fonte de verdade para o mapa.

## Decisão de identidade das referências

A separação correta das pessoas é um requisito de qualidade, porque misturar fotografias de indivíduos diferentes produziria um rosto genérico e reduziria a reconhecibilidade.

| Referência fornecida | Pessoa interpretada | Uso no refinamento |
| --- | --- | --- |
| Foto 1 | Fabiano ao centro; Djeison à direita | Relação de altura, postura, cabelo, roupa formal e contexto conjunto |
| Foto 2 | Fabiano | Face frontal, cabelo, mandíbula, olhos, nariz, boca e barba curta |
| Foto 3 | **Fabiano novamente** | Três-quartos, volume do rosto, cabelo, pele, corpo e gestual |
| Fotos 4 e 5 | Djeison | Corpo inteiro, altura, cabelo claro, barba ruiva, óculos, mãos e chimarrão |

Embora o agrupamento textual inicial associasse a terceira foto a Djeison, a comparação facial e a legenda pública do registro coletivo confirmam que ela repete Fabiano. Por isso, a terceira foto foi retirada do perfil de Djeison e incorporada ao de Fabiano. Essa correção impede a fusão de identidades. A legenda pública usada para conferência está no [Jornal Noroeste](https://jornalnoroeste.com.br/noticia/fenasoja/em-evento-com-expositores-e-liderancas-foi-anunciado-o-presidente-da-fenasoja-2030), e a composição de Presidência e Vice-Presidência também aparece no [Portal Oficial da Fenasoja](https://fenasoja.com.br/portal-oficial/geral/resultados-da-fenasoja-2026-sao-enaltecidos-em-evento-de-encerramento/).

As fotos enviadas permanecem como referências oficiais de semelhança. As imagens auxiliares abaixo foram produzidas apenas para estudar roupa, articulações e silhueta na pose sentada:

- `docs/character-reference/fabiano-soltis-seated-reference.png`;
- `docs/character-reference/djeison-drey-seated-reference.png`.

Essas referências sentadas não substituem as fotografias, não redefinem traços faciais e não servem como prova de identidade. Turnarounds e renders intermediários têm a mesma condição auxiliar.

## Perfis individuais de refinamento

Os perfis executáveis ficam em `src/features/commercial-map/data/executiveCharacters.ts`. Cada um mantém os oito campos exigidos pelo supervisor visual: traços faciais, corpo, roupa, acessórios, animação, fraquezas atuais, correções aplicadas e oportunidades remanescentes.

### Fabiano Soltis — Presidente da Fenasoja

1. **Características faciais definidoras**
   - rosto oval-alongado, testa de largura média, mandíbula afunilada e queixo arredondado-quadrado;
   - olhos castanho-escuros amendoados e sobrancelhas escuras quase retas;
   - nariz médio e estreito, ponte reta e ponta arredondada;
   - lábio superior mais fino, inferior mais cheio e sorriso contido;
   - cabelo castanho muito escuro, laterais curtas e topo denso elevado para o lado;
   - barba curta entre um e três milímetros, mais marcada no queixo e na mandíbula;
   - pele clara-média com subtom quente, sem apagar a assimetria natural.
2. **Características corporais definidoras**
   - porte esbelto-atlético, ombros médios, cintura estreita e relação aproximada de 7,5 cabeças;
   - postura executiva madura, ereta e natural mesmo sentado;
   - altura visual discretamente inferior à de Djeison.
3. **Roupa**
   - terno azul-marinho, camisa branca, gravata verde-escura e sapatos sociais castanho-escuros;
   - paletó, camisa e gravata como volumes separados, com espessura, gola e queda perceptíveis;
   - dobras controladas em cotovelos, cintura, quadris, joelhos e barra na flexão sentada.
4. **Acessórios distintivos**
   - óculos leves de aro metálico/rimless, seguindo a direção explícita do produto sem encobrir olhos ou sobrancelhas.
5. **Considerações de animação**
   - `SeatedIdle` com postura madura, tronco estável, respiração de baixa amplitude e leve movimento de cabeça;
   - mãos apoiadas naturalmente, sem atravessar paletó, pernas ou sofá;
   - quadris sustentados pela almofada e sapatos em contato com o piso.
6. **Fraquezas visuais atuais**
   - não há vistas ortográficas reais de frente, perfis e costas nem medidas oficiais de altura;
   - os óculos fazem parte do briefing, mas não aparecem nas fotos frontais de Fabiano.
7. **Correções aplicadas**
   - a foto 3 foi corretamente reatribuída a Fabiano;
   - proporção de cabeça, largura dos ombros, cabelo e distribuição da barba foram individualizadas;
   - roupa e silhueta foram separadas do preset de Djeison.
8. **Oportunidades remanescentes**
   - aprovação humana de turntable em frente, três-quartos e perfis;
   - scan ou escultura supervisionada quando houver referências ortográficas e medidas;
   - blend shapes corretivos específicos para sorriso e pálpebras.

### Djeison Drey — Vice-Presidente da Fenasoja

1. **Características faciais definidoras**
   - rosto retangular-oval mais longo, testa alta, bochechas médias e queixo arredondado;
   - olhos claros azul-acinzentados e nariz médio-longo, de dorso quase reto;
   - cabelo loiro-escuro/castanho-claro, curto, texturizado e elevado para o lado;
   - barba cheia curta ruiva, com variação loira e discretamente grisalha;
   - pele clara com subtom rosado e sorriso expressivo.
2. **Características corporais definidoras**
   - porte alto e longilíneo, pernas longas, ombros médios e relação aproximada de 7,7 cabeças;
   - postura executiva sentada mais relaxada que a de Fabiano;
   - altura visual cerca de 7% maior que a de Fabiano.
3. **Roupa**
   - terno cinza médio, camisa branca, gravata verde-escura e sapatos sociais castanhos;
   - alfaiataria ajustada com espessura visível, tecido fosco e vincos de queda;
   - roupa separada do corpo para evitar aparência de textura pintada na pele.
4. **Acessórios distintivos**
   - óculos executivos de aro metálico claro, arredondado-retangular;
   - cuia escura na mão esquerda, erva-mate visível e bomba metálica.
5. **Considerações de animação**
   - `SeatedIdle` em fase diferente da de Fabiano, com respiração e microgestos não sincronizados;
   - estabilização da mão esquerda para a cuia permanecer vertical e não atravessar corpo, sofá ou gravata;
   - mão direita e ombros em repouso natural, sem gesto de aceno.
6. **Fraquezas visuais atuais**
   - as referências combinam lentes, iluminação e perspectivas diferentes, sem um perfil ortográfico puro;
   - dedos e pega do chimarrão dependem de aproximação a partir das fotos disponíveis.
7. **Correções aplicadas**
   - cabelo claro, barba ruiva, olhos claros, óculos e altura foram preservados como marcadores primários;
   - a foto 3 foi excluída deste perfil;
   - cuia e bomba foram dimensionadas pela mão e vinculadas ao membro, em vez de flutuar junto ao corpo.
8. **Oportunidades remanescentes**
   - aprovação humana da espessura dos aros, densidade da barba e tom dos olhos;
   - refinamento de IK dos dedos com captura de mão em repouso;
   - scan facial e groom de fios para uma versão de produção cinematográfica.

## Contrato do Visual Character Refinement Agent

O **Visual Character Refinement Agent** é uma camada de qualidade especializada e não um gerador genérico de NPC. Seu contrato é executar continuamente o ciclo:

> Referência → Modelo atual → Análise de diferenças → Correção → Validação no sistema → Refinamento final

Para cada pessoa, o agente deve:

1. carregar somente as referências atribuídas ao perfil correto;
2. comparar silhueta frontal, três-quartos e lateral, priorizando cabeça, olhos, nariz, boca, mandíbula, cabelo, barba e óculos;
3. medir relação cabeça/corpo, largura dos ombros, comprimento de braços e pernas e escala das mãos;
4. verificar se roupa, corpo, cabelo e acessórios são volumes e materiais distintos;
5. revisar a pega da cuia, a inserção da bomba e a superfície da erva-mate;
6. inspecionar `SeatedIdle`, incluindo quadris, joelhos, pés, mãos, respiração, microgestos e diferença de fase entre os dois personagens;
7. renderizar os modelos no sofá real da B12 e revisar contato, oclusão, luz, sombra, escala e enquadramento;
8. registrar fraquezas, correções e oportunidades no perfil correspondente;
9. repetir a comparação após toda mudança relevante, sem aceitar o primeiro render tecnicamente válido como resultado final.

### Critérios de bloqueio do agente

Uma versão não pode ser aprovada como “premium final” se apresentar qualquer um destes problemas:

- rosto genérico ou identidade cruzada;
- cabeça superdimensionada, ombros estreitos, braços rígidos ou mãos fora de escala;
- óculos atravessando a face, cabelo em bloco ou barba pintada sem volume;
- tecido fundido ao corpo, ausência de espessura ou dobra incompatível com a postura sentada;
- cuia sem erva, bomba sem resposta metálica ou pega fisicamente impossível;
- quadris flutuando ou afundados, coxas fora da almofada, pés sem contato com o piso ou joelhos anatomicamente impossíveis;
- corpos sobrepostos, microgestos mecanicamente idênticos ou chimarrão atravessando o sofá;
- escala incompatível com o sofá, a sala ou a câmera;
- personagens visíveis fora do interior da B12.

## Escopo exclusivo da Casa da Soja

O cadastro oficial do mapa preserva o identificador **B12 — Sede Fenasoja / Comissão Central**. “Casa da Soja” continua sendo um alias exclusivamente de apresentação; nenhuma entidade, tabela, migração, consulta ou inventário é renomeado.

A camada dos personagens é montada somente quando o interior resolve para `fenasoja-headquarters`. Ela fica dentro do grupo local já posicionado e rotacionado pela B12, herdando corretamente orientação, elevação, luz e oclusão da sala. Os outros interiores — pavilhões comerciais, pavilhão de gado e Mirante — mantêm suas cenas próprias e não carregam esses ativos.

O mapa externo não possui marcador, trajeto, card, botão de acompanhamento ou reação por zoom/proximidade. Entrar na B12 pelo fluxo normal do Mapa Comercial é a única forma de ver a dupla; sair do interior desmonta a camada e devolve a navegação ao mapa.

## Layout do sofá e contato físico

O layout canônico usa coordenadas locais da sala, não coordenadas cadastrais do parque:

| Elemento | Contrato local |
| --- | --- |
| Centro do sofá | `[1.27, 0, -1.70]` |
| Largura do sofá | `2.25 m` |
| Topo útil do assento | `y = 0.49 m` |
| Raiz de Fabiano | `[0.86, 0, -1.22]` |
| Raiz de Djeison | `[1.68, 0, -1.20]` |
| Separação lateral das raízes | `0.82 m` |
| Direção visual dos personagens | `+Z` local |

As posições das raízes representam a âncora aterrada do rig, próxima aos sapatos; não representam o ponto dos quadris. O clip `SeatedIdle` desloca e articula quadris, coxas, pernas e pés para colocar o corpo sobre a almofada, manter os sapatos no piso e apoiar o tronco sem atravessar o encosto. Por isso, contato deve ser validado com a malha deformada no clip, e não apenas com o `origin` do GLB.

O sofá foi dimensionado como móvel de escala interior. Base, almofadas, encosto e braços são volumes separados com espessura, material e recepção de sombra. Fabiano e Djeison ocupam lugares distintos dentro da largura útil; a distância evita sobreposição dos ombros e reserva espaço para o chimarrão de Djeison.

## Câmera e leitura da cena

O enquadramento é específico para o par sentado e permanece no referencial local da B12:

| Viewport | Posição final da câmera |
| --- | --- |
| Desktop | `[1.25, 1.42, 1.86]` |
| Compacto, até 640 px | `[1.25, 1.48, 2.84]` |
| Alvo comum | `[1.27, 0.98, -1.53]` |

A entrada anima suavemente até o retrato conjunto. O alvo fica centralizado entre os personagens e acima do assento; a posição compacta recua para preservar os dois corpos em telas estreitas. Depois da chegada, `OrbitControls` permite observação controlada sem pan, respeitando limites de distância e ângulo da sala.

Qualquer ajuste futuro no sofá, nas raízes ou na altura aparente deve revisar também os três valores de câmera. Um enquadramento aprovado em desktop não substitui a conferência em viewport compacto.

## Animação sentada e movimento reduzido

O runtime da B12 consome exclusivamente o clip contínuo `SeatedIdle`. O clip começa em uma pose sentada válida, mantém a raiz sem deslocamento pelo ambiente e aplica apenas respiração, pequenos movimentos de cabeça e variações discretas de postura. As fases individuais impedem que os dois corpos se movam como cópias sincronizadas.

Não existe máquina de estados de proximidade, caminhada, parada ou aceno. A câmera do visitante não altera o comportamento dos personagens.

Quando `prefers-reduced-motion: reduce` está ativo, cada ação é pausada em um quadro já sentado e estável. O resultado não pode retornar à pose em pé, saltar de posição ou perder o contato com sofá e piso. Ao mudar a preferência durante a sessão, a ação pausa ou retoma sem recriar a sala ou descartar os bindings do rig.

O canvas mantém `frameloop="demand"`. Enquanto a B12 está visível e movimento é permitido, a camada solicita quadros em frequência limitada; quando a aba fica oculta ou movimento reduzido está ativo, a atualização não continua desnecessariamente. O modo de gráficos reduzidos diminui primeiro a frequência e detalhes secundários, preservando rosto, roupa, óculos e chimarrão.

## Carregamento, fallback e sombras

Os dois GLBs são carregados de forma lazy sob `Suspense`, apenas dentro da B12. Cada ativo possui seu próprio `SeatedExecutiveErrorBoundary`: a falha de Fabiano não remove Djeison, a falha de Djeison não remove Fabiano, e nenhuma das duas falhas desmonta o interior, a câmera ou o fluxo de saída.

Cada instância clona o esqueleto do GLB e reaproveita os recursos carregados sem descartar prematuramente geometrias ou materiais compartilhados pelo cache. Ao desmontar, a ação é interrompida e o mixer libera apenas os bindings da instância.

O mapa congela o atlas global de sombras. Para evitar silhuetas animadas obsoletas, os personagens não atuam como casters dinâmicos; elipses locais e discretas representam o contato dos sapatos com o piso, enquanto sofá e sala preservam suas sombras estáticas. O fallback não altera o shadow map global.

## Modelos, materiais e chimarrão

Os ativos de runtime são dois GLBs separados:

- `public/models/executives/fabiano-soltis.glb`;
- `public/models/executives/djeison-drey.glb`.

O manifesto em `public/models/executives/manifest.json` registra unidades, origem, dimensões, hashes, rig, materiais e clips. O interior exige que os dois arquivos contenham `SeatedIdle`; ausência ou corrupção desse contrato aciona o fallback local.

Materiais separam pele, olhos, cabelo/barba, tecido do terno, camisa, gravata, sapatos e metais. Essa separação permite correções individualizadas e evita um único shader com aparência plástica.

O conjunto de chimarrão é tratado como objeto físico: cuia escura com boca e espessura, volume interno de erva-mate, bomba fina de resposta metálica e pega vinculada à mão esquerda de Djeison. Na pose sentada, cuia e bomba devem permanecer verticais e afastadas de face, gravata, antebraço, coxa, braço do sofá e corpo de Fabiano.

## Pipeline de geração e refinamento

O pipeline preserva uma separação clara entre referência, autoria e runtime:

1. fotografias oficiais são interpretadas no perfil correto;
2. referências sentadas auxiliares orientam apenas pose, roupa e silhueta;
3. `tools/blender/build_executive_characters.py` gera deterministicamente malhas, materiais, rig, chimarrão e `SeatedIdle`;
4. o gerador exporta um GLB por pessoa e atualiza o manifesto com hashes e métricas;
5. a validação do asset confere skin, clips, origem, ausência de deslocamento da raiz, nomes do chimarrão e orçamento do arquivo;
6. o runtime clona os rigs, aplica escala métrica, posiciona as raízes no layout da B12 e defasa os clips;
7. a validação em sistema revisa contato, câmera, materiais, fallback, desempenho e movimento reduzido;
8. o Visual Character Refinement Agent compara novamente os renders às fotografias e registra correções remanescentes.

Uma geração tecnicamente válida não encerra o refinamento. Os previews sentados devem ser comparados às referências e depois confirmados dentro da sala, porque câmera, luz, sofá e oclusão alteram a leitura final. As evidências versionadas desta rodada são:

- `docs/character-reference/fabiano-soltis-seated-preview.png`;
- `docs/character-reference/fabiano-soltis-face-closeup.png`;
- `docs/character-reference/djeison-drey-seated-preview.png`;
- `docs/character-reference/djeison-drey-face-closeup.png`.

Os previews sentados comprovam pose, contato, roupa e prop na câmera de autoria. Os close-ups são deliberadamente mantidos como evidência de limite: tornam visível que a camada facial procedural ainda não equivale a scan, fotogrametria ou escultura cinematográfica aprovada.

## Estratégia de desempenho

O Mapa Comercial já possui uma carga 3D relevante; por isso, a camada respeita um orçamento próprio:

- carregamento lazy exclusivo da B12, sem bloquear mapa, busca, seleção ou outros interiores;
- um `ErrorBoundary` por personagem, com degradação independente;
- `frameloop="demand"` preservado e atualização somente enquanto a animação sentada está visível;
- pausa quando a aba está invisível;
- nenhuma atualização de rota, navegação, proximidade ou câmera de acompanhamento;
- frequência reduzida em modo gráfico econômico e animação pausada em movimento reduzido;
- contato local barato, sem reativar atualização contínua do shadow map global;
- GLBs separados, hashes reproduzíveis e orçamento verificado antes da integração.

A meta não é maximizar polígonos, e sim maximizar semelhança perceptiva por unidade de custo. Tamanho do GLB, triângulos, materiais, texturas, joints e duração dos clips devem permanecer registrados para toda revisão de ativos.

## Matriz de QA

### Contratos automatizados

- perfis diferentes, referências corretamente atribuídas, alturas e roupas distintas;
- presença dos dois GLBs, skins, hashes, orçamento e clip `SeatedIdle` no manifesto e nos arquivos;
- escopo limitado ao kind `fenasoja-headquarters` e ausência da experiência nos demais interiores;
- ausência de card/menu, circuito, foco executivo e estado de acompanhamento no mapa e no store;
- raízes dentro da largura útil do sofá, separação mínima, topo do assento e direção visual válidos;
- câmera desktop e compacta centralizadas no par e posicionadas à frente dos personagens;
- fallback independente: falha de um GLB preserva o outro personagem e a sala;
- TypeScript, lint focado, testes do Mapa Comercial e build de produção.

Comandos de referência:

```powershell
npm.cmd exec vitest run src/test/commercialMapExecutiveAssets.test.ts src/test/commercialMapSeatedExecutives.test.tsx src/test/commercialMapInteraction.test.ts src/test/commercialMapStrategicLandmarks.test.ts
npm.cmd exec tsc -- --noEmit
npm.cmd exec eslint src/features/commercial-map/components/canvas/HeadquartersInteriorScene.tsx src/features/commercial-map/components/canvas/executives/SeatedExecutiveCharacters.tsx src/features/commercial-map/components/canvas/executives/SeatedExecutiveErrorBoundary.tsx src/features/commercial-map/data/executiveCharacters.ts src/features/commercial-map/utils/seatedExecutiveExperience.ts
npm.cmd run build
```

### Inspeção visual obrigatória

1. abrir o mapa completo e confirmar que não existe card/menu executivo nem personagens no exterior;
2. entrar na B12 pelo fluxo normal e confirmar que a dupla aparece somente após a cena interna carregar;
3. validar enquadramento completo de Fabiano, Djeison, sofá e chimarrão em desktop e viewport até 640 px;
4. orbitar dentro dos limites e inspecionar rostos, cabelo, barba, óculos e alfaiataria em frente e três-quartos;
5. confirmar quadris apoiados, coxas sobre as almofadas, sapatos no piso, mãos naturais e ausência de interseções com o sofá;
6. conferir cuia, erva, bomba, pega e folga em relação a Djeison, Fabiano e ao braço do sofá durante todo o `SeatedIdle`;
7. observar um ciclo completo e confirmar respiração sutil, fases diferentes e ausência de deslocamento das raízes;
8. repetir com `prefers-reduced-motion: reduce`, gráficos reduzidos, aba ocultada e reativada;
9. simular falha individual de cada GLB e confirmar que o outro personagem, a sala, a câmera e a saída continuam funcionais;
10. sair e reentrar na B12, verificando cleanup do mixer, restauração da navegação e ausência de duplicação;
11. abrir os interiores comercial, de gado e Mirante para confirmar ausência de regressões;
12. conferir que inventários, segmentos e geometrias oficiais permanecem idênticos.

Testes locais não substituem aprovação humana de identidade nem smoke autenticado no ambiente-alvo. Qualquer bloqueio de sessão deve ser registrado como validação não executada, nunca mascarado como sucesso.

## Honestidade sobre a fidelidade dos GLBs

Os GLBs desta entrega são **modelos procedurais rigados, individualizados a partir das referências**, com marcadores fortes de identidade, proporções diferentes, roupa separada, óculos, cabelo/barba, chimarrão e pose sentada funcional. Eles são adequados para validar a arquitetura do interior, câmera, materiais, fallback e animação `SeatedIdle` dentro da B12.

Eles **não são scans faciais, reconstruções fotogramétricas nem esculturas humanas finais aprovadas pelos retratados**. Fotografias frontais e três-quartos, sem perfis ortográficos, medidas ou captura de expressão, não permitem prometer identidade biométrica ou fidelidade cinematográfica absoluta. O termo “alta fidelidade” nesta fase descreve a intenção, os marcadores individualizados e o rigor da integração — não uma afirmação de que a escultura procedural já equivale a um digital double de estúdio.

Para atingir o último nível de reconhecibilidade, o pipeline deve manter os mesmos IDs, rig e contrato `SeatedIdle` e substituir somente os meshes/materiais após:

1. captura fotográfica controlada de frente, dois perfis, três-quartos, costas e expressões neutra/sorriso;
2. medidas de altura, ombros, torso, braços, pernas, cabeça, mãos e óculos;
3. escultura supervisionada ou scan, groom de cabelo/barba e texturas de pele autorizadas;
4. revisão conjunta com Fabiano e Djeison;
5. retarget da pose sentada e correções de cloth/IK no contato com sofá e chimarrão;
6. nova rodada do Visual Character Refinement Agent e QA em cena.

Essa separação torna a implementação honesta e evolutiva: a experiência interna pode receber ativos finais sem reintroduzir circuito externo, menu, acompanhamento ou contratos cadastrais paralelos.

## Resumo operacional

- **Modelagem:** dois perfis separados; a foto 3 corrige e fortalece Fabiano, enquanto as fotos 4–5 definem Djeison. Roupa, cabelo, barba, óculos, corpo e chimarrão têm especificações individuais.
- **Presença:** os personagens existem exclusivamente no sofá da B12, sem card/menu, rota, marcador ou comportamento externo.
- **Animação:** `SeatedIdle` mantém pose fisicamente integrada, microgestos fora de fase e fallback estável para movimento reduzido.
- **Câmera:** presets locais distintos para desktop e telas compactas centralizam a dupla sem alterar os demais interiores.
- **Confiabilidade:** carregamento lazy, fallback por personagem, cleanup do mixer, frame sob demanda e contato local preservam a sala e o mapa.
- **Evolução:** os GLBs procedurais validam o recurso sentado, mas a aprovação premium final depende de escultura/scan supervisionado e validação humana de semelhança.
