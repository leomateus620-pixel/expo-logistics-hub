# Marcos arquitetônicos 3D — diagnóstico e referências

## Escopo preservado

O upgrade visual atua somente na apresentação 3D das entidades com
`publicIdentifier` **C8**, **C2** e **F**. IDs persistidos, `projectId`, camadas,
geometrias GeoJSON, coordenadas, dimensões cartográficas, metadados comerciais,
permissões, busca, seleção, edição e integrações com o Supabase continuam sendo
a fonte de verdade. O identificador público é usado apenas para escolher o
asset arquitetônico; o `entity.id` recebido do banco permanece responsável por
raycast, seleção, edição e painéis.

| Estrutura | Identificador | Representação de referência | Centro local aproximado | Footprint local aproximado |
| --- | --- | --- | --- | --- |
| Casa da Etnia Alemã | C8 | `reference:2026:c8` | `28.52, 38.90` | `2.57 × 2.53` |
| Restaurante Central / Restaurante Fenasoja | C2 | `reference:2026:c2` | `-18.33, 6.22` | `3.93 × 3.27` |
| Arena Sicredi - Icatu | F | `reference:2026:f` | `39.11, -1.42` | `10.58 × 9.60` |

Os footprints acima são derivados da planta oficial 2026 e não são medidas
prediais de engenharia. Eles permanecem inalterados e delimitam a escala dos
modelos procedurais.

## Referências arquitetônicas fornecidas

### Casa da Etnia Alemã

- volume frontal simétrico, com empena central alta e telhado cerâmico de duas
  águas;
- paredes claras contrastadas por montantes e diagonais em madeira escura;
- varanda contínua com pilares, guarda-corpo e cobertura mais baixa;
- acesso elevado, escada/rampa lateral, bandeiras do Brasil e da Alemanha;
- letreiro frontal baixo e forte leitura de casa cultural germânica.

### Restaurante Fenasoja

- pavilhão largo, de presença horizontal dominante;
- cobertura escura profunda e segmentada, com volumes de telhado sobrepostos e
  lanternim central;
- entrada central marcada por pequeno frontão e assinatura Fenasoja;
- fachada clara, modular, com sequência de vãos escuros e estrutura vertical;
- frente de permanência com floreiras, bancos e guarda-sóis verdes.

### Arena Sicredi - Icatu

- concha de palco semicircular como assinatura principal;
- aro frontal verde espesso, cobertura branca curva e boca de cena escura;
- palco profundo, apoios laterais, torres/trusses e caixas técnicas;
- assinatura Sicredi / Icatu na parte alta da abertura;
- plataforma e praça frontal livres para leitura do espaço de apresentação.

## Diagnóstico da implementação anterior

As três entidades eram processadas pelo mesmo `EntityMesh`. A geometria era uma
`ExtrudeGeometry` direta do polígono cartográfico, com altura fixa, bevel
genérico, cor da classificação e contorno. O modelo não distinguia estrutura,
fachada ou cobertura.

- **C8:** bloco bege de `0.62` unidade, sem empena, telhas, varanda, esquadrias,
  madeira aparente, acesso, bandeiras ou sinalização arquitetônica.
- **C2:** bloco laranja de `1.05` unidade, sem a grande cobertura escalonada,
  entrada central, modulação de fachada ou área de permanência.
- **F:** prisma laranja de `1.35` unidade ocupando todo o footprint, sem arco,
  concha, boca de cena, palco, identidade verde/branca ou praça frontal.

Em foco, a apresentação anterior apenas elevava o mesmo bloco, aplicava
emissivo e exibia um rótulo HTML. A câmera já calculava distância pelo footprint
e evitava competição entre rótulos; esses comportamentos são mantidos, mas a
altura visual passa a considerar a silhueta arquitetônica real.

## Lacunas e critérios técnicos

- **Silhueta:** nenhum dos três volumes era reconhecível em vista geral ou
  média distância.
- **Hierarquia:** cobertura, corpo, entrada, plataforma e estrutura secundária
  estavam fundidos em um único prisma.
- **Materialidade:** uma cor por classificação produzia leitura genérica e
  excessivamente uniforme.
- **Interação:** o raycast funcionava, mas estava acoplado à mesma malha visual;
  detalhes futuros aumentariam o risco de alvos fragmentados.
- **LOD:** não existia nível de detalhe arquitetônico por distância ou seleção.
- **Performance:** a cena já usa `frameloop="demand"`, lotes em
  `THREE.BatchedMesh`, sombras estáticas e limitação semântica de rótulos. Os
  novos assets devem manter esse contrato, compartilhar geometrias/materiais e
  montar detalhes secundários apenas perto da câmera ou durante o foco.

## Direção da reconstrução

Cada marco recebe uma silhueta procedural própria, dimensionada dentro do
footprint existente. Uma única superfície invisível, derivada do polígono
oficial, continua sendo o alvo de hover, clique e duplo clique. Todas as peças
decorativas ficam fora do raycast. Materiais permanecem opacos, foscos e com
baixo `metalness`; sinalização usa textura de canvas pequena somente nos níveis
próximo/foco. Não há animação contínua.

## Implementação entregue

- **C8 — Etnia Alemã:** empena alta, telhado principal e cobertura de varanda
  em duas águas, estrutura enxaimel, vãos, pilares, guarda-corpo, plataforma,
  acesso lateral, bandeiras e monumento de identificação frontal.
- **C2 — Restaurante Fenasoja:** cobertura profunda em níveis, lanternim,
  frontão de entrada, fachada modular, sequência de vãos, floreiras, bancos e
  guarda-sóis. A fachada recebeu orientação própria para respeitar a frente do
  pavilhão dentro da implantação oficial.
- **F — Arena Sicredi Icatu:** concha branca segmentada, arco frontal verde,
  boca de cena escura, plataforma, apoios, trusses, caixas técnicas, assinatura
  superior e praça frontal.

A orientação visual e o enquadramento de foco são configurados por marco, sem
alterar a geometria persistida. O foco usa uma vista frontal em três quartos,
com distância limitada pela escala do footprint; ao fechar a seleção, a câmera
retorna ao preset geral mesmo quando ele já era o preset ativo.

## LOD, interação e desempenho

O nível básico conserva apenas a hierarquia de volumes necessária para leitura
em visão geral. Elementos de fachada e repetição aparecem por proximidade, e
detalhes finos e placas entram no foco. Peças repetidas usam instanciamento;
geometrias e materiais foscos são compartilhados; texturas de canvas são
pequenas e só existem no nível próximo/foco.

O mapa continua com `frameloop="demand"`. Não foi introduzida animação contínua.
Cada asset mantém um único volume invisível de interação, calculado a partir do
footprint oficial e associado ao `entity.id` persistido. Assim, telhados,
fachadas e detalhes não fragmentam hover, clique, duplo clique ou edição. As
sombras estáticas são invalidadas somente quando seleção ou LOD muda.

## Matriz de validação

- visão geral, distância média e foco dos três marcos;
- seleção pelo explorador, busca por nome/alias, troca rápida e desseleção;
- clique direto/raycast, destaque, rótulo contextual e enquadramento;
- disponibilidade do fluxo de edição sem persistir mudanças de teste;
- retorno ao preset geral e ausência de competição de rótulos após o foco;
- verificação de TypeScript, ESLint focado, testes automatizados, build de
  produção e console do navegador autenticado.
