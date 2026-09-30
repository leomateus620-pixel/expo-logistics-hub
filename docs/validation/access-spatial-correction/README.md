# Correções de acessos, vegetação, controles e torre

Baseline: `bb82eefb04b2685890e2e999f656ececf511a992` (`origin/main`). As seis mudanças usam o Canvas, renderer, OrbitControls, stores e ações existentes. Os proxies de apresentação não entram no cadastro comercial.

## Mudanças e limites

1. **Portão 9:** recupera a faixa larga à esquerda da Rua Pastor Albert Lehenbauer, registrada no raster 2028. A rua estreita vigente permanece intacta; a separação verde de `0,075` unidade acaba na junção inferior. O acesso mantém a identidade A9, recorta lotes/edifícios e usa a mesma geometria no Visit Mode. Um snapshot 2026 que fragmenta o corredor retorna `null`, sem inventar uma passagem.
2. **Ubiretama:** alinha o pavimento à geometria do snapshot 2026 ou 2028 e às bocas das ruas da Expo Rural. A correção termina no handoff PDF `[5660,2790]`; o trecho ao sul desse limite conserva a geometria anterior. Terreno, vegetação procedural, curbs e piso do Visit Mode usam o mesmo plano de apresentação.
3. **Árvores diante do Pavilhão 12/B3:** move somente os três IDs abaixo para o concreto existente, com `SIDEWALK_EDGE` e origem preservada em `previousSourcePosition`. Os testes mantêm as entradas livres e afastamento de tronco de pelo menos `0,2` unidade de rua/pavilhão. O suporte de concreto só acompanha sua apresentação efetiva; não cria piso para outras árvores ou pavilhões.
4. **Barra de controles:** compacta a cápsula desktop de **718 × 76 px** no baseline para **430 × 48 px medidos**, conservando ações, atalhos, menu e animação de `170 ms`. Botões desktop têm `38 px`; em toque, os botões visíveis mantêm alvos mínimos de `44 px` e cápsula de `54 px`. Teclado, tema noturno, tooltip e menu mobile passaram na QA de navegador.
5. **Via sul da Expo Rural:** apresenta o corredor de **6,00 m impresso na fonte** entre R04/R20–R25 e a área sem número, conectando Pastor ao Emanuel/entrada lateral de C4. O proxy substitui somente a apresentação do Emanuel, com a mesma identidade. A extensão termina no cap oeste exato da via atual; asfalto, aprons e amostragem dos curbs originais ao leste ficam preservados. Todos os lotes, inclusive `EXPORURAL-AREA-56878` de **568,78 m²**, são protegidos. O snapshot legado 2026 que ocupa essa faixa com parcelas retorna `null`.
6. **Torre junto ao Portão 9:** apresentação vinculada ao `RES-A9`, com altura estimada de **8,4 unidades da cena**, sem altura física levantada. A implantação é escolhida sem invadir vias/lotes/troncos; geometria e collider acompanham a mesma posição. Cada ativação de Rain produz um evento após **3 s**, com três pulsos durante **1,2 s**; desligar cancela o evento e uma nova ativação reinicia o prazo. Por solicitação explícita do usuário, a linha do tempo também ocorre com `prefers-reduced-motion`.

| Árvore | PDF anterior | PDF novo | Posição local X/Z |
| --- | --- | --- | --- |
| `tree-i-13` | `[3060,3728]` | `[2940,3800]` | `[-8.9455,18]` |
| `tree-i-14` | `[3120,3738]` | `[2970,3800]` | `[-8.2909,18]` |
| `tree-i-15` | `[3175,3727]` | `[3000,3800]` | `[-7.6364,18]` |

Os três troncos mantêm espécie, dimensões, inventário e estilos existentes. O concreto tem topo `0,068`, base visual do tronco `0,072` e receptor de sombra `0,080`. A nova via sul tem asfalto/piso físico em `0,032`; nenhum tronco canônico, procedural traseiro ou territorial existente cai em sua faixa.

## Preservação e fontes

