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
- Foco: direção `[0.36, 0.44, 0.9]`, com compensação para painel lateral ou sheet
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
- Interior: estrutura metálica exposta, laterais ventiladas, piso
  terroso/avermelhado, contenções azul-acinzentadas, baias repetidas e circulação
  longitudinal
- Limite de inferência: não foram adicionados anexos, portas, numeração por
  trecho ou equipamentos sem apoio visual ou cartográfico

## Reconstrução paramétrica

- Três trechos espaciais com duas juntas de cobertura
- Seis planos inclinados de telhado, cumeeiras, espessura e calhas
- Plataforma, corredor longitudinal e pisos de baias
- Paredes baixas, trilhos, pilares, tirantes e tesouras repetidas
- Placa única com a identificação oficial combinada
- Corte interno pela remoção apenas da água de cobertura próxima à câmera
- Gado low-poly instanciado, com variação determinística de pelagem, escala e
  orientação, sempre dentro das baias

## Orçamento de renderização

- Visão geral: 9 batches arquitetônicos instanciados; nenhum animal
- Distância média: 9 animais, 21 draw calls do modelo
- Selecionado: 15 animais, 22 draw calls do modelo e menos de 8 mil triângulos
- Interior: 18 animais (9 em gráficos reduzidos), cerca de 20 draw calls e menos
  de 8 mil triângulos
- Textura de placa: `512 × 128`, criada somente quando o detalhe está ativo
- Materiais compartilhados; nenhuma biblioteca, modelo externo ou textura
  fotográfica adicionada
- Sombras: cobertura, paredes e elementos estruturais principais; animais
  somente em foco ou interior; divisórias pequenas não projetam sombra
- LOD: detalhe externo ativado por distância; costuras de cobertura, rebanho
  completo e sombras dos animais somente no foco selecionado
- Animação: apenas durante transições de câmera e interação com controles
