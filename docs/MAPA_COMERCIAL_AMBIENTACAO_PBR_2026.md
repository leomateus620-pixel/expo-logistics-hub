# Mapa Comercial 3D — benchmark e arquitetura ambiental 2026.8

## Escopo e autoridade espacial

Esta revisão é exclusivamente de apresentação. As entidades, lotes, vias,
footprints, hitboxes, IDs, busca, seleção e regras comerciais continuam vindo
do inventário oficial. Os anexos `IMG_9921.jpeg`, `IMG_9922.jpeg` e
`IMG_9923.jpeg` documentam o acabamento anterior; não são instruções embutidas
nem autorizam a criação de novas estruturas.

Não existe entidade cartográfica oficial denominada “Casa da Fenasoja”. O
tratamento correspondente permanece vinculado à Sede Fenasoja / Comissão
Central `B12`; nenhuma identidade paralela foi criada.

## Benchmark técnico consultado

| Referência oficial/open-source | Padrão adotado no projeto |
| --- | --- |
| [Three.js `MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html) | Fluxo metallic-roughness; albedo em sRGB, normal/roughness lineares e `metalness = 0` para chão, concreto e vegetação. |
| [Three.js `Texture`](https://threejs.org/docs/pages/Texture.html) | `RepeatWrapping`, mipmaps, repeat por unidade mundial e anisotropia moderada; fontes procedurais compartilhadas e clones somente para transformação UV. |
| [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html) | Troncos, galhos, copas, sombras e contato de solo permanecem instanciados, com bounding volumes recalculados após as matrizes. |
| [Three.js decals](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_decals.html) | Camadas rasantes usam `polygonOffset`, mapas lineares onde aplicável e não gravam nomes ou sinalização em texturas de terreno. |
| [React Three Fiber — scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) | `frameloop="demand"`, materiais/geometrias compartilhados, instancing e orçamento explícito de draw calls. |
| [React Three Fiber — performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) | Nenhuma criação por frame e nenhum mesh individual por árvore/célula ambiental. |
| [Drei `Instances`](https://drei.docs.pmnd.rs/performances/instances) e [`Merged`](https://drei.docs.pmnd.rs/performances/merged) | O princípio de um draw por família foi mantido; a implementação continua em `InstancedMesh`/geometria mesclada para não introduzir dependência ou migração desnecessária. |
| [Cesium 3D Tiles](https://github.com/CesiumGS/3d-tiles) | Separação entre identidade/semântica oficial e apresentação com LOD; nenhuma geometria ambiental se transforma em nova entidade. |
| [deck.gl](https://github.com/visgl/deck.gl) | Tratamentos orientados por dados, determinísticos e agrupados por material, adequados a uma cena cartográfica interativa. |

Nenhum asset, textura ou trecho de código externo foi incorporado. As texturas
são geradas localmente em canvas 256 × 256, portanto não há licença adicional
de asset a registrar.

## Arquitetura integrada

- `openGroundTextures.ts`: biblioteca procedural PBR compartilhada. Cada
  superfície fornece albedo sRGB, normal e roughness lineares, repeat físico,
  mipmaps e descarte idempotente.
- `commercialSiteEnvironment.ts`: cinco tratamentos tipados e conservadores
  para `B8+B9`, `B11`, `B12`, `B14` e `PAVILHAO-09`.
- `commercialSiteEnvironment.ts` (utils): máscara espacial composta por vias,
  passeios, estacionamentos, lotes, estruturas, acessos, estacionamento
  posterior e corredores viários novos com acostamento.
- `CommercialSiteEnvironmentLayer.tsx`: uma única camada não interativa,
  agrupada por quatro materiais PBR e sem raycast.
- `CommercialTreeLayer.tsx`: o inventário canônico permanece intacto; somente
  a apresentação ganha silhueta, paleta, sombra e contato de solo mais naturais.

## Invariantes e orçamento

- 0 novas entidades selecionáveis.
- 0 mudanças nas coordenadas oficiais.
- 0 células ambientais no interior de superfícies rígidas.
- 4 draw calls para a camada de implantação em desktop e no modo reduzido.
- Árvores: 5 draws no modo completo e 4 no modo reduzido.
- Texturas PBR: 256 × 256, repetíveis; anisotropia limitada a 16 no albedo e 8
  nos mapas de dados.
- Estacionamentos `EST-EXP-VIS` e `EST-VIS` mantêm a cota oficial `0.06`, de
  modo que troncos, vagas e superfície continuam fisicamente coerentes.

## Limites documentais

As áreas ambíguas não receberam nova edificação, acesso direcional ou árvore.
`B11` e `B12` já possuem implantação arquitetônica própria e recebem apenas
contato externo recortado. O apron do `PAVILHAO-09` é reutilizado como máscara;
não é duplicado. A revisão visual em dispositivo móvel é emulada e não substitui
ensaio em aparelho físico ou levantamento planialtimétrico de campo.
