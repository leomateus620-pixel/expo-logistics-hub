# Dashboard Comercial — interação e trabalho de apresentação

Referência: `e2acc54f044378e1c6d5129b6c4feb9837a4f78e`, extraída por `git archive` em um checkout imutável. Implementação na branch `codex/dashboard-interaction-performance`. As alterações pré-existentes em `package-lock.json` e `.worktrees/` não fazem parte desta otimização.

**Publicação e integração.** A [PR #191](https://github.com/leomateus620-pixel/expo-logistics-hub/pull/191) reúne este trabalho. As medições e capturas abaixo correspondem ao código de performance preservado no commit `7aff263d`, antes da integração das revisões de apresentação #189/#190 da `main` (`9f2ee996`). A integração conserva os novos cards, resumo de vendas, plantas e inspeção de lotes. Sua verificação é registrada separadamente; os números históricos desta execução não são apresentados como um novo benchmark do head integrado.

**Verificação após integrar a main.** Passaram 194 testes em 23 arquivos, incluindo as novas plantas/inspeção, cards, resumo de vendas, métricas canônicas, vendas/contratos, controle de apresentação e os seis casos de retorno/contexto. Os casos de navegação também verificam zoom e rolagem da planta durante o retorno de vendas e o descarte desse estado ao mudar projeto/organização. Typecheck e build frontend aprovados; lint de toda a dashboard, página, controlador de apresentação e teste de navegação sem erros, com dois avisos Fast Refresh já existentes na main (`CommercialSalesOrdersSection` e `SaleLotsEditAction`). Os logs desta etapa têm prefixo `integration-`. A comparação visual desta integração é registrada separadamente; a tabela histórica de performance continua vinculada ao commit medido.

A conferência visual contra a `main` atual usa a mesma fixture de inspeção, notebook e celular emulado, com as plantas 8 e 13. As seis comparações de DOM/layout/dados coincidem e 21/22 pares originais de PNG são exatos. A captura inicial da visão geral móvel apresenta 9.685 pixels de sombras com diferença máxima de um nível por canal. Controles independentes posteriores do mesmo candidato são idênticos aos controles e à captura original da main, demonstrando variação entre capturas do mesmo código. O resultado original 21/22 permanece registrado, sem tolerância adicional. Plantas, análise, área e ficha selecionada coincidem em todos os pares. Preview ancorado, seleção, foco/Escape, comprador/valor zero da fixture, cantos da planta, zoom, atualização local, rolagem, ajuste e resize entre 320–1.920 px passaram. Esse recorte verifica a integração visual, sem representar nova medição de performance ou cobertura de todos os pavilhões no head integrado. Evidências: [integration-visual](integration-visual/README.md).

O objetivo é reduzir trabalho do front-end mantendo a apresentação aprovada. Não há alteração de CSS, fontes, texturas, ícones, gráficos, dados oficiais, consultas, intervalos de sincronização, permissões, RPCs ou regras comerciais. O snapshot financeiro canônico e seus cálculos permanecem intactos.

**Ambiente e alcance da evidência.** Windows, Intel Core i5-1035G1, aproximadamente 8 GB de RAM, Chrome 154 headless, viewport de 1366 × 768 e DPR 1. A cena integrada usa a GPU Intel UHD via ANGLE/D3D11. A limitação de CPU 4× foi aplicada pelo Chrome DevTools Protocol; ela não representa outro computador nem certifica outra GPU. Os percursos rodam no servidor Vite local com instrumentação idêntica antes/depois, fora de produção.

A referência espacial local contém 1.579 entidades brutas, 1.578 entidades apresentadas e 1.466 lotes: 264 externos e 1.202 internos. Ela não é o inventário autenticado da captura do usuário, que mostra 1.472 lotes. A referência não possui os valores financeiros atuais. Vendas e contratos utilizam as fixtures existentes, com 20 registros apresentados, três itens no detalhe e 17 parcelas; todas as requisições externas são interceptadas ou bloqueadas. Uma segunda captura visual usa explicitamente valores e situações sintéticos, pelo helper de teste existente, para exercitar a barra comercial e o Sojinha. Nenhum desses valores é persistido.

**Como os tempos foram obtidos.** O percurso isolado tem oito repetições por versão e por condição de CPU. Inclui áreas externas, todos os pavilhões, os oito pavilhões individuais, foco, hover, seleção, teclado, métricas, preço A → B → A, interação durante atualização local dos dados, vendas, cinco abas de detalhe, retorno e fechamento/reabertura. A primeira abertura é registrada separadamente. Os traces compactados podem ser abertos no painel Performance do Chrome.

O indicador “feedback” mede o evento capturado no documento até duas oportunidades de `requestAnimationFrame`: é uma aproximação da primeira oportunidade de apresentação, não input-to-photon físico. “Conteúdo consistente” verifica o estado esperado no DOM e aguarda a apresentação seguinte; ao trocar de pavilhão, verifica a planta correspondente, e não apenas o título do recorte. O foco na visão de 1.202 lotes é programático; o hover e a seleção dos pavilhões usam ponteiro. React Profiler registra `actualDuration` e o instante de commit, sem somar durações de pais e filhos. Event Timing e o trace fornecem atraso de entrada, handler, renderização React, layout e pintura. A duração isolada de commit e de composição não ficou disponível; categorias aninhadas do trace não devem ser somadas como tempo de parede.

**Intervenções implementadas.**

- `CommercialDashboardSpaces` constrói contornos externos somente nos recortes que os exibem. A união exata, seus vazios e exclusões permanecem iguais. `commercialDashboardBoundaries` mantém até oito resultados espaciais, invalidados por geometria e associação aos segmentos.
- `commercialDashboardGeometry` mantém até 16 projeções puramente espaciais. Não retém snapshots comerciais: os registros atuais são reunidos às coordenadas em cada uso. Situação, identidade exibida, área e preço continuam vindo dos dados atuais.
- `CommercialMiniMap` separa caminhos, textos acessíveis, opções e decoração dos estados transitórios. Índices por identidade substituem buscas repetidas. O `ResizeObserver` aproveita a medida válida recebida e evita leitura de layout redundante.
- O retorno de vendas reutiliza somente memória de apresentação: recorte, seleção, métrica, situação destacada, comparação, zoom e rolagem. Os mapas não permanecem montados. Projeto e organização criam nova memória; uma restauração agendada perde validade se o usuário já voltou a vendas ou mudou de contexto.
- Vendas, filtros e detalhe assinam somente os campos necessários do Zustand. Cards estáveis não renderizam por alteração visual da busca; a troca de aba não reconstrói agrupamentos, contratos, itens e parcelas. Mudanças reais nos dados invalidam os resultados derivados.
- A apresentação 3D coberta usa `frameloop="never"`, desativa picking e interrompe produtores decorativos, varredura da chuva e amostragem de qualidade. O agendador também rejeita novos pedidos decorativos. Canvas, renderer, câmera, controles, recursos, dados e listeners de recuperação permanecem existentes. A retomada preserva fase de animação, tempo de transição e DPR vigente, e solicita nova apresentação.

Não foram removidas animações, texturas ou conteúdo; não foi acrescentado debounce aos cliques. O custo geométrico individual observado não justifica, nesta intervenção, a complexidade de um worker. Primeiro foi eliminada a repetição. O Sojinha, a proporção e a movimentação das barras mantêm seu código e CSS atuais.

**Resultado integrado — dashboard sobre a cena 3D.** O percurso completo tem 90 ações em três repetições, usando a mesma referência espacial, qualidade HIGH, caminho post e buffer 1.366 × 696 antes/depois. A prontidão exigiu `commercialMapReady`, estado saudável e `critical-post:end`; a hidratação completa ainda não estava marcada nesse gate e apareceu posteriormente. Não se compara o tempo desse gate como desempenho de abertura a frio. O comparador usa exclusivamente `before-integrated-retry-*` / `after-integrated-*`; tentativas interrompidas por recarregamentos do Vite estão identificadas e excluídas em [scene/validation.md](scene/validation.md).

Os tempos abaixo incluem o atraso entre evento e execução do handler. Cada célula é **mediana / p95**, em milissegundos; o feedback usa a mesma aproximação de duas oportunidades de rAF.

| Interação integrada | Antes | Depois |
| --- | ---: | ---: |
| Área externa → feedback | 161,0 / 209,1 | 30,3 / 31,9 |
| Pavilhão → feedback | 217,0 / 313,1 | 42,0 / 65,2 |
| Pavilhão → conteúdo consistente | 220,3 / 467,5 | 42,4 / 69,6 |
| Seleção de lote → feedback | 186,3 / 242,7 | 28,9 / 43,5 |
| Etapa de preço → feedback | 173,8 / 301,7 | 29,3 / 33,8 |
| Fechar dashboard → feedback | 261,4 / 264,0 | 78,5 / 90,5 |
| Reabrir dashboard → feedback | 351,7 / 426,2 | 165,3 / 204,5 |

O pior evento → conteúdo de pavilhão foi 953,0 → 114,3 ms. A mediana inclusiva do React Dashboard nessa operação foi 51,2 → 16,2 ms; na seleção, 21,8 → 3,7 ms. Os detalhes completos, incluindo amostras, atraso de entrada e fronteiras React, estão em [scene/comparison.json](scene/comparison.json). São resultados desse computador e percurso, sem promessa universal.

Enquanto coberta e sem interação, a cena seca passou de **265 frames e 42 tarefas longas em 11,52 s para zero frames e zero tarefas longas em 10,07 s**. Com chuva, passou de **312 frames e 15 tarefas longas em 11,29 s para zero/zero em 10,07 s**. Ao fechar a dashboard com chuva, retomou 314 frames em 10,41 s, mantendo HIGH/post, DPR 1, 827 draws e 703.516 triângulos. A intervenção responde a trabalho observado, não apenas à configuração sob demanda do Canvas.

Três entradas/saídas após seleção, pan e zoom preservaram exatamente câmera, seleção, Canvas, renderer, cena e controles; geometrias, texturas e programas tiveram variação zero em cada ciclo. O heap bruto oscilou entre 179,7 e 203,4 MB, sem crescimento monotônico nesse curto percurso e sem alegação de auditoria de vazamento. Em uma verificação separada, DPR adaptado 1,75 e buffer 2.390 × 1.218 permaneceram iguais durante cobertura e retorno. A perda/restauração de contexto injetada enquanto coberto foi recebida 1/1; ao fechar, o mapa voltou a `ready/post`, sem erro de página e com câmera/seleção preservadas. Consulte [retorno](scene/after-integrated-cycles.json), [DPR](scene/after-integrated-adapted-dpr.json) e [recuperação](scene/after-integrated-recovery.json).

**Resultado isolado — milissegundos, mediana / p95 / pior caso.** As distribuições completas estão em [comparison.json](comparison.json). Cada versão tem 318 operações medidas por condição de CPU; as repetições de foco, hover e seleção têm 48 amostras cada.

| Operação e condição | Antes | Depois |
| --- | ---: | ---: |
| Foco nos lotes internos, feedback, CPU 1× | 33,4 / 49,3 / 62,4 | 26,8 / 27,7 / 61,3 |
| Foco nos lotes internos, feedback, CPU 4× | 144,2 / 179,8 / 196,5 | 41,9 / 50,6 / 85,2 |
| Seleção por ponteiro, feedback, CPU 4× | 44,9 / 59,4 / 63,1 | 27,9 / 36,4 / 42,6 |
| Hover, feedback, CPU 4× | 28,3 / 38,2 / 40,9 | 18,6 / 19,8 / 20,2 |
| Voltar de vendas à visão geral, feedback, CPU 1× | 50,6 / 86,7 / 86,7 | 34,9 / 53,4 / 53,4 |
| Voltar de vendas à visão geral, feedback, CPU 4× | 260,5 / 279,8 / 279,8 | 192,8 / 264,8 / 264,8 |
| Reabrir dashboard, feedback, CPU 4× | 355,6 / 379,1 / 379,1 | 321,1 / 335,8 / 335,8 |
| Abrir todos os 1.202 lotes internos, feedback, CPU 4× | 461,3 / 518,9 / 518,9 | 382,1 / 494,8 / 494,8 |
| Alterar etapa de preço, conteúdo consistente, CPU 4× | 82,1 / 111,2 / 111,2 | 58,6 / 79,4 / 79,4 |

O custo React após o início do evento caiu de 113,1 / 140,3 / 163,1 para 14,0 / 17,5 / 51,4 ms no foco a CPU 4×; na seleção, de 29,8 / 38,9 / 69,6 para 13,2 / 19,4 / 24,1 ms. A comparação distingue `reactAfterEventStart` do custo total da operação: mover o ponteiro antes do clique também pode produzir hover e foco. Durações de componentes filhos não são somadas à do Dashboard.

A construção geométrica bruta passou de **168 para 17 execuções** em cada percurso de oito repetições. Trocar a etapa de preço, retornar de vendas e reabrir com geometria já conhecida não executa novamente a união/projeção. O cache mantém a primeira construção necessária; ele não elimina o custo inicial de apresentar os 1.202 caminhos da visão interna.

Event Timing, considerando apenas entradas com duração mínima de 16 ms e depois do início do percurso aquecido, mostra p95 do atraso de entrada a CPU 4× de 34,4 → 18,5 ms; p95 de execução dos handlers de 28,1 → 15,5 ms. As entradas incluem vários eventos por interação. No trace de uma repetição aquecida a CPU 4×, o trabalho total de `FunctionCall` foi 3.960,8 → 1.921,0 ms, de layout 623,0 → 483,2 ms e de pintura 454,6 → 409,7 ms. Esses totais se sobrepõem entre categorias. O trace não forneceu entradas `Commit`/`RunTask`; isso não significa custo zero. A composição da GPU não foi cronometrada separadamente.

As tarefas longas aquecidas caíram de 31 para 11 a CPU 1× e de 216 para 110 a CPU 4×. Há limites claros: o p95 das tarefas longas restantes a CPU 4× foi **274 → 361 ms**, apesar de o pior caso cair de 502 para 476 ms. O pior hover até conteúdo consistente foi **110,1 → 435,2 ms**, embora mediana e p95 melhorem. A CPU 1×, a mediana do feedback de seleção foi 19,5 → 25,5 ms; o p95 foi 28,8 → 27,6 ms. Portanto, a redução de trabalho está demonstrada, mas não há melhora uniforme em toda amostra.

A primeira abertura da sessão local foi 2.876 → 2.078 ms a CPU 1× e 3.626 → 2.967 ms a CPU 4×. Ela inclui importação/avaliação de código no servidor de QA, fontes e apresentação inicial; não é tempo de abertura de um build publicado. A interrupção intermitente de aproximadamente três segundos durante interação não foi reproduzida. Estes resultados não permitem declarar que ela foi eliminada em produção.

**Preservação visual e memória.** As 12 comparações de PNG são estritas: **zero pixels alterados**, incluindo os oito pavilhões, visão geral, visão interna, vendas e detalhe. Os 12 registros de apresentação no DOM também coincidem integralmente: viewBox, caminhos, contornos, números, posições, cores e textos acessíveis. Não foi aumentada tolerância para aceitar diferenças. Consulte [comparison.json](comparison.json) e [visual](visual/).

No percurso móvel de 390 × 844 com toque emulado, **17/17 pares de PNG são idênticos**, incluindo visão geral, oito telas de pavilhão e oito plantas. As oito métricas espaciais também coincidem: IDs, geometria oficial, números, dimensões, encaixe, acessos e apoios. Seleção e zoom foram preservados durante a atualização comercial local em todos os pavilhões; o resize voltou ao encaixe esperado. Zero erros da aplicação e zero requisições de backend nesse percurso. Evidência: [responsive/comparison-mobile.json](responsive/comparison-mobile.json).

A segunda referência financeira cobre 1.920 × 1.080, 1.366 × 768, 390 × 844 e 844 × 390. Totais canônicos e apresentação DOM/estilos/dimensões coincidem **4/4**; controles de repetição na mesma página são exatos **8/8**. A comparação original antes/depois é exata em **6/8 PNGs e continua falhando estritamente nos outros dois**: no desktop financeiro há 1.267 pixels diferentes, máximo de dois níveis por canal; em contratos, um pixel. Um controle independente da mesma versão anterior reproduziu 1.266 diferenças de rasterização das sombras/cabeçalho/cards. Resta um pixel não explicado, em `(1457, 27)`, no ícone do cabeçalho do mapa acima da dashboard, com diferença máxima de dois níveis por canal. Ele está registrado como ressalva, sem relaxar tolerância nem alterar a aparência para fazer o teste passar. Números, barra, Sojinha e conteúdo abaixo dessa região coincidem. Consulte [comparação estrita](visual/financial-comparison.json), [regiões](visual/financial-pixel-regions.json) e [controle independente](visual/financial-raster-control.json).

Gravações curtas do mesmo percurso no notebook: [antes](visual/before-notebook-financial-interactions.webm) e [depois](visual/after-notebook-financial-interactions.webm). Elas documentam navegação, controles e retorno; os tempos de performance vêm das medições estruturadas, não da inspeção do vídeo.

Após coleta explícita de lixo em cada ciclo, o DOM permaneceu com 1.085 elementos nas oito entradas/saídas. A CPU 4×, o heap observado passou de 30,3–32,4 MB antes para 35,2–37,4 MB depois: custo adicional de aproximadamente 5 MB para caches e instrumentação. A instrumentação também acumula amostras ao longo do percurso. Os caches têm limites explícitos; oito ciclos não constituem prova de ausência de vazamento de longo prazo. Os microbenchmarks Node [antes](spatial-before.json) e [depois](spatial-after.json) foram registrados sob concorrência com build/testes e são apenas evidência suplementar, sem alegação de ganho controlado.

**Verificações executadas.**

| Verificação | Resultado |
| --- | --- |
| Minimap e recortes, incluindo invalidação espacial e A → B → A | 30 testes aprovados |
| Analytics, apresentação, visão geral e métricas canônicas | 39 testes aprovados; um timeout durante build concorrente passou na repetição isolada |
| Vendas, filtros, detalhe e atualização dos dados | 14 testes aprovados |
| Retorno de vendas, foco, rolagem e troca de projeto/organização | 6 testes aprovados |
| Barra comercial, denominadores, centavos, zero/ausência e diálogo de contrato | 8 testes aprovados |
| Cena, qualidade adaptativa, ambiente e pipeline de renderização | 179 aprovados; duas falhas preexistentes reproduzidas no baseline |
| `npm run typecheck` | Aprovado no código final; tipos de fixtures novos corrigidos durante a verificação |
| ESLint dos arquivos alterados | Zero erros; um aviso Fast Refresh preexistente em `SaleOrderCard` |
| `npm run build -- --config scripts/dashboard/presentation.build.config.ts` | Aprovado; avisos de Browserslist antigo e chunks grandes |
| `git diff --check` | Aprovado |

São **276 testes únicos aprovados e duas falhas preexistentes**, nas suítes pertinentes do commit medido. O build usa as opções originais da aplicação, excluindo somente o gerador MCP que grava uma função Supabase durante o build. Assim, valida o frontend sem introduzir alterações de backend. Os logs publicados estão compactados como `*.log.gz`, preservando os bytes originais; [scene/validation.md](scene/validation.md) identifica as duas asserções textuais preexistentes. Tentativas de navegador interrompidas e snapshots intermediários permanecem locais; somente evidências finais entram na PR. O sucesso do build não é usado como evidência de fluidez.

As verificações em navegador exercitaram Tab/Shift+Tab, foco visível, Home/End/Enter nos lotes, pausa/retomada do Sojinha, Escape nos filtros, envio da busca, contratos, paginação de parcelas 8/8/1, retorno à busca e ao foco de origem, toque, seleção pela lista, ampliar/ajustar a planta e resize/orientação. Os testes do minimapa cobrem adicionalmente setas e Espaço. Os valores financeiros da fixture visual foram idênticos nas duas versões: confirmadas R$ 518.250,00; em aberto R$ 517.375,00; total conhecido R$ 2.067.250,00; área oficial 81.553,67 m². São valores de teste, e não os números reais da captura do usuário.

**Arquivos de produção alterados.** Em `src/features/commercial-map/dashboard`: `CommercialDashboard`, `CommercialDashboardSpaces`, `CommercialDashboardPavilion`, `CommercialMiniMap`, `commercialDashboardBoundaries`, `commercialDashboardGeometry`, `useDashboardStatusHighlight` e os quatro componentes em `salesOrders` (`CommercialSalesOrdersSection`, `SalesOrdersFilters`, `SaleOrderCard`, `SaleOrderDetail`). Em `components/canvas`: `CommercialMapCanvas`, os novos `CommercialMapPresentation`/`CommercialMapPresentationContext`, `CommercialMapAdaptiveQuality`, `CommercialMapRainLayer`, `AmusementPark`, `LivestockCattle` e `executives/SeatedExecutiveCharacters`. Também `CommercialMapPage` e `utils/frameActivity`. Os demais arquivos adicionados/alterados nesta entrega são testes, harnesses e evidências de QA; nenhum arquivo de backend foi alterado.

**Reprodução.** Os harnesses ficam em `scripts/dashboard`, fora das rotas e do build de produção. `performance.vite.config.ts` recebe `DASHBOARD_QA_ROOT` para apontar para um checkout da referência ou da implementação; rode cada servidor em uma porta distinta. Copie as entradas `performance-qa.{html,tsx}` e `financial-visual-qa.{html,tsx}` para o checkout de referência e use as mesmas dependências instaladas. A instrumentação e a liberação da dashboard na rota de diagnóstico existem somente nesse config de QA. A lista final de prebundle reúne as dependências descobertas nos dois percursos aquecidos para evitar recarregamento de desenvolvimento durante uma reprodução nova; isso não altera o bundle de produção.

`performance-browser.cjs` recebe `DASHBOARD_BASE_URL`, `DASHBOARD_EVIDENCE_LABEL=before|after`, `DASHBOARD_CPU_RATES=1,4` e `PLAYWRIGHT_MODULE` quando o Playwright está fora do `node_modules` do projeto. Execute as fases sequencialmente, sem builds/testes/outros benchmarks concorrentes. `compare-performance-evidence.cjs` faz a comparação estrita e produz `comparison.json`. `financial-visual-browser.cjs` e `compare-financial-visual.cjs` registram a apresentação financeira, os controles e as gravações. O procedimento integrado e seus parâmetros estão em [scene/validation.md](scene/validation.md).

**Limites da avaliação.** Não foram exercitados dados/permissões de produção, emissão/anexação comercial real, refetch remoto autenticado, troca real de usuário, retorno de aba realmente oculta/frozen, navegador móvel físico, Safari/iOS, zoom da interface nativa do navegador ou medições de longa duração. Resize e orientação usam viewport Chromium; a atualização durante interação é local e reproduzível. As fontes de dados, regras de autorização e sincronização da aplicação permanecem intactas. A eventual ausência de cobertura física ou autenticada não é substituída por aprovação de build ou fixtures.
