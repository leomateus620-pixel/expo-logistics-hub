# O Nascer da Alvorada — reconstrução definitiva e validação

## Entrega

`O Nascer da Alvorada` é uma experiência full-screen renderizada ao vivo com React Three Fiber, Three.js e WebGL. Não usa vídeo, MP4, GIF, slideshow ou frames pré-renderizados. A câmera percorre uma timeline determinística de 10,5 segundos e, depois da revelação, permanece em uma composição viva de duração indefinida até o usuário fechar a experiência.

O único launcher continua sendo o botão semântico que envolve a marca visual `FENASOJA 2028` no cabeçalho do portal. As variantes responsivas da marca permanecem dentro do mesmo botão, de modo que existe um único trigger no DOM. Não foram criadas rotas, entradas de menu, cards, atalhos, registries ou deep links. A contagem oficial existente continua independente.

## Jornada visual e câmera

| Intervalo | Fase | Implementação |
| --- | --- | --- |
| 0,0–2,0 s | Brasil orbital | Terra em escala orbital, mapas diurno/noturno, nuvens, atmosfera Fresnel, cidades e direção solar coerente |
| 2,0–4,0 s | Rio Grande do Sul | Limite geográfico progressivo, aproximação física e marcador georreferenciado de Santa Rosa |
| 4,0–4,5 s | Estabilização | Novo momento de 0,5 s com micro movimento, marcador estabilizado e relação territorial legível |
| 4,5–6,0 s | Descida local | Corredor espacial de nuvens e haze que oculta somente a troca de escala orbital/local |
| 6,0–7,5 s | Santa Rosa | Voo cinematográfico sobre terreno, vias, bairros, vegetação e lavouras reconstruídos com dados reais |
| 7,5–9,0 s | Ascensão | Câmera reduz avanço, sobe e inclina progressivamente para a Alvorada |
| 9,0–10,5 s | Revelação | Luz direcional revela `FENASOJA`; o badge tridimensional `2028` entra 160 ms depois |
| 10,5 s em diante | Quadro final | Céu, nuvens, atmosfera e reflexos continuam vivos; não há auto-close, redirect ou reinício |

A posição e o `lookAt` da câmera percorrem splines Catmull-Rom independentes. Os endpoints têm derivadas suaves, FOV contínuo, bank mínimo e composição própria para desktop e portrait. Na cidade, a lente cobre quilômetros de centro urbano e campo, preservando horizonte, parallax e escala física em vez de enquadrar uma quadra abstrata.

## Santa Rosa reconstruída

A cidade anterior, baseada em blocos genéricos, foi substituída por uma pipeline geográfica batelada:

- 9.000 footprints reais da coleção Microsoft Global ML Building Footprints para o Brasil;
- heightfield Mapzen de 129 × 129 amostras, cobrindo 9,4 km e elevações de 204 m a 373 m;
- 791 polylines de vias OpenStreetMap com hierarquia, largura, calçadas e marcações próprias;
- sete classes arquitetônicas com alturas, cores, cobertura, material, rugosidade, fachada, janelas e iluminação diferenciadas;
- UV e seed por edifício, evitando que pavimentos e janelas compartilhem uma grade global repetitiva;
- telhados flat, gable e hip, fachadas PBR sem brilho plástico e janelas acesas esparsas;
- vegetação instanciada com copas variadas, corredores verdes e parque, sem invadir footprints e vias visíveis;
- textura rural determinística, lavouras, relevo ondulado e LOD por capacidade.

Os dados são convertidos por `scripts/build_alvorada_geodata.py` para um ativo compacto carregado uma única vez. Edifícios, vias, telhados, terreno e vegetação são mesclados/instanciados; não existem milhares de componentes React nem material único por prédio.

