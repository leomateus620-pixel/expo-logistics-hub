## Contexto

O `Dashboard.tsx` ainda usa o `StatCard` antigo (já nem está importado — quebrado) e nenhum dos novos componentes premium criados na rodada anterior está orquestrado em tela. A tarefa é finalizar a integração e dar polimento de fluidez, sem mexer em lógica de negócio fora da Dashboard.

## O que falta fazer

### 1. Reescrever `src/pages/Dashboard.tsx` (única alteração de página)

Manter todas as seções já existentes (Acessos Rápidos, Próximos Transportes, Agenda 7 dias, Equipe Logística, Tarefas Pendentes) intactas. Trocar apenas o bloco superior e injetar três novas seções:

```text
[ Header — saudação + data ]
[ OperationalDynamicIsland ]                ← novo, abaixo do header
[ Grid 2x2 de Metric3DCard ]                ← substitui StatCard
[ Acessos Rápidos ]                         ← inalterado
[ OperationAlertsPanel ]                    ← novo
[ Charts grid (lazy) ]                      ← novo
[ Próximos Transportes ]                    ← inalterado
[ Agenda 7 dias ]                           ← inalterado
[ Equipe + Tarefas ]                        ← inalterado
[ PeriodReportCard ]                        ← novo, no rodapé
```

- Adicionar `useDashboardMetrics()` para alimentar Dynamic Island, charts, alertas e period card.
- Os 4 `Metric3DCard` (Veículos, Carrinhos, Transportes, Tarefas) usam `screens` rotativas (3 telas cada) baseadas em `metrics.*`, com `spark` derivado das séries diárias e `cta` levando à página relevante.
- Cada card abre um `ExpandedMetricSheet` (estado local `expanded: 'vehicles' | 'carts' | 'transports' | 'tasks' | null`) com detalhamento (top veículo, KM por dia, distribuição etc.).
- Charts agrupados em grid `sm:grid-cols-2 lg:grid-cols-3`, todos `<Suspense fallback={<Skeleton h-[260px]>}` para carregamento progressivo.
- Remover o bloco antigo `<StatCard …>` (4 ocorrências) e a lógica vinculada que ficou órfã (manter apenas o que ainda é usado: `nextTransportLabel`, `urgentTasksCount`, `pendingTransportsCount`).

### 2. Polimento de fluidez (sem nova arquitetura)

- Adicionar `animate-fade-in` escalonado nas seções principais via classe utilitária já existente.
- `Metric3DCard`: respeitar `motion-reduce` (já implementado) e garantir `will-change: transform` apenas no hover (otimizar re-renders).
- Charts: lazy + Suspense + `loading="lazy"` em qualquer imagem; nenhum chart bloqueia o first paint.
- Substituir spinners pesados por `Skeleton` consistente com o resto.
- Alterar o container raiz para `space-y-5 pb-8 animate-fade-in` mantendo o staggering por seção via `style={{ animationDelay: 'Xms' }}` em wrappers internos.
- Garantir `min-h` consistente nos cards 3D para evitar layout shift quando o rotator troca de tela.

### 3. Sem mudanças fora do Dashboard

Nenhum arquivo de hooks, lib, edge function ou outras páginas será tocado. Os componentes em `src/components/dashboard/*` já existem e ficam como estão (apenas serão consumidos).

## Detalhes técnicos

- **Estados locais novos no Dashboard:**
  - `const [expanded, setExpanded] = useState<null | 'vehicles' | 'carts' | 'transports' | 'tasks'>(null)`
  - `const metrics = useDashboardMetrics()`
- **Spark data:**
  - Veículos: `metrics.vehicles.kmSeries.map(s => s.km)`
  - Carrinhos: `metrics.carts.series.map(s => s.retiradas)`
  - Transportes: `metrics.transports.series.map(s => s.realizados + s.pendentes)`
  - Tarefas: usar `[metrics.tasks.percent]` repetido ou um array sintético do progresso (sem série temporal real).
- **Loading:** se `metrics.isLoading` (já exposto pelo hook) → manter `DashboardSkeleton` para os blocos 3D + charts.
- **Empty states:** charts já tratam internamente; alertas usam `OperationAlertsPanel` que já tem estado vazio.

## Critérios de aceite

- Dashboard renderiza sem erros (StatCard removido).
- 4 Metric3DCard funcionando com tilt, sparkline, rotator e expand sheet.
- Dynamic Island visível abaixo do header, com 9 categorias navegáveis.
- 5 charts carregam via Suspense sem bloquear o first paint.
- Painel de alertas mostra alertas reais (motorista ausente, retorno implausível, carrinho > 24h, etc.).
- PeriodReportCard renderiza no rodapé com link para `/reports`.
- Animações suaves (fade-in escalonado), respeitando `prefers-reduced-motion`.
- Mobile (393px) e desktop ambos refinados; nenhum overflow horizontal.
- Nenhum módulo existente quebrado (Acessos Rápidos, Agenda, Equipe, Tarefas idênticos).
