# Despesas · FENASOJA 2028 — entrega comparativa

Validação em 13/10/2026. Branch: `codex/financial-expenses-comparison`, baseada na infraestrutura operacional da principal (`03bee679`).

## Resultado

2028 tem uma entrada **Despesas** e cabeçalho compacto. As duas rotas existentes continuam abrindo a comparação compartilhada com foco correspondente. O seletor de edição permanece na sidebar; 2026 mantém sua apresentação histórica somente leitura.

Os painéis Projetado/Realizado usam uma divisão inicial 50/50, limites 35/65, alça discreta, teclado, mouse, duplo clique e botão de restauração. A preferência exclusiva `financial-expense-split-2028` é gravada localmente, inclusive antes de uma recarga imediata. A largura do container define a troca para abas abaixo de 840 px, considerando o espaço ocupado pela sidebar. Painéis, filtros e formulários permanecem montados durante ajuste de largura.

Os indicadores, rankings por categoria/comissão e análises complementares vêm de `financial_expense_comparison`. A lista compartilhada vem de `financial_list_expenses`; a paginação não alimenta os totais. Valores seguem em centavos até a apresentação. Previsões preservadas de despesas realizadas continuam no total projetado. Realizado é compromisso; pago líquido é liquidação. Categorias personalizadas, arquivadas vinculadas e grupos sem classificação permanecem identificáveis.

A busca tem botão e limpeza. Categoria e comissão ficam na barra; situação, campo de data e limites do período ficam em **Mais filtros**. Desktop prioriza descrição/classificação, projetado, realizado e desvio. Mobile usa registros expansíveis. O detalhe autorizado reúne pagamento, saldo, datas, histórico e ações permitidas. A paginação retorna à última página válida quando uma atualização reduz o recorte.

As ações são verificadas por `financial_can` para a sessão atual. O conteúdo financeiro também aguarda autorização antes de exibir caches retidos. Edição, realização, reversão e cancelamento usam as RPCs/versionamento existentes; categorias têm formulário integrado de renomeação e chaves de retry estáveis. Nomes de 2026 são sugestões acionadas pelo usuário.

Nenhum backend, migration, política, transição, contrato de serviço, chave de cache ou invalidação existente foi alterado. O harness e seus dados identificados são exclusivos da validação local.

## Verificação executada

| Camada | Resultado | Evidência |
| --- | --- | --- |
| Tipos | `npm run typecheck` passou | TypeScript do projeto completo |
| Build | `npm run build` passou | Vite; avisos existentes de tamanho de chunks/Browserslist |
| Testes pertinentes | 108 testes, 14 arquivos, todos passaram | Despesas, capabilities, gráficos/adapters, formulários, rotas/edição, receitas e histórico 2026 |
| Lint dos TS/TSX novos/alterados de despesas | Passou sem avisos/erros | ESLint restrito ao escopo; lint global histórico não foi usado como gate |
| Banco com papel `authenticated` | 47/47 checks | [Relatório de banco](./authenticated-database-report.json) |
| HTTP/JWT real | 19/19 checks | [Relatório HTTP](./authenticated-http-report.json) |
| Concorrência | 7 corridas SQL com conexões/PIDs distintos; disputa HTTP entre JWTs de dois usuários | [Detalhes e limitações](./AUTHENTICATED_QA.md) |
| Interface autenticada | 42 checks finais passaram | [Relatório do navegador](./authenticated-browser-report.json) |

Os comandos npm foram executados com o Node bundled do desktop e o npm CLI disponível em `/tmp/financial-task-npm`, porque npm não estava no PATH do shell. Dependências já estavam instaladas; o lockfile foi preservado.

```sh
npm run typecheck
npm run build
npm test -- \
  src/test/financialExpenseComparison.test.tsx \
  src/test/financialExpenseDialogs.test.tsx \
  src/test/financialExpenseCapabilities.test.tsx \
  src/test/financialExpenses2028.test.ts \
  src/test/financialExpenseChartAdapters.test.ts \
  src/test/financialExpenseCharts.test.tsx \
  src/test/financialEditionSidebar.test.tsx \
  src/test/financialRevenueComparison.test.tsx \
  src/test/financialExpenseIntelligence.test.tsx \
  src/test/financial2028Presentation.test.tsx \
  src/test/financialOperational2028.test.ts \
  src/test/financialExpenseVisualizationSelectors.test.ts \
  src/test/financialFlagshipExperience.test.tsx \
  src/test/financialSelectors.test.ts
```

## Fluxos autenticados

