
# Dashboard Premium — Fenasoja Logística

Evolução visual e funcional da Dashboard mantendo identidade verde/dourada e Liquid Glass, sem quebrar módulos existentes.

## 1. Camada de dados (nova)

**`src/hooks/useDashboardMetrics.ts`** — hook centralizador que agrega todas as métricas do período **2026-04-28 → 2026-05-10** a partir dos hooks já existentes (`useVehicles`, `useElectricCarts`, `useTransports`, `useTasks`, `useEvents`, `useFenasojaEvents`, `useOrgMembers`, `useSchedules`, `useVehicleUsage`, `useCartReservations`, `useMobilityAuthorizations`).

Retorna objeto memoizado com:
- `vehicles`: total, disponíveis, em uso, Botolli, kmTotal, kmMedio, topVeiculo, serieDiaria
- `carts`: total, emOperacao, disponiveis, retiradasPeriodo, horasUso, topCarrinho, serieDiaria
- `transports`: total, realizados, pendentes, emAndamento, agendadosHoje, kmTotal, aeroportos[], cidades[], topDestino, alertasRetorno[], serieDiaria
- `tasks`: pendentes, concluidas, criticas, porCategoria, percentual
- `team`: totalLogistica, voluntarios, escaladosHoje
- `events`: cobertosPeriodo, proximosEventos
- `mobility`: solicitacoes, carrinhosVinc, patinetesVinc, pendentes
- `alerts[]`: lista normalizada `{ id, severity, message, ctaRoute, entity }`
- `loading`, `error`, `isEmpty`

Todas as agregações ficam aqui (single source of truth) — componentes só consomem.

## 2. Componentes novos

```
src/components/dashboard/
  OperationalDynamicIsland.tsx     # cápsula expansível, 9 categorias, swipe horizontal
  DynamicIslandCategory.tsx        # renderiza 2-4 métricas de uma categoria
  Metric3DCard.tsx                 # card principal com glass 3D, micro-tilt, expansão
  MetricCardRotator.tsx            # rolagem interna automática (4-6s) + swipe + dots
  ExpandedMetricSheet.tsx          # bottom-sheet (mobile) / Sheet lateral (desktop) com detalhes
  charts/
    TransportsByDayChart.tsx       # Recharts BarChart - realizados/pendentes/agendados
    KmRodadosChart.tsx             # LineChart - KM por dia + por veículo
    CartUsageChart.tsx             # AreaChart amarelo/dourado - horas e retiradas
    TasksProgressChart.tsx         # RadialBar - % conclusão + críticas
    OperationDistributionChart.tsx # Donut - distribuição transportes/mobilidade/eventos…
  OperationAlertsPanel.tsx         # lista premium de alertas com severity e CTA
  PeriodReportCard.tsx             # "Resumo 28/04 a 10/05" + CTA "Gerar relatório"
  DashboardSkeleton.tsx
  DashboardEmptyState.tsx
  DashboardErrorState.tsx
```

Todos os charts são `lazy()` + `Suspense` para não pesar no first paint.

## 3. Cards 3D rotativos (substituem os 4 cards atuais)

Cada `Metric3DCard` tem:
- número grande, ícone glass, badge status, micrográfico (sparkline inline)
- `MetricCardRotator` interno cicla 3-5 telinhas a cada 5s (pausa em toque/hover); dots indicadores; swipe nativo
- altura fixa para não pular layout
- tilt sutil no desktop (mousemove → rotateX/Y ≤6°), scale 0.97 no toque mobile
- toque/click → `ExpandedMetricSheet` (Drawer no mobile, Sheet no desktop) com gráficos e CTAs do módulo

Conteúdo das telinhas conforme spec do usuário (Veículos / Carrinhos / Transportes / Tarefas).

## 4. Dynamic Island operacional

Componente cápsula **abaixo da saudação**:
- Estado compacto: pílula glass com resumo (`Operação ativa · X tarefas · Y veículos · Z carrinhos`)
- Click/tap → expande (Framer Motion `layout` + spring `{ stiffness: 260, damping: 28 }`) para painel com tabs horizontais scrolláveis: Hoje, Transportes, Carrinhos, Veículos, Equipe, Eventos, KM & Emissões, Mobilidade, Alertas
- Swipe horizontal entre categorias com indicador
- Cada categoria mostra 2-4 mini-métricas + CTA para módulo
- Desktop ≥ md: já abre como barra horizontal lado-a-lado
- Respeita `prefers-reduced-motion` (anima só fade)

## 5. Layout final da Dashboard

```text
[Saudação + data]
[OperationalDynamicIsland]
[CTA primário largo: Criar Transporte]   (mobile)
[Grid 2x2 (mobile) / 4 col (desktop) — Metric3DCard x4]
[Grid de gráficos: 1 col mobile / 2 col desktop]
  - TransportsByDayChart
  - KmRodadosChart
  - CartUsageChart
  - TasksProgressChart
  - OperationDistributionChart
[OperationAlertsPanel]
[PeriodReportCard "Resumo 28/04 → 10/05"]
[Acessos rápidos atuais (Hotéis PDF, Autorizações Sheet) — preservados]
```

Sidebar atual e `Layout.tsx` permanecem intactos. Sem alteração de rotas, permissões ou módulos internos.

## 6. Estados

- **Loading**: `DashboardSkeleton` com shapes de cada bloco (não spinners genéricos)
- **Vazio**: `DashboardEmptyState` por bloco com CTA contextual ("Cadastrar primeiro transporte")
- **Erro**: `DashboardErrorState` com mensagem + retry
- Cada chart trata seu próprio empty individualmente

## 7. Acessibilidade & performance

- aria-labels em CTAs e gráficos, navegação por teclado, contraste AA
- `prefers-reduced-motion`: desativa tilt, rotação automática, springs longos
- `useMemo` em todas agregações pesadas; charts atrás de `lazy()`
- `Recharts` já é dep usada; sem novas libs além de `framer-motion` (verificar se já presente — provavelmente sim)

## 8. Detalhes técnicos

- Período fixo no hook: `PERIOD_START = '2026-04-28'`, `PERIOD_END = '2026-05-10'` (UTC-3, helpers de `lib/utils.ts`)
- Alertas detectados:
  - transporte sem motorista/veículo/retorno
  - retorno implausível (já existe `isReturnTimePlausible`)
  - carrinho retirado > 24h sem devolução
  - tarefa crítica vencida
  - evento sem cobertura logística
- Identidade visual: tokens existentes (`--primary` verde, `--gold`, `liquid-glass-card`, `gold-accent`)
- Sem mock — se módulo retorna vazio, renderiza empty state

## 9. Arquivos modificados

- `src/pages/Dashboard.tsx` — reescrito para orquestrar novos componentes (preserva acessos rápidos)
- `src/hooks/useDashboardMetrics.ts` — novo
- ~14 novos componentes em `src/components/dashboard/`

## 10. Validação

Após build: testar viewport mobile (393px), tablet, desktop; com sidebar aberta/fechada; expandir cards e Dynamic Island; estados loading/vazio; `prefers-reduced-motion`. Sem mudanças em DB, RLS ou edge functions.
