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

## Alvorada, luz e identidade

O céu CSS/gradiente foi substituído pelo modelo físico `Sky` do Three.js, baseado em Preetham, com Rayleigh, Mie, turbidez, direção solar e exposição animadas. Uma calibração espectral preserva a energia do scattering e enfatiza a estrutura identitária sem pintar um gradiente de interface:

- azul luminoso e mais profundo no zênite;
- transição azul/lavanda no meio do céu;
- laranja junto ao horizonte;
- amarelo e branco quente na região solar.

O sol possui núcleo preciso, corona controlada e bloom seletivo. Nuvens usam três texturas procedurais distintas, estratos, deriva e iluminação quente/fria. A mesma direção solar alimenta o `Sky`, as nuvens, o disco solar e a luz direcional da cidade. ACES, sRGB, exposição, SMAA, bloom discreto e vignette leve fecham a cadeia de cor.

O título final é geometria 3D de alta resolução, não texto HTML. `FENASOJA` usa material físico branco/prata com reflexos quentes e frios. `2028` permanece no badge laranja tridimensional aprovado. Não há soja, símbolo adicional, card ou painel. A revelação usa máscara direcional, dithering, reflexo progressivo e sweep especular; no final ocupa aproximadamente 58% da largura desktop e 72% no portrait.

## Geografia e licenças

- Limites de Brasil, Rio Grande do Sul e Santa Rosa: IBGE.
- Coordenada do marcador: `-27.8707, -54.4817`, validada dentro das três malhas.
- Edificações: Microsoft Global ML Building Footprints — CDLA Permissive 2.0.
- Terreno: Mapzen Terrain Tiles — CC BY 4.0.
- Vias: OpenStreetMap — ODbL.
- Créditos, versões, licenças e URLs: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).
- As imagens fornecidas pelo solicitante foram usadas somente como direção visual e não são redistribuídas.

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

O fluxo foi exercitado no Chrome real pelo launcher existente em `/portal`. A rota local é pública e, por isso, as credenciais fornecidas não foram necessárias nem persistidas. O código novo ainda não estava implantado no ambiente remoto durante esta validação.

- desktop solicitado em 1440 × 900 e portrait solicitado em 390 × 844; o controlador Chrome reportou respectivamente 2160 × 1350 e 585 × 1266 por aplicar `devicePixelRatio` 0,667;
- frames inspecionados: Brasil, aproximação ao RS, marcador, estabilização 4,25 s, ponte atmosférica 5,25 s, chegada 6,8 s, ascensão, entrada do título e quadro final 10,5 s;
- título sem recorte, horizonte protegido e controle de fechar dentro da safe area nos dois formatos;
- final `finalHold` continuou aberto por mais de 5 s, com `ambientElapsed` avançando e `elapsed` fixo em 10,5 s;
- `prefers-reduced-motion: reduce` confirmado pelo navegador com renderer `webgl`, timeline completa e final aberto;
- `WEBGL_lose_context` real provocado em Brasil, descida de Santa Rosa (4,958 s), ascensão (8,934 s), revelação (9,950 s) e quadro final;
- em todas as primeiras perdas, o Canvas voltou a `webgl` no mesmo tempo/fase; uma segunda perda entrou em `fallback` com motivo `context-lost` e permaneceu aberta;
- X fechou sem navegar e o foco retornou ao launcher `Abrir O Nascer da Alvorada`;
- uma aba Chrome nova terminou sem erros da aplicação/WebGL; permaneceram somente dois avisos futuros conhecidos do React Router.

## Verificações automatizadas

- 40 testes dedicados cobrem timeline, hold infinito, geografia, dataset v2, tiers WebGL, reduced motion, recovery, fallback, foco e exclusividade de acesso;
- TypeScript `--noEmit`;
- ESLint direcionado aos arquivos alterados;
- build de produção;
- suíte Vitest completa: 610 de 639 testes passaram; as 29 falhas permanecem restritas aos quatro arquivos herdados de Cronograma (`cronogramaMobileOverlays`, `cronogramaMobilePresentation`, `cronogramaTimeline` e `eventHarvestCompletion`), sem regressão nova da Alvorada;
- `git diff --check`.

O áudio, definido como opcional, permanece fora do escopo. A cidade é uma reconstrução híbrida em tempo real baseada em dados geográficos, não fotogrametria.
