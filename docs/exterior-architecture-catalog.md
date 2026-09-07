# Catálogo arquitetônico do entorno

Os 50 modelos são receitas geométricas reutilizáveis em `data/exteriorArchitecture.ts`. Cada receita controla planta, proporções dos volumes, cobertura, altura de cumeeira, pavimentos, vãos e anexos. Cores não entram na verificação de unicidade. Os IDs permanecem estáveis; a elegibilidade por uso e dimensão é avaliada antes do hash do identificador da implantação.

H = casas; R = rurais; G = galpões; B = prédios; C = complementares. A coluna de usos descreve a base `ca16aa57`, sem ocupação adicionada para preencher o catálogo. R07–R08 são anexos e não substituem casas rurais. Prédios e complementares ficam disponíveis para futuras implantações expressamente aprovadas.

| ID | Arquitetura | Planta | Cobertura | Pavimentos | Varanda / garagem / sacada | Usos |
|---|---|---|---|---:|---|---:|
| H01 | TÃ©rrea colonial com varanda frontal | rectangle | gable | 1 | front | 46 |
| H02 | ChalÃ© compacto de empena alta | rectangle | gable | 1 | none | 40 |
| H03 | Casa de esquina em L | L | hip | 1 | side | 54 |
| H04 | TÃ©rrea de quatro Ã¡guas e alpendre | rectangle | hip | 1 | front | 42 |
| H05 | Casa em T com ala posterior | T | gable | 1 | none | 39 |
| H06 | Casa com garagem lateral baixa | stepped | gable | 1 | none / garagem | 56 |
| H07 | PÃ¡tio central aberto em U | U | hip | 1 | side | 48 |
| H08 | TÃ©rrea de duas Ã¡guas deslocadas | twin | mono | 1 | none | 38 |
| H09 | Casa de platibanda e entrada recuada | stepped | flat | 1 | front / garagem | 50 |
| H10 | TÃ©rrea longa com varanda lateral | rectangle | gable | 1 | side | 37 |
| H11 | Casa em L de tijolo aparente | L | gable | 1 | front | 35 |
| H12 | Casa de duas alas e galeria | twin | hip | 1 | wrap | 39 |
| H13 | Sobrado com sacada frontal | rectangle | gable | 2 | front / sacada | 6 |
| H14 | Sobrado em L com garagem | L | hip | 2 | side / garagem / sacada | 11 |
| H15 | Sobrado de volumes escalonados | stepped | flat | 2 | none / garagem / sacada | 6 |
| H16 | Sobrado colonial de varanda contÃ­nua | rectangle | hip | 2 | wrap / sacada | 6 |
| H17 | Sobrado de empenas paralelas | twin | gable | 2 | none / sacada | 10 |
| H18 | Sobrado em T com marquise | T | flat | 2 | front / sacada | 12 |
| H19 | Sobrado estreito com abrigo lateral | rectangle | mono | 2 | side / garagem | 8 |
| H20 | Sobrado de pÃ¡tio e terraÃ§o | U | gable | 2 | none / sacada | 7 |
| R01 | Casa de sÃ­tio com varanda em trÃªs lados | rectangle | hip | 1 | wrap | 4 |
| R02 | Casa rural comprida de madeira | rectangle | gable | 1 | side | 3 |
| R03 | Casa de sÃ­tio em L e cozinha baixa | L | gable | 1 | front | 4 |
| R04 | Casa rural em T de alvenaria | T | hip | 1 | side | 3 |
| R05 | Casa de sÃ­tio de duas alas | twin | gable | 1 | front | 3 |
| R06 | Casa rural com abrigo de ferramentas | stepped | mono | 1 | wrap / garagem | 4 |
| R07 | DepÃ³sito rural com cobertura lateral | stepped | gable | 1 | side / garagem | 0 |
| R08 | Anexo rural com ventilaÃ§Ã£o alta | rectangle | mono | 1 | none | 0 |
| G01 | GalpÃ£o metÃ¡lico de duas Ã¡guas | rectangle | gable | 1 | none / garagem | 0 |
| G02 | GalpÃ£o de sheds com trÃªs dentes | rectangle | saw | 1 | none / garagem | 0 |
| G03 | ArmazÃ©m de cobertura curva | rectangle | barrel | 1 | none / garagem | 0 |
| G04 | GalpÃ£o com escritÃ³rio lateral baixo | stepped | gable | 1 | front / garagem | 1 |
| G05 | GalpÃ£o em L de fibrocimento | L | gable | 1 | none / garagem | 0 |
| G06 | GalpÃ£o de naves geminadas | twin | gable | 1 | none / garagem | 0 |
| G07 | DepÃ³sito com marquise de carga | rectangle | mono | 1 | front / garagem | 2 |
| G08 | Oficina industrial em T | T | saw | 1 | side / garagem | 0 |
| B01 | Residencial de trÃªs pavimentos e sacadas | rectangle | hip | 3 | front / sacada | 0 |
| B02 | EdifÃ­cio misto com loja recuada | stepped | flat | 3 | front / sacada | 0 |
| B03 | Residencial em L de quatro pavimentos | L | flat | 4 | none / sacada | 0 |
| B04 | Bloco de duas alas e circulaÃ§Ã£o central | twin | gable | 3 | none / sacada | 0 |
| B05 | EdifÃ­cio compacto com terraÃ§os | T | flat | 4 | side / sacada | 0 |
| B06 | Residencial de pÃ¡tio aberto | U | hip | 3 | wrap / sacada | 0 |
| C01 | Mercado de bairro com marquise | rectangle | flat | 1 | front | 0 |
| C02 | Oficina de duas baias | twin | gable | 1 | none / garagem | 0 |
| C03 | Venda rural e depÃ³sito em L | L | hip | 1 | front | 0 |
| C04 | PavilhÃ£o de apoio com galeria | rectangle | gable | 1 | wrap | 0 |
| C05 | ServiÃ§os com recepÃ§Ã£o baixa | stepped | mono | 1 | side / garagem | 0 |
| C06 | ComÃ©rcio com pÃ¡tio de atendimento | U | flat | 1 | none | 0 |
| C07 | PavilhÃ£o comunitÃ¡rio em T | T | hip | 1 | front | 0 |
| C08 | Oficina com iluminaÃ§Ã£o em shed | rectangle | saw | 1 | side / garagem | 0 |

Visualização dos 50 modelos: rota de desenvolvimento `/__dev/exterior-catalog`. Ela não está no bundle de produção. A cena comercial cria recursos apenas para os modelos efetivamente usados.

## Reutilização

Use `architectureForBuilding(building)` para manter elegibilidade e distribuição determinística. Use `createArchitectureGeometry(model, detail)` com `false` (mapa), `true` (aproximação) ou `far` (silhueta distante). As coordenadas normalizadas ficam dentro de x/z ±0,5 e y 0–1. A instância aplica centro, orientação e dimensões da implantação. A geometria e o material pertencem ao construtor da cena e são descartados uma vez no desmontar.

O material PBR é compartilhado, com atributos de vértice para cor, rugosidade e metalicidade. As superfícies de metal, cerâmica, fibrocimento, madeira, reboco, concreto, tijolo e vidro respondem diferentemente à iluminação. Detalhe procedural é filtrado por derivadas na tela e não carrega mapas exclusivos por construção.
