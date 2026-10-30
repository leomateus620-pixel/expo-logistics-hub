# Verificação do código

Base: `eb85dedbafbc76b1beeb617e40487c63896c05e2`, obtida por `git fetch origin` em 30/10/2026. A branch de trabalho anterior estava limpa e foi preservada; a reconstrução começou em `codex/pavilion-architecture-2026`, criada da `origin/main`.

## Comandos executados

- `npm install --ignore-scripts`: concluído. O shell não tinha `npm` no PATH; os scripts foram executados com o Node bundled e o CLI npm 10.9.2 em `/tmp`. A normalização incidental do lockfile foi descartada; nenhuma dependência mudou.
- `npm run typecheck`: passou.
- `npm run build`: passou. Mantém os avisos preexistentes de Browserslist desatualizado e chunks grandes.
- `npm test`: executado na cópia imutável da base e no candidato. A rodada final do candidato usa `--maxWorkers=4` para evitar contenção com o navegador; as asserções e os timeouts não foram alterados. A comparação completa está em [test-summary.json](test-summary.json).

| Resultado | Base imutável | Candidato |
|---|---:|---:|
| Arquivos de teste | 485 | 494 |
| Testes totais | 4.150 | 4.231 |
| Testes aprovados | 4.060 | 4.141 |
| Testes falhos | 90 | 90 |
| Arquivos com falhas | 51 | 51 |
| Falhas novas | — | **0** |

Os mesmos 90 nomes de teste falham na base e no candidato. A suíte completa **não está verde**. As falhas anteriores incluem expectativas textuais de atlas numérico, apresentação de plantas e contratos de migração, além de testes fora do Mapa Comercial. Elas não foram relaxadas para aprovar a reconstrução.

Os 81 testes adicionados passaram: 37 de geometria/perfis/placas, 8 de materiais e recursos, 7 de união/solo/visita, 5 de continuidade entre troncos e copas diante de P12, 10 da ala B19 e sua conexão e 14 da entrada B11, suas interfaces de solo e ciclo de vida da vegetação. Execuções focais adicionais verificaram preparação de materiais, warmup do interior e as árvores existentes (27 testes na última rodada de árvores).

## Preservação comercial e limites

A consulta de leitura do banco existente confirmou os cinco footprints atuais. [persisted-footprints.json](persisted-footprints.json) registra apenas geometria, cotas e contagem de entidades internas, sem compradores, contratos, preços ou tokens. [persisted-fixture-comparison.json](persisted-fixture-comparison.json) documenta a correspondência com a fixture usada nas capturas.

As definições comerciais, projeções, áreas, numeração, preços, pedidos, contratos, flags de acesso e tabelas não foram alterados. O Pavilhão 13 conserva B5 e suas 104 entidades internas. A camada de união recebe somente entidades já autorizadas e, em links públicos, exige os dois proprietários dentro do escopo ativo. Ela não consulta nem carrega dados dos vizinhos.

Os pedidos seguintes do usuário acrescentaram dois pontos ao escopo: a ala existente da Brigada Militar B19 e o acesso do Centro Administrativo B11. Os snapshots de leitura [B19/B6](persisted-brigada-footprints.json) e [B11](persisted-administrative-footprint.json) preservam as respectivas identidades SECURITY/ADMINISTRATION. O cubo anterior B19 cede lugar à ala conectada ao P3, com picking próprio B19; não se funde à planta comercial. A entrada B11 parte da extremidade +X local e alcança a calçada da Argentina após o giro π/2. Seu mural existente foi reposicionado nessa face; ele continua uma representação gráfica simplificada da arte.

As novas alturas são estimativas proporcionais às fachadas fotografadas. O datum do piso interno permanece o mesmo; cobertura, fachada, placa, volume de seleção e colisão usam a altura de apresentação. A revisão não apresenta essas razões como medidas oficiais. As marquises de 8, 13 e 3 têm projeção limitada pela circulação existente, sem deslocar a Rua Argentina. A rampa do 3 é uma interpretação no recuo disponível, com plano de apoio numérico correspondente, sem pretensão de levantamento dimensional de acessibilidade.

A revisão visual corrigiu ainda as placas que ficavam atrás de pilares/testeiras, a aparência excessivamente clara das subdivisões dos portões e o concreto diante de toda a frente de P1. As placas físicas mantêm número completo e texto curto nos níveis de detalhe, com suportes ligados à arquitetura. Nas três árvores `tree-i-13/14/15`, os troncos e galhos agora penetram as copas existentes; posições, folhagem, apoio de concreto e quantidade de instâncias permanecem iguais. A altura do collider simplificado acompanha o tronco apresentado.

O acesso B11 combina cobertura metálica clara, treliças, seis pilares, letreiro, caminho de concreto, soleira, sebes e a árvore fotografada, posicionada de forma estimada em uma faixa verificada livre. A árvore é apresentação do acesso, sem alteração do inventário canônico de 275 árvores. O gramado tem uma malha própria graduada para o terreno −0,08 e recortada ao redor do concreto; o plano numérico da visita usa a mesma função. As bases dos novos acessos alcançam o terreno, preservando as cotas superiores. A árvore e as plantas não ficam apoiadas em uma placa suspensa.

A revisão final dos estados preserva as uniões e a ala B19 também no modo Vendas. A árvore B11 obedece ao controle de árvores e à política pública de vegetação; alternar o controle não remonta atlas ou geometrias. Essas correções de visibilidade não alteram o cenário padrão em que as três rodadas de desempenho foram medidas.

## Estado de entrega

Não houve migração, escrita no banco, modificação de cadastros ou publicação em produção. A PR entrega código e evidências locais para revisão. Resultados visuais, interações reais e desempenho estão no [relatório principal](README.md) e nos JSON de cada execução.