[`source-preservation.json`](source-preservation.json) compara **73 fontes protegidas**, com SHA-256 e normalização LF, contra o baseline: **73/73 inalteradas**. `commercialTrees.ts` e `parkAccessEnvironment.ts` ficam fora desse hash porque contêm os deslocamentos e filtros específicos; seus contratos são verificados em testes separados. Não há alteração de lotes, numeração, preços, vendas, contratos, schema ou persistência nesta implementação.

Portão 9 e via sul usam `Fenasoja_Parque_Ajustes_300dpi.png` e a matriz já registrada em `docs/exporural/2028-revisao-2026-09-25/calibracao.json`. [`gate9-baseline.md`](gate9-baseline.md) e [`gate9-reference-crop.png`](gate9-reference-crop.png) documentam a distinção entre as duas faixas do A9. Implantação das árvores, recuo verde e dimensões/antenas da torre são estimativas de apresentação, sem novo levantamento cadastral ou executivo.

Os hashes atestam os arquivos locais protegidos. As capturas usam fixtures de referência; 2028 usa a prévia opt-in existente, com a geometria conhecida da área sem número nos testes. Isso não constitui auditoria do banco de produção, migração executada, deploy ou verificação física de campo.

## Evidência local e estado da validação

`scripts/access-spatial-correction/preservation.cjs` gera o relatório de fontes. `capture.cjs` compara as mesmas poses nas revisões 2026/2028, desktop e mobile emulado, mede identidade do renderer e recursos nos ciclos gráficos. `controls.cjs` verifica overflow, dimensões, toque, teclado, menu e temas na fixture de interface existente.

| Evidência | Estado nesta revisão |
| --- | --- |
| Baseline e candidato | `before/` e `after/`: quatro contextos 2026/2028 × desktop/mobile emulado, com 14 poses em cada um |
| Seis arquivos novos de testes | **52/52 passaram**, incluindo física, recortes protegidos, holes, curbs, procedurais e torre/raio |
| Suíte dirigida integrada | **195/198 passaram em 26 arquivos**; as três falhas restantes são herdadas, discriminadas abaixo |
| Typecheck, ESLint e build de diagnóstico | **Passaram**; logs `typecheck.log`, `eslint.log`, `build-diagnostics.log` |
| Identidade e saúde gráfica | Canvas/renderer/controls **1/1/1**, **zero perdas de contexto e zero erros** nos quatro contextos |
| Inventário em navegador | **Igual antes/depois em cada contexto**; as revisões 2026 e 2028 conservam seus inventários distintos |
| Controles | **Seis viewports passaram**, sem overflow; teclado noturno, tooltip e menu mobile verificados |
| Raio, comprovação visual por pixels | **Passou**: descarga real, reativação, cancelamentos, reduced motion e gráficos reduzidos |
| Build normal de produção e análise de bundle | **Passaram**: `build-production.log` e `bundle-report.log` |
| CI após publicar a PR | Consultar os checks e o estado registrado na descrição da PR; resultados locais não antecipam a CI |
| Banco/produção e dispositivo físico | **Não verificados por estas evidências locais** |

O resultado dos testes está em [`focused-tests-final.json`](focused-tests-final.json). Os relatórios `after/2026-desktop.json`, `after/2026-mobile-emulated.json`, `after/2028-desktop.json` e `after/2028-mobile-emulated.json` registram três ciclos gráficos aquecidos sem crescimento dos recursos:

| Dispositivo emulado/local | Geometrias | Texturas | Programas | Revisões |
| --- | --- | --- | --- | --- |
| Desktop | 594 | 138 | 242 | 2026 e 2028 |
| Mobile emulado | 584 | 137 | 242 | 2026 e 2028 |

Esses valores correspondem aos ciclos finais depois da recaptura das vistas do Portão 9 e da torre. O orçamento depende das vistas já visitadas, porque recursos existentes são preparados sob demanda; a comparação de crescimento usa os três ciclos de cada sessão.

