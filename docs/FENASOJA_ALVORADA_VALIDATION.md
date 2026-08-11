# O Nascer da Alvorada — implementação e validação

## Entrega

`O Nascer da Alvorada` é uma experiência full-screen renderizada ao vivo com React Three Fiber, Three.js e WebGL. A sequência usa uma timeline única de 8,6 segundos e não depende de vídeo, GIF ou frames pré-renderizados.

O único launcher é o botão semântico que envolve a marca visual `FENASOJA 2028` no cabeçalho do portal. As variantes responsivas da marca permanecem dentro desse mesmo botão, de modo que existe apenas um trigger no DOM. Não foram adicionadas rotas, entradas de menu, cards, atalhos, registries ou deep links. A contagem oficial existente continua independente e conserva sua navegação original.

## Jornada visual

| Intervalo | Cena | Implementação |
| --- | --- | --- |
| 0,0–2,0 s | Brasil orbital | Globo PBR, mapa diurno/noturno, nuvens, atmosfera Fresnel, estrelas e nascer do sol |
| 2,0–4,0 s | Rio Grande do Sul | Limite oficial IBGE progressivo, marcador geográfico de Santa Rosa e aproximação física da câmera |
| 4,0–5,5 s | Santa Rosa | Nuvem/haze como máscara espacial, malha viária OpenStreetMap e cidade procedural instanciada |
| 5,5–7,0 s | Alvorada | Elevação contínua da câmera, scattering atmosférico, nuvens, sol e horizonte |
| 7,0–8,6 s | FENASOJA 2028 | Título 3D metálico integrado ao céu e `2028` em laranja, sem soja ou símbolo adicional |

A posição e o `lookAt` da câmera percorrem splines independentes, com FOV e bank interpolados. O enquadramento mobile possui offsets contínuos próprios para proteger marcador, horizonte e título.

## Geografia e ativos

- Limites de Brasil, Rio Grande do Sul e Santa Rosa: malhas oficiais do IBGE.
- Coordenada do marcador: `-27.8707, -54.4817`, validada dentro das três malhas.
- Cidade: malha viária real do centro de Santa Rosa, derivada do OpenStreetMap, combinada a terreno, edifícios, vegetação e veículos procedurais em tempo real.
- Texturas planetárias e fonte 3D: ativos do Three.js r170.
- Créditos, licenças e URLs imutáveis: [`public/alvorada/ATTRIBUTION.md`](../public/alvorada/ATTRIBUTION.md).
- As imagens fornecidas pelo usuário foram usadas apenas como direção visual e não são redistribuídas pelo projeto.

## Desempenho e resiliência

- Carregamento lazy: o chunk da experiência só é solicitado por foco, hover, toque ou clique na marca.
- DPR e densidade adaptativos, instancing de cidade/vegetação, sombras e detalhe reduzidos no mobile.
- `PerformanceMonitor` reduz qualidade diante de regressão sustentada.
- Perda de contexto WebGL troca a cena por um fallback leve sem derrubar o portal.
- WebGL indisponível ou `prefers-reduced-motion` usa um quadro CSS acessível, sem mídia pré-renderizada.
- Overlay modal contém `Tab`/`Escape`, bloqueia scroll, aplica `inert` ao portal e restaura foco ao launcher.

## Validação executada

Validação visual autenticada no portal local com a conta indicada pelo solicitante, sem persistir credenciais no repositório:

- desktop: `1440 × 900` CSS;
- mobile: `390 × 844` CSS;
- sequência completa inspecionada em todas as transições;
- somente um launcher `Abrir O Nascer da Alvorada` presente;
- URL permaneceu em `/portal` ao abrir e concluir;
- título final permaneceu legível e sem recorte nos dois formatos;
- modo de movimento reduzido, fechamento automático, Escape e restauração de foco verificados;
- perda real do contexto WebGL provocada no navegador e recuperação por fallback confirmada;
- captura instrumentada durante a animação ficou aproximadamente em 41–42 FPS, sem travamentos visíveis; esse valor é uma amostra durante screencast, não um benchmark de laboratório.

## Verificações automatizadas

- testes dedicados: timeline, geografia, exclusividade de acesso e integração do portal;
- regressão adjacente: portal, acessibilidade, arquitetura, marca e contagem oficial;
- TypeScript `--noEmit`;
- ESLint direcionado aos arquivos alterados;
- build de produção;
- `git diff --check`.

O áudio, definido como opcional no escopo, não foi incluído. A cidade é uma composição híbrida baseada na malha viária real, não fotogrametria.
