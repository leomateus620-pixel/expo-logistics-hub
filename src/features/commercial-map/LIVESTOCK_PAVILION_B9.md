# B9 — Pavilhões 6, 10 e 11 — Pecuária

Este documento é o mapa técnico do ativo arquitetônico de B9. A cartografia
oficial continua sendo a autoridade para identidade, footprint, metadados,
permissões e edição; `utils/livestockPavilion.ts` é a autoridade para a
reconstrução visual derivada desse footprint.

## Contrato oficial preservado

- Entidade: `reference:2026:b9`
- Identificador público: `B9`
- Nome: `Pavilhões 6, 10 e 11 — Pecuária`
- Classificação: `PAVILION`
- Camada: `reference:pavilions`
- Relação: uma entidade, um footprint contínuo e um único alvo de seleção
- Elevação: `0`
- Rotação: `0`
- Escala visual de origem: `1`
- Extrusão cartográfica original: `1.35`
- Altura arquitetônica derivada: `2.3794909210`
- Área cartográfica: `54.45 un²`
- Bounds:
  - X: `-22.4945454545` a `-3.7309090909`
  - Z: `-15.6872728060` a `-12.7854546096`
  - Largura: `18.7636363636`
  - Profundidade: `2.9018181964`
  - Centro: `[-13.1127272727, -14.2363637078]`
- Anel externo:
  - `[-22.4945454545, -15.6872728060]`
  - `[-3.7309090909, -15.6872728060]`
  - `[-3.7309090909, -12.7854546096]`
  - `[-22.4945454545, -12.7854546096]`
  - fechamento no primeiro ponto
- Fonte: referência oficial 2026.2, polígono PDF `[2319, 2256]–[3179, 2389]`
- Confiança: referência visual oficial; medidas oficiais ainda não validadas

Os números 6, 10 e 11 não possuem associação espacial oeste/centro/leste na
base. O modelo expressa três trechos de cobertura para tornar as divisões
legíveis, sem atribuir um número a qualquer trecho.

## Integrações preservadas

- Busca: nome oficial, `B9`, classificação e aliases arquitetônicos
- Seleção: um volume invisível derivado do footprint oficial
- Raycast: somente o volume pai recebe hover, clique e duplo clique
- Label: nome oficial ancorado no centroide e na altura visual derivada
- Foco: direção `[0.26, 0.31, 0.96]`, com enquadramento mais baixo da fachada e
  compensação para painel lateral ou sheet
- Painel: metadados normalizados e área cartográfica existentes
- Inspeção: ação explícita `Ver interior`, `Escape` e retorno pelo botão
- Retorno: posição e alvo da câmera externa são capturados antes da troca de cena
- Edição: o editor existente continua usando a geometria oficial; referências
  ainda não persistidas permanecem sem ação de salvar
- Permissões, verificação, filtros e status comercial: sem alteração

## Contexto espacial validado

- B10 a oeste
- E-26 e B8 a leste
- Alameda Mercosul e Rua Paraguai próximas
- Quadras Q e R ao sul/leste
- Pista Campeira / Quadra N ao norte do eixo visual
- D4 — Tenda Pecuária nas proximidades

Nenhum vizinho foi movido. Cobertura, base e hitbox permanecem contidos no
footprint oficial para não fechar os pequenos afastamentos cartográficos.

## Leitura das referências

- Exterior: conjunto baixo, muito longitudinal, cobertura metálica clara,
  continuidade horizontal, entorno verde e ligação direta com vias do parque
- Interior: estrutura metálica exposta, laterais ventiladas, piso de concreto e
  serragem, contenções azul-acinzentadas, baias repetidas e circulação longitudinal
- Limite de inferência: não foram adicionados anexos, portas, numeração por
  trecho ou equipamentos sem apoio visual ou cartográfico

## Reconstrução paramétrica

- Três trechos espaciais com duas juntas de cobertura
- Telhado metálico com painéis, costuras, terças, cumeeiras ventiladas,
  claraboias, calhas e condutores
- Tesouras completas, cordas, diagonais, tirantes laterais e pilares repetidos
- Plataforma, corredor central de concreto, juntas, drenagem e bordas de aisle
- Baias com cama de serragem, acúmulos irregulares, muretas, trilhos, portões,
  divisórias, cochos lineares e bebedouros
- Iluminação linear interna com preenchimento quente e frio
- Placa única com a identificação oficial combinada
- Corte interno pela remoção apenas da água de cobertura próxima à câmera
- Câmera interna responsiva para desktop, paisagem compacta e retrato, com
  órbita, zoom e pan limitados ao volume do pavilhão

## Rebanho paramétrico

- 18 animais no interior e 15 no exterior selecionado
- Perfis determinísticos brancos, pretos, marrons, vermelho-acastanhados,
  malhados e de face branca
- Construções pesada, padrão e compacta, incluindo um boi claro de grande porte
  com cupim e chifres
- Poses em pé, alimentando-se e deitadas, com variação de orientação e cabeça
- Respiração, cabeça e cauda animadas apenas em animais elegíveis
- Limite de quatro animais animados por cena, atualização a `14 fps` e respeito
  a `prefers-reduced-motion`
- Geometrias e materiais compartilhados; todas as partes do rebanho ignoram
  raycast

## Materiais e superfícies

- Concreto, serragem e telha usam texturas procedurais determinísticas de
  `256 × 256`, geradas localmente e repetidas conforme a superfície
- A placa usa canvas `512 × 128`, criado somente quando o detalhe está ativo
- Não há download de modelos, bibliotecas visuais ou texturas fotográficas
- Rugosidade, metalness, bump e preenchimento de luz foram calibrados para
  diferenciar aço, cobertura, concreto, serragem, água e animais sem brilho
  plástico

## Orçamento de renderização

- Visão geral: somente a arquitetura compatível com o LOD, sem rebanho
- Distância média: 9 animais e arquitetura simplificada
- Selecionado: 15 animais, superfícies e detalhes completos
- Interior: 18 animais; 9 em gráficos reduzidos
- Rebanho completo: 11 batches instanciados, incluindo sombra de contato
- Batches arquitetônicos consolidados por material para reduzir trocas de estado
- Sombras: cobertura, paredes e estrutura principal; animais apenas em foco ou
  interior; elementos pequenos não projetam sombra
- LOD: detalhes externos e rebanho crescem por distância; costuras, textura,
  gado completo e sombras ficam restritos ao foco
- Animação: invalidação sob demanda; fora das transições e dos quatro animais
  elegíveis, a cena permanece estática