[`after/weather.json`](after/weather.json) registra as primeiras descargas em **3048 / 3032 / 3011 ms** após o comando, com atraso lógico de 3000 ms. O renderer manteve **586 geometrias / 136 texturas / 242 programas**, e a torre reutilizou **8 geometrias, 8 materiais e 2 luzes**, incluindo os mesmos UUIDs. Os PNGs confirmam contraste em 191/191 amostras do canal; a vista que inclui a nuvem inteira confirma 200/200. O terminal da torre permanece legível na vista ampla, com contato contínuo até a estrutura, registrado em [`after/tower-terminal-connection.json`](after/tower-terminal-connection.json).

[`after/controls.json`](after/controls.json) registra as dimensões da cápsula:

| Viewport | Toque | Cápsula |
| --- | --- | --- |
| 1440 × 900 | Não | 430 × 48 px |
| 1280 × 720 | Não | 430 × 48 px |
| 390 × 844 | Sim | 322 × 54 px |
| 360 × 800 | Sim | 284 × 54 px |
| 320 × 740 | Sim | 238 × 54 px |
| 844 × 390 | Sim, paisagem | 330 × 54 px |

A duração computada `.17s` equivale aos `170 ms` preservados. As capturas Playwright são de Chromium local em Windows; mobile é **emulação de viewport/toque**, não um aparelho físico. Houve carga concorrente de CPU durante a coleta: os dados comprovam identidade, saúde e estabilidade nos ciclos medidos, sem sustentar alegações gerais de FPS/desempenho ou resultados de produção/dispositivos reais.

### Falhas herdadas registradas separadamente

Há cinco divergências herdadas registradas; três aparecem na rodada dirigida final. Elas não devem ser ocultadas por uma declaração de suíte global verde:

| Caso | Divergência conhecida | Rodada final |
| --- | --- | --- |
| `commercialMapRoadPrecision` / snapshot de `commercialMapSpatialBounds` | Espera `1692` registros; recebe `1578` | Falha herdada |
| `commercialMapRearRoadTreeClearance` | Lista esperada com `18` postes versus `12` atuais | Falha herdada |
| `commercialMapPavilion12PlanPresentation` | Procura o texto literal antigo `const heightScale = flatModules ? 1` | Falha herdada |
| `VisitWorld`, `tree-d-01` | Raio bruto esperado `0.173` versus raio físico `0.10034`, que já aplica fator `0.58` | Registrada separadamente no baseline |
| Controles mobile | Expectativa de ações inline/toque herdada do teste de interface | Registrada separadamente no baseline |

[`pavilion12-plan-baseline-failure.json`](pavilion12-plan-baseline-failure.json) comprova que o source `CommercialPavilionModuleLayer.tsx` e o teste correspondente possuem SHA-256 normalizados idênticos ao baseline; a string exigida não existe em nenhuma das versões. Isso distingue a falha preexistente da mudança das três árvores.

O [check espacial da PR 174](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36667453915/job/109735073654) já falhou no snapshot de inventário e na lista de postes. [`baseline-ci.json`](baseline-ci.json) conserva o estado consultado antes desta publicação.

## Seleção de imagens para a PR

O [índice visual](gallery/README.md) reúne seis montagens antes/depois com as vistas superior, oblíqua e ao nível da rua, desktop/toque, P12 reduzido e controles. As proporções são preservadas; os recortes da barra estão registrados no manifesto. A captura de [raio e nuvem completa](gallery/tower-lightning-cloud-full.png) e a captura em [gráficos reduzidos](gallery/tower-lightning-reduced-graphics.png) vêm diretamente do framebuffer real.

Os originais completos permanecem no arquivo local de evidências, fora do Git. O manifesto versionado conserva nomes, dimensões e SHA-256 de todos os PNGs; `gallery.py --source-root <arquivo> --candidate-commit <sha>` reproduz as montagens. Os scripts de captura regeneram o conjunto completo em `before/` e `after/`. Isso mantém todas as poses/revisões disponíveis para consulta e publica uma galeria compacta para revisão.
