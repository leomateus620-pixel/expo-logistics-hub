# Dashboard Comercial — evolução de apresentação

Base conferida: `main` / `origin/main` em `8d7fe60dc3f3555dafcad9a81928b97241115c2a`.
Validação local em 05/10/2026. Implementação exclusivamente de frontend.

## Organização entregue

- Botão Dashboard imediatamente depois de Vendas, com SVG próprio, tooltip, nome acessível e foco de retorno. O acesso continua condicionado a `canViewMapAnalytics` e às restrições de prévia, comissão e Modo Visita, independentemente da disponibilidade de Vendas. Somente a antiga opção Dashboard saiu de Gestão.
- A visão geral contém uma entrada compacta para Vendas e contratos. A listagem só monta e consulta quando essa área é aberta; o detalhe só consulta o pedido selecionado.
- Área dedicada dentro da sobreposição existente: retorno à visão geral, controles Buscar/Filtrar recolhidos, critérios aplicados, cartões por `recordId`, registros legados separados e paginação existente. A grade responde à largura do contêiner.
- Detalhe dedicado com Visão geral, Espaços, Financeiro, Contratos e Histórico. Somente a aba ativa monta seu conteúdo. Parcelas usam paginação local de oito registros, sem nova consulta. Valores originais, subtotal ativo, recebimentos e zero/valor desconhecido mantêm significados distintos.
- Edição de lotes, upload e nova versão reutilizam os diálogos e mutations existentes. Documentos restritos continuam distintos de documentos ausentes; assinatura, anexo e pagamento permanecem independentes.
- `useSalesOrdersUiStore` conserva área, filtros, página, identidade selecionada, aba, rolagens e origem do mapa. Guarda apenas os três IDs do pedido selecionado; valores comerciais vêm das respostas existentes. O detalhe continua acessível se a revisão retirar o registro da página filtrada e o cache da lista desaparecer. Ao trocar de projeto, limpa a seleção anterior antes de montar o detalhe e limita o placeholder da lista ao projeto atual; voltar ao mapa no mesmo projeto preserva o contexto.
- Plantas SVG usam envelope interno oficial, acessos e apoios permanentes. O P8 inclui os apoios ao norte. Líderes locais deixam de enquadrar paredes externas distantes. Altura, proporção do painel e números consideram o conteúdo e os pixels disponíveis. `meet`, seleção, legendas e callback do mapa permanecem.
- O helper `commercialSalesProgress.ts` foi renomeado para `commercialSalesProgressMetrics.ts`: no Windows, o nome anterior colidia com o componente `CommercialSalesProgress.tsx`. Fórmulas preservadas. A colisão já causava erro nos testes da revisão base.

## Arquivos principais

| Grupo | Arquivos dentro de `src/features/commercial-map/` |
| --- | --- |
| Entrada e foco | `CommercialMapPage.tsx`, `components/shell/CommercialMapHeaderTools.tsx`, `components/shell/commercial-map-shell.css`, `utils/contextualNavigation.ts` |
| Visão geral | `dashboard/CommercialDashboard.tsx`, `dashboard/commercial-dashboard.css` |
| Vendas | `dashboard/salesOrders/CommercialSalesOrdersSection.tsx`, `useSalesOrdersUiStore.ts`, `sales-orders.css`, `SaleOrderCard.tsx`, `SalesOrdersFilters.tsx`, `SaleOrderDetail.tsx`, `SaleOrderContracts.tsx`, `SaleOrderHistory.tsx`, `salesOrdersPresentation.ts` |
| Plantas | `dashboard/CommercialDashboardPavilion.tsx`, `CommercialMiniMap.tsx`, `commercialDashboardPavilionGeometry.ts`, `commercialDashboardGeometry.ts` |
| Resolução Windows | `dashboard/CommercialSalesProgress.tsx`, `commercialSalesProgressMetrics.ts` |

Sem mudanças em rotas, serviços comerciais, contratos de dados, RPCs, mutations, diálogos de edição/anexação, arquivos Supabase, integração de autenticação ou dados oficiais persistidos. O diff dessas superfícies foi conferido.

## Verificações

| Conferência | Resultado / evidência |
| --- | --- |
| Testes focados | 158 testes distintos em 19 arquivos aprovados. A primeira execução concorrente teve timeouts; as suítes afetadas passaram com um worker, mantendo o timeout padrão. A última execução de vendas passou 12/12, incluindo troca de projeto sem reabrir o pedido anterior. [Execução inicial](focused-regressions.log), [reexecução delimitada — 29/29](focused-regressions-limited.log), [troca de projeto e vendas](sales-project-scope.log). |
| Plantas após o último ajuste | Nova execução focada de 26 testes de minimapa/escopos aprovada; métricas e limites em [pavilion-fit.md](pavilion-fit.md). |
| Typecheck | Aprovado, sem diagnósticos. [Log](typecheck.log). |
| ESLint | Zero erros nos 25 arquivos TS/TSX alterados/novos. Um aviso de Fast Refresh no reexport compatível de `signatureSummary`. [Arquivos integrados](eslint-frontend.log), [última revisão de vendas](eslint-sales-final.log). |
| Build frontend | Aprovado com as opções da aplicação e somente o gerador MCP excluído para não reescrever uma função Supabase local. Avisos de chunks grandes/Browserslist registrados em [build.log](build.log). |
| Carregamento sob demanda | Asserção do bundle aprovada: renderer, física e PDF não são necessários antes da consulta do mapa. [Log](bundle.log). |
| Browser de vendas | Desktop 1920×1080, notebook 1366×768 e celular 390×844. Sem erros de página/overflow lateral; grade 5/3/1 colunas; busca somente após Enter; cinco abas, 17 parcelas em 8+8+1, volta do mapa com filtros/página/aba/foco. Nenhuma consulta da lista na visão geral e nenhum detalhe antecipado nos cartões. [Desktop](evidence/after-desktop-sales.json), [notebook](evidence/after-notebook-sales.json), [mobile](evidence/after-mobile-sales.json). |
| Browser de plantas | Antes/depois dos oito pavilhões existentes nas três dimensões: fit integral, controles, resize, troca de pavilhão, atualização comercial sem reset de zoom e equivalência de IDs, números e hashes das geometrias oficiais. [Medições](pavilion-fit.md). |

