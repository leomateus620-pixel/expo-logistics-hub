# Remover indicador "Prontidão Fenasoja 2028" do Dashboard

Retirar o card de readiness do Dashboard de "Cronograma e Eventos", conforme solicitado. O restante do Dashboard (KPIs, Volume de eventos, marcos, atenção, atividade, qualidade e insights) permanece inalterado.

## O que sai

- Componente `ReadinessHero` em `src/components/cronograma-eventos/dashboard/CronogramaDashboardBoard.tsx`.
- Chamada `<ReadinessHero model={model} />` no corpo do Dashboard.
- Imports órfãos decorrentes da remoção (`Target`, `ShieldAlert` e `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`, se não forem usados em outro ponto do mesmo arquivo).
- Regras CSS de `.cronograma-readiness*` em `src/styles/cronograma-dashboard.css`, que ficarão sem uso.

## O que permanece

- O campo `readiness` em `CronogramaDashboardModel` e a função `calculateReadinessIndex` em `src/lib/cronograma-dashboard-selectors.ts` continuam existindo por compatibilidade; apenas não serão renderizados nesta tela.
- Todos os demais blocos do Dashboard (KPIs, Volume de eventos, marcos, progresso de grandes eventos, eventos que exigem atenção, alterações/reprogramações, qualidade dos dados e insights) permanecem intactos.

## Ajustes em testes

- Atualizar `src/test/cronogramaDashboardIntegration.test.tsx` para remover as asserções que esperam o título "Prontidão Fenasoja 2028" e o botão "Auditar cálculo".
- Manter as asserções de drill-down dos KPIs, do Volume de eventos e dos grandes eventos.

## Validação

- Build/TypeScript sem erros.
- Testes da suite `cronogramaDashboardIntegration` passando.
- Visual: o Dashboard passa a iniciar diretamente com a faixa de KPIs executivos, sem o card de prontidão no topo.
