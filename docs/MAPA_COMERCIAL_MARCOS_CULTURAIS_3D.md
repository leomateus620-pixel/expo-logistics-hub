# Marcos culturais 3D — referências, diagnóstico e implementação

## Escopo e contratos preservados

Esta revisão atua exclusivamente na apresentação 3D de quatro entidades da
referência oficial 2026:

| Estrutura | `publicIdentifier` | Fonte visual principal |
| --- | --- | --- |
| Sede Fenasoja / Comissão Central e monumento da soja | `B12` | Foto fornecida da fachada e da escultura |
| Casa da Etnia Polonesa | `C5` | Referências museológicas e turísticas polonesas |
| Casa da Etnia Italiana | `C6` | Foto arquitetônica fornecida |
| Pórtico das Nações | `PORTICO-NACOES` | Planta oficial 2026 e contexto da Praça das Nações |

Os IDs persistidos, identificadores públicos, nomes oficiais, coordenadas,
footprints GeoJSON, elevação, relações hierárquicas, aliases existentes,
permissões, dados comerciais, serviços Supabase, rotas, busca, filtros,
seleção, painel lateral, raycast e editor geométrico não foram alterados.

## Diagnóstico anterior

- `B12` já possuía uma sede arquitetônica própria, porém o ponto frontal da
  escultura era ocupado por um cilindro de paisagismo e arbustos. Não havia mão,
  vagem, grãos ou leitura de monumento institucional.
- `C5` era uma extrusão retangular bege com altura fixa. Não tinha construção
  em madeira, telhado íngreme, frontão, alpendre, ornamentação ou identidade
  polonesa.
- `C6` era uma extrusão retangular bege. A base pétrea, a estrutura elevada em
  dois níveis, a varanda, a escada externa, a modulação da fachada, os mastros e
  a cobertura cerâmica da referência não apareciam.
- `PORTICO-NACOES` era um prisma roxo sem vão, apoios, coroamento ou símbolos.
  A peça não funcionava visualmente como entrada cultural.
- Em visão geral e média distância, `C5`, `C6` e `PORTICO-NACOES` se confundiam
  com blocos operacionais. Em foco, a câmera, o rótulo e a redução de competição
  já funcionavam, mas apenas ampliavam os mesmos placeholders.

## Referências para a Casa Polonesa

A casa não foi tratada como uma forma europeia genérica. As decisões combinam
características recorrentes documentadas por fontes polonesas:

- o material oficial de cultura da [Polish Tourism Organisation](https://www.poland.travel/attachments/article/6505/KULTURA_EN.pdf)
  registra a madeira como material dominante da paisagem rural tradicional e
  destaca diferenças regionais na forma e na ornamentação;
- a casa Gąsienica-Sobczak, documentada pelo portal oficial
  [Visit Małopolska](https://visitmalopolska.pl/en/obiekt/-/poi/zabytkowa-chalupa-zakopianska),
  fornece o plano retangular, a cobertura alta em meia-empena com telhas de
  madeira, o alpendre de quatro colunas, o motivo solar `słonecko`, as diagonais
  `jodełki` e os remates de cumeeira `pazdury`;
- o [Muzeum Wsi Opolskiej](https://muzeumwsiopolskiej.pl/informacja-o-ekspozycji/)
  documenta paredes de toras de pinho, encaixes tradicionais, telhado de duas
  águas com cobertura de madeira e varanda sombreando o acesso principal.

A adaptação procedural usa, portanto, corpo de madeira com cursos horizontais,
embasamento mineral, telhado de forte inclinação, alpendre central, frontão com
raios claros, diagonais decorativas, remates de cumeeira, venezianas vermelhas,
placa própria e bandeira branca/vermelha. A solução permanece compatível com a
escala estilizada do parque e visualmente distinta da casa alemã enxaimel.

## Implementação por marco

### Monumento da soja — `B12`

- canteiro circular em níveis, aro mineral, solo e flores amarelas/brancas;
- antebraço, palma, quatro dedos e polegar em bronze estilizado;
- vagem curva e aberta, lábio destacado e três grãos volumétricos;
- implantação no passeio frontal direito, integrada ao acesso e ao painel de
  identidade da sede;
- detalhes dos grãos e paisagismo entram por proximidade/foco, mantendo a
  silhueta essencial no overview.

### Casa da Etnia Italiana — `C6`

- embasamento pétreo com vãos inferiores e detalhe de juntas no foco;
- pavimento superior claro e composição assimétrica baseada na foto;
- varanda estrutural, pilares, guarda-corpo, acesso e escada externa;
- cobertura cerâmica principal de quatro águas e volume superior secundário;
- mastros, bandeira italiana e placa institucional frontal.

### Pórtico das Nações — `PORTICO-NACOES`

- dois pilares com bases e capitéis, vão efetivamente aberto e arco extrudado;
- coroamento central, remate vertical e placa de leitura frontal;
- quatro escudos discretos para as casas Polonesa, Italiana, Alemã e Afro,
  usando as respectivas cores de identidade;
- hierarquia clara de base, apoio, arco, símbolo e coroamento, sem textura
  aplicada sobre um bloco fechado.

### Casa da Etnia Polonesa — `C5`

- embasamento mineral, paredes em madeira e cursos horizontais aparentes;
- telhado íngreme de duas águas, beirais profundos e remates de cumeeira;
- alpendre de quatro pilares com frontão próprio;
- motivo solar, diagonais de empena, venezianas, guarda-corpo, placa e bandeira;
- paleta de madeira quente, cobertura escura, acabamento claro e vermelho
  polonês, sem repetir a linguagem enxaimel da casa alemã.

## Foco, geometria e desempenho

- Os quatro assets são resolvidos pelo `publicIdentifier`; o `entity.id`
  persistido continua sendo o alvo de seleção, edição e painel.
- Cada asset recebe orientação e direção de foco próprias. O enquadramento usa a
  altura visual real, respeita o painel lateral e preserva contexto sem zoom
  excessivo.
- O modo de foco existente continua montando somente o rótulo selecionado e
  habilita detalhes finos específicos do marco.
- Uma única extrusão invisível do footprint oficial continua responsável pelo
  raycast; toda geometria decorativa usa `NO_RAYCAST`.
- Volumes repetidos usam `InstancedMesh`; caixas, cilindros, esferas, cones,
  planos e toro são compartilhados. Geometrias procedurais são memoizadas e
  descartadas no unmount.
- Materiais são opacos e separados por função, com baixo `metalness`; somente o
  vidro controlado da sede usa transparência. Não foram adicionadas imagens ou
  texturas externas.
- Detalhes de fachada, símbolos, flores e juntas respeitam o LOD por proximidade
  e o modo gráfico reduzido. A cena permanece em `frameloop="demand"`, com
  sombras estáticas invalidadas apenas nas mudanças relevantes.

## Validação executada

- build de produção Vite;
- lint focado dos componentes, utilitários e testes alterados;
- testes de resolução de assets, aliases, orientação, foco, footprints,
  seleção e apresentação;
- revisão autenticada no Chrome em visão geral e foco de `B12`, `C5`, `C6` e
  `PORTICO-NACOES`;
- busca por nome/alias, seleção pela lista, seleção direta pelo canvas, abertura
  e cancelamento do editor sem persistir alterações;
- inspeção visual de sombras, interseções, clipping, partes flutuantes,
  materialidade, rótulos e contexto;
- console sem erros de runtime ou WebGL durante os cenários acima.
