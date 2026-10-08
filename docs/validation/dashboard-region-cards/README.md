# Dashboard Comercial: cards de área, vendas e recortes

Validação local de 7 de outubro de 2026. A intervenção abrange Área comercial, a entrada de Vendas e contratos e os quatro seletores externos e oito pavilhões. Os mapas, gráficos, indicadores superiores, barra financeira e cabeçalho mantêm a apresentação existente.

## Fontes dos indicadores

| Indicador | Fonte usada pela interface | Base e ressalvas |
| --- | --- | --- |
| Área comercial | `buildCommercialDashboardSnapshot().overall.totalAreaSqm` | Soma das áreas oficiais válidas do inventário comercial. Áreas ausentes ficam pendentes; não há estimativa geométrica. |
| Área comercializada | `overall.saleOpenAreaSqm + overall.soldAreaSqm` dividido por `overall.totalAreaSqm` | Por metragem, independente da barra financeira. Cobertura parcial e inconsistências aparecem nos detalhes. Base ausente usa estado indisponível. |
| Total de espaços em cada card | `totalLots` do recorte canônico | Inclui indisponíveis, quando presentes. O controle de informações distingue total cadastral da base comercial. |
| Percentual de cada recorte | `(saleOpenLots + soldLots) / commercialLots` do mesmo agregado | Lotes ativos deduplicados pelo snapshot. Base ausente aparece como traço. A apresentação evita arredondar para 100% antes da conclusão. |
| Registros de venda | `fetchSaleOrdersPage(projectId, EMPTY_SALE_FILTERS, 0).total` | Total global informado pela API; não usa a quantidade de linhas da página. |
| Aguardando assinatura | `fetchSaleOrdersPage(..., status: 'PENDING', 0).total` | A API já inclui assinatura parcial. Não há soma adicional de `PARTIAL`. |
| Assinatura confirmada | `fetchSaleOrdersPage(..., status: 'SIGNED', 0).total` | Classificação do fluxo existente. Anexos e recebimentos não são usados para inferir confirmação. |

Os dois subtotais de assinatura não precisam compor o total global, que também inclui registros legados e outras situações. Nenhum número dos anexos foi fixado na interface.

## Composição e interação

A nova região usa as quatro colunas do grid superior. Em desktop, Área comercial ocupa as duas primeiras, com sua borda direita alinhada ao indicador de lotes com venda em andamento; Vendas e contratos ocupa as duas seguintes. Em larguras menores, os cards se reorganizam sem cortar as ações ou a metragem.

Os segmentos usam identidades estáveis associadas aos IDs canônicos: consolidado neutro, rural orgânico, indústria geométrica e automóvel com percurso discreto. As barras mantêm a mesma semântica de andamento e confirmação. Os oito pavilhões compartilham composição arquitetônica e nomes completos. A seleção cobre o card e o controle de informações é um botão irmão, sem botão aninhado.

O agregado interno permanece no snapshot. O antigo estado `internal:all` é normalizado explicitamente para `external:all`, sem escolher um pavilhão arbitrário. O contexto de recorte, módulo e métrica fica preservado ao acessar vendas e retornar à visão geral, junto com foco e rolagem.

## Evidência visual

As capturas usam o cadastro oficial de referência carregado localmente, com a mesma base antes e depois. Essa base tem 1.466 espaços comerciais, 264 registros externos e 81.553,67 m² conhecidos; não é uma leitura da produção e não representa os números atuais do projeto. Os totais de vendas 41 / 17 / 9 são respostas de teste isoladas da API existente.

| Contexto | Antes | Depois |
| --- | --- | --- |
| Desktop 1920 × 1080 | [Visão geral](evidence/before-desktop-overview.png), [área](evidence/before-desktop-area.png), [entrada](evidence/before-desktop-summary.png), [seletores](evidence/before-desktop-selectors.png) | [Visão geral](evidence/after-desktop-overview.png), [área e vendas](evidence/after-desktop-summary.png), [seletores](evidence/after-desktop-selectors.png) |
| Notebook 1366 × 768 | [Visão geral](evidence/before-notebook-overview.png), [área](evidence/before-notebook-area.png), [entrada](evidence/before-notebook-summary.png), [seletores](evidence/before-notebook-selectors.png) | [Visão geral](evidence/after-notebook-overview.png), [área e vendas](evidence/after-notebook-summary.png), [seletores](evidence/after-notebook-selectors.png) |
| Celular 390 × 844 | [Visão geral](evidence/before-mobile-overview.png), [área](evidence/before-mobile-area.png), [entrada](evidence/before-mobile-summary.png), [seletores](evidence/before-mobile-selectors.png) | [Visão geral](evidence/after-mobile-overview.png), [área e vendas](evidence/after-mobile-summary.png), [seletores](evidence/after-mobile-selectors.png) |

As imagens `after-*-known-area-progress.png` mostram a área comercializada após a confirmação de um lote com metragem oficial, por alteração de estado somente no harness local.

Somente nos recortes individuais de área, resumo e seletores, os cabeçalhos fixos são ocultados temporariamente pelo script para não sobrepor os primeiros dados do recorte. O script restaura os cabeçalhos antes das interações e das verificações reais; a captura geral e as capturas protegidas usam a interface completa.

## Verificações de navegador

O script `scripts/dashboard/region-cards-browser.cjs` monta os componentes reais em Chromium. Intercepta todas as chamadas Supabase e autoriza somente respostas locais dos RPCs de leitura já existentes `list_commercial_sale_orders`, `get_commercial_sale_order_detail` e `get_sale_order_revisions`. Qualquer outra chamada recebe 403 antes de chegar à rede. Não há sessão real, escrita, upload ou consulta de produção.

