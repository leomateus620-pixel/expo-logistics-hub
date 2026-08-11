# O Nascer da Alvorada — pipeline visual e validação

## Resultado

`O Nascer da Alvorada` permanece uma experiência full-screen renderizada ao
vivo com React Three Fiber, Three.js e WebGL. A jornada é controlada por uma
timeline autoritativa de 12,4 segundos e permanece em um quadro final vivo até
o fechamento explícito.

A correção elimina os dois planos fotográficos que eram renderizados sobre a
cidade WebGL. Não há panorama, imagem de Santa Rosa, vídeo, slideshow ou frame
pré-renderizado no pipeline visível. Terra, máscara atmosférica, cidade, céu e
título têm janelas explícitas de entrada, saída e residência; somente a cena
dominante pode compor o quadro.

O launcher continua sendo o único botão semântico da marca `FENASOJA 2028` no
cabeçalho do portal. Rotas, autenticação, permissões, contagem oficial e demais
módulos não foram alterados.

## Causa raiz corrigida

O componente removido `SantaRosaCinematicBackdrop` desenhava a mesma imagem
duas vezes dentro do WebGL:

- um plano preso à câmera, sem teste de profundidade e com opacidade alta;
- um panorama curvo cuja opacidade não retornava a zero.

Ao mesmo tempo, `EarthScene`, cidade, céu, título e máscara permaneciam
montados. O resultado era a fotografia colada sobre a animação, a dupla cena e
o céu final contaminado. O flash cinza vinha de uma esfera de haze quase opaca.

A nova orquestração fica centralizada em `deriveAlvoradaVisualState`.
Componentes não definem mais janelas concorrentes de visibilidade. Terra e
cidade não ficam visualmente ativas juntas; a Terra sai da GPU após a troca de
escala, a cidade sai antes do quadro final e as texturas orbitais são descartadas
e removidas do cache.

## Jornada visual

| Intervalo | Fase | Composição |
| --- | --- | --- |
| 0,0–2,0 s | Brasil orbital | Terra, atmosfera, nuvens, luzes urbanas e aproximação suave |
| 2,0–4,0 s | Rio Grande do Sul | limite territorial e marcador georreferenciado de Santa Rosa |
| 4,0–4,8 s | estabilização | marcador legível, desaceleração e início da passagem atmosférica |
| 4,8–6,4 s | descida local | troca de escala protegida por nuvens procedurais leves; nenhuma imagem |
| 6,4–8,8 s | voo urbano | terreno, vias, edifícios e vegetação batelados em avanço contínuo |
| 8,8–10,6 s | ascensão | câmera sobe, reduz o avanço e abre a composição do céu |
| 10,6–12,4 s | reveal | símbolo oficial, `FENASOJA` e badge `2028` entram em sequência |
| 12,4 s em diante | quadro final | somente céu vivo, sol, nuvens e identidade resolvida |

A câmera usa splines independentes para posição e `lookAt`, easing de quinta
ordem e FOV contínuo. A troca entre coordenadas orbitais e locais ocorre dentro
da máscara atmosférica. Um terreno procedural distante ao vivo prolonga o
heightfield de Santa Rosa e evita expor a borda quadrada do dataset.

## Cidade, céu e identidade

A cidade mantém a pipeline geográfica batelada:

- footprints reais, agrupados por classe arquitetônica;
- heightfield Mapzen e vias OpenStreetMap;
- geometrias mescladas, materiais compartilhados e vegetação instanciada;
- LOD por perfil, sem milhares de componentes React independentes;
- terreno distante procedural de baixo custo para continuidade do horizonte.

O céu combina o modelo físico `Sky` do Three.js com uma calibração espectral no
próprio shader. A composição separa azul profundo no alto, azul/lavanda no meio,
laranja e dourado no horizonte. Sol, nuvens, direção da luz e iluminação urbana
compartilham a mesma direção solar. As nuvens usam texturas procedurais menores
no mobile e distribuição específica para portrait, sem ocupar a área da marca.

O título final permanece integralmente em WebGL. O símbolo oficial é uma
textura com alpha; `FENASOJA` e `2028` são geometrias tridimensionais. O
enquadramento portrait foi recalibrado para não cortar o badge nem colidir com
as bordas seguras.

## Assets de referência