O horizonte distante usa `santa-rosa-horizon.webp` no desktop/landscape e
`santa-rosa-horizon-portrait.webp` no portrait. Ambos são variantes ambientais
de um panorama original gerado para o projeto com OpenAI ImageGen, a partir de
prompt autoral e de uma fotografia usada somente como referência
composicional. A fotografia não foi incorporada nem redistribuída. Durante a
chegada, uma placa ambiental temporária acompanha a câmera para ocultar a troca
de escala; ela desaparece antes da ascensão. Depois disso, o panorama distante
permanece atrás da cidade WebGL. Geometria, iluminação, atmosfera, parallax e
câmera continuam executados ao vivo; não é uma sequência pré-renderizada.

## Alvorada, luz e identidade

O céu CSS/gradiente foi substituído pelo modelo físico `Sky` do Three.js, baseado em Preetham, com Rayleigh, Mie, turbidez, direção solar e exposição animadas. Uma calibração espectral preserva a energia do scattering e enfatiza a estrutura identitária sem pintar um gradiente de interface:

- azul luminoso e mais profundo no zênite;
- transição azul/lavanda no meio do céu;
- laranja junto ao horizonte;
- amarelo e branco quente na região solar.

O sol possui núcleo preciso, corona controlada e bloom seletivo. Nuvens usam três texturas procedurais distintas, estratos, deriva e iluminação quente/fria. A mesma direção solar alimenta o `Sky`, as nuvens, o disco solar e a luz direcional da cidade. ACES, sRGB, exposição, SMAA, bloom discreto e vignette leve fecham a cadeia de cor.

O título final é composto integralmente dentro do WebGL, não como texto HTML.
O símbolo oficial FENASOJA aparece ao lado do wordmark em um plano texturizado
com recorte alpha e revelação luminosa própria. `FENASOJA` permanece como
geometria 3D de alta resolução, com material físico branco/prata e reflexos
quentes e frios; `2028` permanece no badge laranja tridimensional aprovado. O
símbolo não substitui o “O”, não há soja dourada, card ou painel. Símbolo,
wordmark e edição compartilham máscara direcional, dithering e sweep especular;
no final, o conjunto ocupa aproximadamente 64% da largura desktop e 76% no
portrait.

## Assets autorais, marca e manifesto

| Asset | Proveniência | Transformação de runtime |
| --- | --- | --- |
| `santa-rosa-horizon.webp` | panorama ambiental original gerado com OpenAI ImageGen | variante horizontal com céu removido e transparência suave para composição com o `Sky` ao vivo |
| `santa-rosa-horizon-portrait.webp` | mesma fonte ImageGen | enquadramento portrait específico, sem copiar ou redistribuir a fotografia de referência |
| `fenasoja-symbol-official.png` | símbolo oficial fornecido e aprovado pelo solicitante | somente limpeza de pixels quase transparentes, recorte e centralização em canvas transparente de 512 × 512; sem redesenho ou alteração cromática |
| `reference-assets.json` | manifesto versionado local | registra SHA-256 das fontes aprovadas e os nomes dos assets derivados |

O manifesto registra o panorama ImageGen pela origem
`89c25b44bc3afaf9b49e688b3214c13f9da613de4371e3145915e822b4808ecd`
e o símbolo aprovado pela origem
`cafa3155fc8f7e7d060dafc2ab5ff619e4c953565bc57821133b39a011b23811`.
O empacotamento reproduzível fica em
`scripts/build_alvorada_reference_assets.py`. O símbolo continua sendo marca
protegida da FENASOJA; este relatório não declara licença aberta nem autorização
de reutilização fora do projeto.

## Geografia e licenças

- Limites de Brasil, Rio Grande do Sul e Santa Rosa: IBGE.
- Coordenada do marcador: `-27.8707, -54.4817`, validada dentro das três malhas.
- Edificações: Microsoft Global ML Building Footprints — CDLA Permissive 2.0.
- Terreno: Mapzen Terrain Tiles — CC BY 4.0.
- Vias: OpenStreetMap — ODbL.
- Créditos, versões, licenças e URLs: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).
- As referências geográficas e fotográficas fornecidas pelo solicitante não são redistribuídas. O panorama de runtime é um asset original ImageGen; o símbolo oficial é a exceção de marca explicitamente fornecida e aprovada para esta implementação, conforme o manifesto.

