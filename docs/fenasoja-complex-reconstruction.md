# Sede Fenasoja e Palco Cultural Lactalis — reconstrução por referências

## Diagnóstico registrado antes da substituição

Baseline: `6e28ef03`, origin/main em 10/09/2026. Os 23 testes específicos anteriores passam, mas validam contratos geométricos que este pedido substitui. O checkout original e suas alterações locais foram preservados; implementação em `codex/fenasoja-complex-reconstruction`.

| Evidência | Discrepância confirmada no código | Correção |
| --- | --- | --- |
| Anexos 1/2 | B13 herdava 135×104 pontos da Sede e sofria outra redução para caber no placeholder | Projetar a cobertura vermelha independentemente; nenhuma deformação para caber no retângulo anterior |
| Anexos 1/2/4/5 | B12 -10°; B13 com yaw variável para o centro dos lotes 11/12 | Eixos ortogonais à Rua Brasília; lotes determinam o lado do público, não obrigam a cumeeira a apontar para seu centro |
| Anexos 1/2/3/6 | Sede alta e profunda demais, frente voltada à Argentina | Reconstruir proporções, empenas, volumes conectados e recuo para Brasília |
| Anexo 3/6 | Placa escura, moldura laranja e montantes de vidro sem proporção fotográfica | Placa branca curva projetada, marca oficial e caixilharia separada por pavimento |
| Anexos 1/3 | Monumento mecânico e exagerado; passeio reduzido a uma faixa | Vagem esculpida, haste curva, pedestal, canteiro e passagem livre |
| Anexos 1/2/3 | Anexo direito genérico | Sala dos Voluntários conectada à lateral direita, recuada, com cobertura própria ligada ao conjunto |

## Registro espacial e limites

Anexo 1: barra de 10 m entre aproximadamente x=736 e x=938 (202 px). Coordenadas de imagem são evidência estimada, não levantamento cadastral. Anexo 2 confirma a rotação do mesmo lugar: Rua Brasília à esquerda, Uruguai acima e Argentina abaixo; no Anexo 1 Brasília fica embaixo, Uruguai à esquerda e Argentina à direita. As cores são usadas apenas como indicações de telhado, conjunto ou pavimentação.

Pontos de controle: bordo norte do passeio de Brasília (y≈790 no Anexo 1); encontro Uruguai/Brasília (x≈170); encontro Argentina/Brasília (x≈828); os quatro cantos da cobertura do palco; recortes do conjunto da Sede. O intervalo 658 px entre os encontros é registrado no intervalo oficial y=3494..3716 do mapa. Escala uniforme de 222/658 pontos cartográficos por pixel, sem cisalhamento e sem escala herdada não uniforme. A escala em metros é local a este conjunto; não recalibra o parque inteiro.

O telhado não pode ser usado como levantamento da parede: fachadas recebem recuo de 0,25–0,45 m em relação aos beirais. Na foto, perspectiva e elevação deslocam cumeeiras e monumento; tolerância de interpretação planimétrica aproximadamente ±0,5–1,0 m, altura ±0,7 m. Fundação, cotas, estrutura oculta, traseira e aberturas não visíveis permanecem conservadoras. Não há certificação topográfica.

Fachadas de ambos os edifícios: direção -X do mapa (Rua Brasília), yaw -π/2 a partir de +Z local. O lado direito da fachada é +Z de mundo (Argentina). Esses eixos não são coordenadas geográficas: pelo indicador N do Anexo 1, +X corresponde aproximadamente ao norte daquela imagem e a frente aponta aproximadamente ao sul. As entidades exatas `Q-D-11` e `Q-D-12`, com centros registrados no inventário, ficam do outro lado de Brasília. O eixo frontal cruza o intervalo longitudinal desses lotes; não se impõe a rotação diagonal do antigo alvo pontual.

Referência frontal adicional do palco localizada em Downloads: `4618B88E-96C4-4F78-98A2-6E21E6C254F2.jpeg`. Confirma empena rasa de chapa cinza, apoios verticais pretos, frente aberta, plataforma ao fundo, treliças e placa azul compacta. Os anexos de entrada são referências de trabalho; a fachada não usa fotografia integral nem sombras fotografadas.

## Especificação, implementação e validação

Os polígonos de paredes, projeções de telhado, passeio e canteiros, dimensões em metros estimados, transformação ao mundo e entradas ficam centralizados em `src/features/commercial-map/data/fenasojaComplexReconstruction.ts`; as câmeras de validação ficam em `scripts/fenasoja-complex/capture.cjs`.

| Elemento | Dimensões estimadas |
| --- | --- |
| Sede, corpo principal | 6,50 × 6,90 m; beiral 4,60 m; cumeeira 8,20 m; inclinação ~44,9° |
| Beiral principal | 0,36 m; cobertura com espessura nominal 0,10 m mais arremates |
| Volume posterior esquerdo | 5,20 × 3,30 m; cumeeira 4,05 m |
| Volume posterior direito | 3,45 × 4,65 m; cumeeira 4,40 m |
| Sala dos Voluntários | 3,05 × 2,90 m; parede 2,70 m; cumeeira 3,30 m; conexão de 0,025 m com a casca |
| Cobertura baixa frontal esquerda | 2,04 × 3,25 m; beiral 2,50 m |
| Passeio principal | Aproximadamente 11,25 × 4,35 m, com recorte e extensão esquerda; não é uma parede |
| Placa final refinada | 5,95 × 1,50 m; espessura 0,28 m e perfil curvo |
| Monumento final | Altura total aproximada 2,86 m; base circular ~2,40 m de diâmetro; à direita da passagem |
| Palco, projeção da cobertura | 17,82 × 19,11 m; beiral 4,80 m; cumeeira 6,65 m; inclinação ~11,7° |

Uma unidade local de metro estimado equivale a `0.1486952197` unidades do mapa. Origem arquitetônica de B12: `[15.2965349544, 15.1072672767]` no plano XZ; ambas as rotações são exclusivamente em Y, sem pitch/roll herdado. O contorno vermelho e o contorno azul indicam telhados separados por ~0,25 m na interpretação do traço. As malhas finais chegam mais perto (~0,074 m), dentro da incerteza da imagem; não é uma distância de obra verificada. Os testes verificam ausência de sobreposição de interiores dos polígonos e os relatórios registram os limites das malhas.

O enquadramento de B12 foi ajustado à frente em Brasília; limites de seleção e âncora da etiqueta seguem o envelope corrigido. UUID, identificador público, metadados, parent, permissões e vínculo de interior são carregados pela projeção versionada. Não há nova entidade duplicada ou malha antiga escondida.

## Evidência e segunda etapa

As imagens `screenshots/fenasoja-complex/before-*` registram a base `6e28ef03`. As imagens `after-*` dessa pasta registram a primeira reconstrução `0a2c6a78`; as vistas `neutral-*` registram a inspeção com materiais neutros e contornos separados. A etapa posterior de refinamento da Sede, suas comparações, desempenho, resultados de testes e limitações estão no [relatório do ativo arquitetônico](fenasoja-headquarters-hero.md).

O palco reconstruído na primeira etapa foi preservado durante o refinamento da Sede. A correção posterior de infraestrutura é exclusivamente o poste 337 que cruzava sua nova cobertura. A topologia viária e os edifícios vizinhos não foram redesenhados.