| Asset | Estado de runtime |
| --- | --- |
| `santa-rosa-horizon.webp` | preservado apenas como referência versionada; não é carregado nem renderizado |
| `santa-rosa-horizon-portrait.webp` | preservado apenas como referência versionada; não é carregado nem renderizado |
| `fenasoja-symbol-official.png` | usado no título WebGL e no fallback terminal |
| `reference-assets.json` | mantém SHA-256 e proveniência dos assets aprovados |

O manifesto e o script `scripts/build_alvorada_reference_assets.py` continuam
reprodutíveis. A marca FENASOJA permanece protegida; este documento não declara
licença aberta nem autoriza reutilização fora do projeto.

## Desempenho e lifecycle

- apenas Terra e limites territoriais são aquecidos antes da abertura;
- cidade, fonte e símbolo são transferidos como assets secundários somente ao
  abrir a experiência;
- cada cena pesada usa seu próprio limite de `Suspense`, evitando que a cidade
  bloqueie o primeiro quadro orbital;
- `Preload all` foi removido;
- perfis mobile não usam sombras, bloom, antialias ou pós-processamento;
- DPR mobile fica entre 0,85 e 1,25;
- o perfil mobile usa 3.000 edifícios, 900 árvores, 5 nuvens e terreno 72;
- o renderer compatível usa 1.800 edifícios, 500 árvores e DPR máximo 1;
- quedas sustentadas degradam qualidade no máximo duas vezes
  (`high → medium → low`), sem atualizações React por frame;
- a telemetria expõe FPS, frame time médio/p95, frames longos, draw calls,
  triângulos, geometrias, texturas e pixels renderizados;
- geometrias, materiais, texturas e caches deixam de permanecer residentes
  depois da sua fase.

No Chrome controlado em 390 × 720, com cache local aquecido e DPR de emulação 1,
o Canvas apareceu em 568 ms. A jornada registrou 60 FPS nos gates amostrados,
p95 entre 16,9 e 18,8 ms, 37 draw calls e aproximadamente 227 mil triângulos no
voo urbano. O quadro final ficou em 11 draw calls, 25 geometrias, 6 texturas e
aproximadamente 17 mil triângulos. O heap JS final observado foi 34 MB.

Esses números são diagnósticos comparativos do ambiente de automação, não um
benchmark universal. A validação em Safari físico continua sendo gate de
publicação em produção.

## Validação desta correção

O fluxo foi exercitado pelo launcher real em `/portal`, sem alterar a URL.
Foram inspecionados no tempo exato:

- marcador Santa Rosa em 3,92 s;
- estabilização e handoff em 4,68 s e 4,95 s;
- voo urbano em 6,48 s;
- ascensão em 9,38 s;
- reveal em 11,49 s;
- quadro final em 12,40 s.

No portrait controlado não houve imagem sobre a animação, segundo Canvas,
`img` residual, panorama solicitado, flash branco ou cena urbana no quadro
final. O badge `2028` ficou integralmente dentro da composição. A cidade saiu
da GPU antes do hold e as quatro texturas orbitais foram liberadas.

O viewport CSS desktop de 1440 × 900 também percorreu handoff, cidade e quadro
final. O Canvas ocupou os 1440 px depois da neutralização temporária do
`scrollbar-gutter` global, registrou 50 FPS no gate urbano e 60 FPS no hold no
perfil médio adaptativo.

Verificações executadas:

- 52/52 testes dedicados à Alvorada em 8 arquivos;
- TypeScript `--noEmit`;
- ESLint direcionado a todos os arquivos alterados;
- build de produção;
- `git diff --check`;
- suíte global: o rerun reproduziu as 29 falhas herdadas em
  `cronogramaMobileOverlays`, `cronogramaMobilePresentation`,
  `cronogramaTimeline` e `eventHarvestCompletion`; nenhum teste da Alvorada
  falhou.

Safari/iPhone físico não esteve disponível neste ambiente e não é apresentado
como validado.

## Geografia e licenças

- limites de Brasil, Rio Grande do Sul e Santa Rosa: IBGE;
- marcador: `-27.8707, -54.4817`;
- edificações: Microsoft Global ML Building Footprints — CDLA Permissive 2.0;
- terreno: Mapzen Terrain Tiles — CC BY 4.0;
- vias: OpenStreetMap — ODbL;
- detalhes: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).

O áudio, definido como opcional, permanece fora do escopo. A cidade é uma
reconstrução híbrida em tempo real baseada em dados geográficos, não
fotogrametria.