## Desempenho e resiliência

- Chunk lazy, prefetch somente por foco/hover/toque e preload dos ativos críticos.
- Tiers `hardware`, `compatible` e `unavailable`; o tier compatível mantém WebGL com DPR, sombras, pós-processamento e densidade reduzidos antes de usar fallback.
- LOD de 9.000 / 5.400 / 3.000 edifícios, 2.500 / 1.600 / 700 árvores e terreno 128 / 96 / 64 segmentos.
- DPR adaptativo, geometrias bateladas, materiais compartilhados, culling, texturas procedurais reutilizadas e teardown de geometrias, materiais, texturas e render targets ao fechar.
- A amostra controlada em Chrome registrou 55 geometrias e 35 texturas no tier `medium`. O ambiente de automação limita `requestAnimationFrame` a aproximadamente 1 FPS, portanto esse contador não é apresentado como benchmark de dispositivo; a validação de 50–60 FPS continua sendo um gate de hardware real antes de produção.
- `prefers-reduced-motion` é ignorado somente dentro da Alvorada. Câmera, Terra, descida, cidade, céu e título mantêm movimento e duração completos; o restante do portal continua seguindo as regras globais.
- A primeira perda real de contexto pausa e preserva o tempo, apresenta estado neutro de recuperação, remonta uma única vez e retoma a mesma fase. Erro determinístico de asset/shader, timeout ou segunda perda entram em fallback terminal sem loader sobreposto.
- O fallback também permanece aberto até fechamento explícito; não há timer de auto-close.
- Timeline e watchdogs pausam em aba oculta, evitando saltos ou degradação fora de vista.
- O overlay contém `Tab`/`Escape`, bloqueia scroll, aplica `inert` ao portal e restaura foco ao único launcher.

## Validação visual e funcional executada

O fluxo atualizado foi exercitado no Chrome real pelo único launcher existente
no bloco `FENASOJA 2028` do portal. A URL permaneceu `/portal` durante abertura,
execução, fallback e fechamento; nenhum launcher, rota ou deep link secundário
foi exposto.

- viewport desktop efetivo de 1440 × 900;
- viewport mobile portrait efetivo de 375 × 844;
- viewport small mobile efetivo de 305 × 568;
- frame `cityFlight` capturado por volta de 6,42 s, com panorama, cidade WebGL e movimento local ativos;
- composição `finalHold` alcançada e capturada depois da revelação do símbolo oficial, `FENASOJA` e `2028`;
- `prefers-reduced-motion: reduce` emulado no navegador manteve o renderer `webgl`, executou a timeline cinematográfica completa e alcançou `finalHold`;
- uma perda real provocada por `WEBGL_lose_context` recuperou o Canvas uma vez;
- a segunda perda real entrou no fallback terminal e permaneceu aberta por 5,2 s, sem auto-close;
- o fechamento não alterou a URL `/portal`, preservando o launcher exclusivo como única entrada da experiência.

## Verificações automatizadas

- 44 testes dedicados cobrem timeline, hold infinito, geografia, dataset v2, tiers WebGL, reduced motion, recovery, fallback, foco e exclusividade de acesso;
- TypeScript `--noEmit`;
- ESLint direcionado aos arquivos alterados;
- build de produção;
- suíte Vitest completa: 614 de 643 testes passaram; as 29 falhas permanecem restritas aos quatro arquivos herdados de Cronograma (`cronogramaMobileOverlays`, `cronogramaMobilePresentation`, `cronogramaTimeline` e `eventHarvestCompletion`), sem regressão nova da Alvorada;
- `git diff --check`.

O áudio, definido como opcional, permanece fora do escopo. A cidade é uma reconstrução híbrida em tempo real baseada em dados geográficos, não fotogrametria.