Os relatórios [desktop](evidence/after-desktop.json), [notebook](evidence/after-notebook.json) e [celular](evidence/after-mobile.json) registram:

- 36 seleções reais: quatro áreas externas e oito pavilhões em três contextos. Cabeçalho, indicadores do recorte, entidades da planta e quantidades do gráfico são conferidos contra o mesmo snapshot.
- 36 controles de detalhes, sem alterar a seleção; seleção por Enter, foco por Tab e fechamento por Escape sem fechar a dashboard. Ausência de botões aninhados.
- Estados de lote `SALE_OPEN`, `SOLD` e `AVAILABLE` em cada contexto, com número e barra por área acompanhando o snapshot e sem dupla contagem.
- Larguras 320, 390, 768, 1000, 1366 e 1920 em cada contexto: sem rolagem horizontal da página e sem nomes, percentuais ou valores cortados. A borda direita da área coincide com o segundo KPI nas larguras desktop.
- Total global 41 com somente 20 registros na primeira página; resumo obtido por três consultas limitadas à página inicial, sem varredura de páginas. A lista dedicada continua paginando.
- Atualização por invalidação do prefixo `commercial-sale-orders`: mantém o último dado válido do mesmo contexto durante a consulta; falha transitória mostra dado anterior com indicação de indisponibilidade. Projeto novo com falha e acesso negado mostram traços, sem zero falso nem dados de outro projeto. Sem autorização, não há consultas do resumo.
- Retorno de vendas com foco no acesso e rolagem preservada; preservação de Pavilhão 13, módulo selecionado e métrica de área oficial.
- Nenhum erro de execução da página e nenhuma chamada backend fora dos RPCs de leitura interceptados.

Cabeçalho da dashboard, três cards financeiros, barra financeira e os quatro KPIs superiores foram capturados individualmente antes e depois. Os retângulos são idênticos. O comparador registra hashes e pixels decodificados; admite diferença máxima de dois níveis em um canal de cor de 8 bits para a composição de gradientes pelo Chromium. O fixture inicial não tem vendas com valores conhecidos, portanto o Sojinha não aparece nessa comparação; seu código e seus estilos permanecem fora do diff. O script aguarda o registro e carregamento das fontes Manrope/Sora usadas pela dashboard antes de capturar.

As simulações de assinatura, autorização e falha são respostas de teste. Elas não validam RLS remoto, autenticação real, uploads, dados publicados, WebGL, aparelhos físicos ou Safari/iOS.

## Reproduzir

Use Node, Playwright/Chromium e `pngjs` disponíveis no ambiente. Se Playwright estiver fora do projeto, informe o caminho em `PLAYWRIGHT_MODULE`; o comparador procura `pngjs` no mesmo runtime. Cacheie as fontes com `node scripts/dashboard/presentation-fonts.cjs --cache`.

```powershell
node node_modules/vite/bin/vite.js --config scripts/dashboard/presentation.vite.config.ts --port 5194 --strictPort
$env:DASHBOARD_BASE_URL = 'http://127.0.0.1:5194'
$env:DASHBOARD_EVIDENCE_LABEL = 'after'
node scripts/dashboard/region-cards-browser.cjs
```

Para a linha de base, execute um servidor da versão anterior e use `DASHBOARD_EVIDENCE_LABEL=before`. O script usa o harness de vendas existente no antes e o novo harness isolado no depois, com os mesmos dados iniciais.

## Limites do diff

As alterações de aplicação se restringem a componentes, utilitários de apresentação, CSS e integração de atualização da dashboard. Os novos scripts, testes e este relatório são locais. Nenhum arquivo de banco, migration, RPC, RLS, configuração Supabase, rota ou regra comercial foi alterado.

A [prova de escopo](scope-proof.json) registra ausência de alterações em `supabase` e `src/integrations/supabase`, além dos hashes idênticos do snapshot, mapas, gráficos e componentes do progresso financeiro. O plugin existente de build regenera automaticamente `supabase/functions/mcp/index.ts`; esse arquivo gerado foi restaurado à versão original e está fora da entrega.

## Verificação da implementação

- `npm run build`: passou; [log](build.log). O aviso de chunks grandes não bloqueou a compilação.
- `npm run typecheck`: passou; [log](typecheck.log).
- 146 testes em 16 arquivos de dashboard, progresso e vendas: passaram; [relatório](unit-tests.json). A execução final usou um worker e limite de 15 s por teste. A primeira execução concorrente com build, lint e navegador teve timeouts de testes de interface; a execução isolada completou todas as asserções.
- ESLint de todos os arquivos TypeScript/TSX alterados: nenhum erro ou aviso; [relatório](lint-changed.json).
- O lint global permanece com falhas preexistentes. A [comparação dos arquivos rastreados](lint-comparison.json) encontrou exatamente as mesmas 982 falhas e 74 avisos na base e no resultado, com os mesmos arquivos, regras e mensagens. `npm run lint` também falha na base de regras do projeto; não houve correção de módulos fora do escopo.

O serviço frontend agora valida o `total` recebido: resposta bem-sucedida sem total válido produz indisponibilidade, enquanto zero explícito é preservado. Essa validação não altera argumentos, nomes ou definições de RPCs. Os testes incluem assinatura parcial, legados, mais de uma página, cancelamento, duplicidade, áreas ausentes, base zero, resposta malformada e perda de autorização com resposta atrasada.

As consultas do resumo compartilham `commercial-sale-orders`, e o ciclo existente de sincronização da dashboard invalida esse prefixo independentemente de uma mudança da revisão do mapa. Não foi acrescentado intervalo, canal realtime ou recarga completa para acompanhar documentos.
