# Portão 9: reserva de acesso e rua dos lotes

O acesso largo do Portão 9 fica à esquerda da rua estreita junto ao lote S35. A
planta raster já registrada contém os dois espaços, mas a lista de vias da
revisão 2028 digitizou apenas a faixa direita como Rua Pastor Albert Lehenbauer.
O gramado visível no acesso esquerdo, portanto, corresponde a uma faixa que
ficou sem pavimento na apresentação. A rua direita vigente permanece intacta.

## Evidência local antes da mudança

- Fonte: `fontes/Fenasoja_Parque_Ajustes_300dpi.png`, dentro do pacote
  `docs/exporural/2028-revisao-2026-09-25`.
- Recorte de inspeção: `gate9-reference-crop.png`, extraído da fonte existente,
  grid x460–620/y285–720, sem alterar a referência.
- `scripts/exporural/build_revision.py` registra a rua estreita nos pontos de
  grid `(552,320)`, `(576,320)`, `(555,625)`, `(556,650)`, `(560,1102)`,
  `(525,1102)`, `(519,644)`, `(550,644)`. Não há um segundo input viário para o
  acesso largo do portão na lista da revisão.
- A faixa larga da planta ocupa aproximadamente x516–552 até a junção inferior
  em y644–650. A planta imprime 7,98 m no corredor e 4,12 m na faixa vizinha;
  essas cotas ajudam a distinguir os dois espaços, mas não constituem um novo
  levantamento da implantação.
- O baseline local 2028 mostra o asfalto existente da rua direita. Os testes de
  triângulos em pontos centrais dessa rua encontram seu tampo em Y=0,032 e o
  chão externo em Y=-0,08. Os hits brancos em Y=0,003 são superfícies invisíveis
  de seleção de quadras/Exporural. Não são uma textura de grama acima da rua.
- Nenhuma camada de `TerritorialEnvironment` intersecta o polígono Pastor
  vigente. As superfícies especiais de Exporural próximas ao P5 também ficam
  fora do trecho norte. Não se justifica elevar ruas ou recortar o chão regional
  inteiro para resolver este acesso.

## Limites e diferenças de geometria

O A9 histórico tem centro X=13,39636. Os intervalos abaixo usam a conversão
histórica para comparar as duas versões de Pastor; não são o novo acesso largo.

| Y da referência histórica | Pastor 2026: intervalo X | Pastor 2028: intervalo X |
| --- | --- | --- |
| 1300 | 13,48364–14,26909 | 13,79064–14,52673 |
| 1400 | 13,48364–14,26909 | 13,77661–14,37580 |
| 1600 | 13,37455–13,84594 | 13,74854–14,07392 |
| 1726 | 13,37455–13,83273 | 13,73085–13,89680 |

A diferença Pastor2026 menos Pastor2028 mede 3,721811 unidades². Restaurar essa
diferença por união das versões não representa corretamente as duas vias
separadas explicitadas pelo usuário. A apresentação usa a faixa larga
registrada da planta, com um owner próprio derivado do A9 existente.

## Apresentação implementada

- `buildGateNineAccessPresentation` deriva o acesso do grid
  `(516,320) → (552,320) → (555,625) → (556,650) → (519,644)` usando a matriz
  affine e o frame de `calibracao.json`, com a mesma precisão e arredondamento de
  nove casas da revisão existente.
- A apresentação termina na junção inferior com Johan/Pastor. Nenhum trecho
  depois desse limite recebe o novo pavimento.
- A geometria vigente de Pastor é subtraída da nova apresentação e permanece
  byte a byte igual. Um recuo mínimo de 0,075 unidade, aproximadamente 0,50 m na
  escala local, conserva a faixa verde no trecho paralelo. Esse recuo é uma
  interpretação visual conservadora; não é uma cota cadastral.
- A separação verde acaba na junção inferior, permitindo a continuidade física
  das vias. Não se cria uma ponte retangular por AABB entre A9 e Pastor, pois ela
  preencheria a faixa verde ao longo de todo o trecho paralelo.
- Lotes e edifícios ativos são subtraídos apenas do novo pavimento. Um minúsculo
  encontro do raster com Q-R-08 é recortado; nenhuma parcela é deslocada.
- O proxy mantém o ID e a identificação A9 existentes, usa a camada de vias e
  tem `presentationOnly=true`. É input de renderização e suporte do Visit Mode,
  sem inserção no cadastro, novos IDs comerciais, preços, vendas ou persistência.
- Dados 2026 que fragmentam esse acesso após os recortes protegidos retornam
  `null`; não se inventam trechos entre os fragmentos.

## Validação dirigida

Testes verificam as duas vias em Y=0,032, a ausência de asfalto/interseções/
meios-fios/sarjetas no meio da faixa verde em qualidade normal e reduzida,
conexão geométrica na extremidade inferior, não interseção com lotes e edifícios,
suporte físico no acesso e igualdade integral dos dados de entrada. Imagens e
medidas locais depois da mudança ficam no relatório principal de validação.

Esta evidência corresponde à referência local 2028 existente. Não comprova
alteração de banco, publicação em produção ou validação em dispositivo físico.