## Capturas e limites da evidência

As capturas de plantas carregam o inventário oficial local. As de vendas usam respostas de teste isoladas para as três RPCs de leitura já existentes, com dois pedidos do mesmo expositor, um legado, cancelamento, valor zero, 17 parcelas, recebimento e contrato compartilhado com versões. Todos os pedidos de backend/storage são interceptados; outras operações são rejeitadas. Não foram feitas vendas, uploads, alterações comerciais ou consultas autenticadas reais para produzir a evidência.

Os scripts em `scripts/dashboard/presentation-*` são harnesses de validação local; não participam do App nem criam rotas de produção. Usam os componentes reais e as fontes existentes, com cache temporário de fontes fora do repositório. A comparação base resolve explicitamente a extensão `.tsx` apenas para contornar a colisão de nomes já presente no Windows.

O percurso de interface Dashboard → mapa → Dashboard foi exercitado com o fechamento/remontagem da sobreposição e o mesmo store. O enquadramento Three.js, a sessão autenticada real, RLS remota, execução comercial e dispositivos físicos não foram validados por esse harness. A resolução agrupada da inspeção e os diálogos mantidos têm testes focados; isso não comprova uma sessão de produção.

Nos pavilhões densos, especialmente 1 e 12 no celular, a planta integral permite compreender a distribuição, mas nem todos os números individuais são legíveis no primeiro enquadramento (cerca de 3,6–4,2 px). Zoom, seleção por teclado e seletor oficial continuam disponíveis para a identificação individual. Os SVGs não foram esticados nem os módulos deslocados para ocultar essa limitação.

| Captura | Link |
| --- | --- |
| Entrada própria | [Notebook](evidence/after-notebook-dashboard-entry-button.png), [mobile](evidence/after-mobile-dashboard-entry-button.png) |
| Visão geral com acesso compacto | [Desktop](evidence/after-desktop-overview-entry.png), [acesso no mobile](evidence/after-mobile-overview-access.png) |
| Cartões | [Desktop](evidence/after-desktop-sales-cards.png), [notebook](evidence/after-notebook-sales-cards.png), [mobile](evidence/after-mobile-sales-cards.png) |
| Filtros | [Notebook](evidence/after-notebook-sales-filters.png), [mobile](evidence/after-mobile-sales-filters.png) |
| Detalhe financeiro | [Notebook](evidence/after-notebook-sale-finance.png), [mobile](evidence/after-mobile-sale-finance.png) |
| Contratos e histórico | [Contratos](evidence/after-notebook-sale-contracts.png), [histórico](evidence/after-notebook-sale-history.png) |
| Pavilhão 8 antes/depois | [Antes — notebook](evidence/before-notebook-pavilion-8.png), [depois — notebook](evidence/after-notebook-pavilion-8.png), [antes — mobile](evidence/before-mobile-pavilion-8.png), [depois — mobile](evidence/after-mobile-pavilion-8.png) |

Todas as plantas, incluindo a referência P1, têm capturas `before/after-{desktop,notebook,mobile}-pavilion-{1,3,5,7,8,12,13,14}.png` e recortes `-plant.png` no diretório [evidence](evidence).

## Reprodução local

```powershell
npm run typecheck
npm run build -- --config scripts/dashboard/presentation.build.config.ts --manifest
node scripts/commercial-map-performance/bundle-report.cjs dist --assert-independent
node scripts/dashboard/presentation-fonts.cjs --cache
npm run dev -- --config scripts/dashboard/presentation.vite.config.ts --port 5191 --strictPort
```

Em outro terminal com Playwright disponível (ou `PLAYWRIGHT_MODULE` apontando para o pacote instalado):

```powershell
node scripts/dashboard/presentation-sales-browser.cjs
node scripts/dashboard/presentation-browser.cjs
```

Para comparar a base, execute o mesmo servidor QA com `DASHBOARD_QA_ROOT` apontando para um checkout da revisão indicada, em outra porta; defina `DASHBOARD_BASE_URL` e `DASHBOARD_EVIDENCE_LABEL=before` no script de plantas. Chrome e dependências do repositório são pré-requisitos. A configuração QA exclui o gerador MCP e não modifica o Supabase.