| Fluxo | Efetivamente validado |
| --- | --- |
| Criar previsão, recarregar e consultar | Interface + banco/HTTP; registro `QA UI · Previsão comparativa` persistido no banco local |
| Editar e realizar preservando previsão | Interface: projetado R$ 1.450,00, realizado R$ 1.600,00, desvio R$ 150,00; datas consultadas após edição; versão/RPC no servidor |
| Realizada sem previsão | Interface: `QA UI · Realizada sem previsão`, R$ 500,00, projetado nulo e **Sem previsão**; também banco/HTTP |
| Pagamentos e saldo | Interface do leitor mostrou pago R$ 45.000,00 e saldo R$ 113.250,00 da mesma obrigação; gravação/estorno e limites financeiros validados por RPC em banco/HTTP |
| Cancelar e reverter | Interface com motivo e previsão preservada; histórico retido. Pagamentos impedem ações incompatíveis; regras verificadas em banco/HTTP e testes de componentes |
| Categorias | Interface criou, renomeou e arquivou categoria; catálogo exibiu arquivada vinculada. Banco verificou vínculos/auditoria; testes verificaram retry, versão, carregamento e sugestões opcionais |
| Filtrar, paginar e comparar | Busca por botão/limpeza, categoria, comissão, situação e período por vencimento. Paginação incrementou somente a RPC de listagem; indicadores e comparação ficaram estáveis |
| Abas/divisor | Mouse, setas/Home/End, Enter, duplo clique, botão, recarga imediata e rascunho preservado. Telemetria DOM do harness confirmou uma consulta inicial por fonte e nenhuma RPC durante ajuste do divisor |
| Perfis | Leitor consulta pagamentos sem mutações; editor cadastra previsão sem realizar; perfil sem financeiro não recebe indicadores. JWT adulterado foi rejeitado; permissões financeiras foram checadas no servidor |
| Histórico 2026 | Interface histórica e valores preservados; captura e testes históricos. Componentes/dados/CSS de 2026 não foram modificados |

O navegador encontrou e corrigiu duas falhas de apresentação: persistência ao recarregar imediatamente e transbordamento da barra mobile. O relatório registra a primeira falha e sua conferência após correção. Uma asserção do perfil editor também foi repetida após carregar as capabilities. Não restaram falhas finais nos checks registrados.

## Gráficos e capturas

A [matriz de compatibilidade](../../financeiro-2028/expense-chart-compatibility.md) explica cada componente histórico, adapter, escala, tooltip e ausência de fonte. Barras principais são visíveis; comparação pareada e composição percentual ficam no disclosure complementar, montado na primeira abertura e preservado depois.

- [Desktop comparativo](./captures/desktop-comparison.jpg), [divisão ampliada](./captures/desktop-resized.jpg), [análises](./captures/desktop-analyses.jpg), [lista compartilhada](./captures/desktop-shared-records.jpg).
- [Notebook com sidebar](./captures/notebook-comparison.jpg), [formulário](./captures/notebook-expense-form.jpg), [categorias](./captures/notebook-categories.jpg).
- [Mobile Projetado](./captures/mobile-projected.jpg), [Mobile Realizado](./captures/mobile-realized.jpg), [registros expansíveis](./captures/mobile-records.jpg), [pagamentos somente leitura](./captures/mobile-readonly-payment-detail.jpg), [sem acesso financeiro](./captures/mobile-no-financial-permission.jpg).
- [Histórico 2026](./captures/desktop-2026-history.jpg).

Sem transbordamento de página nas larguras 360, 768, 1024 e 1440 px; mobile também foi capturado em 390 × 844 px. Notebook com sidebar usou abas pela largura disponível do conteúdo.

## Limitações restantes

A autorização/JWT, RLS e RPCs foram validados no PostgreSQL/PostgREST local com migrações reais. O endpoint local de sessão substitui o login/refresh do Supabase Auth. Embora o usuário tenha autorizado testes em produção, nenhuma sessão remota estava disponível; o login e a versão do gateway Supabase remoto não foram verificados, e não houve gravação remota.

A concorrência SQL passou. O gateway local PostgREST 13.0.4 repetia indefinidamente o SQLSTATE `40001` das RPCs existentes; PostgREST 16.4 devolveu o conflito corretamente. A [evidência detalhada](./AUTHENTICATED_QA.md) registra a correção de runtime e as fontes oficiais. É necessário conferir a versão remota antes de considerar esse comportamento HTTP confirmado nesse ambiente. O backend permaneceu preservado.

A fonte atual não permite filtro exato de “saldo vencido” ou “sem previsão”. O atalho de vencidas aplica situação realizada e período por vencimento, com aviso de que pode incluir quitadas; sem previsão fica identificada em indicadores e registros. A fonte também não fornece distribuição operacional por origem dos recursos nem folhas completas para treemap; esses gráficos não são exibidos. Quantidade de despesas com previsão não foi inferida da contagem de situação prevista.
