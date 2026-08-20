# Distribuição operacional — Eventos por Comissão e Assessoria

Substituir os dois blocos operacionais da Dashboard da Agenda FenaSoja por um único componente analítico: um donut interativo que mostra como os eventos estão distribuídos entre Comissões e Assessorias, com o responsável de cada área.

## O que sai

- "Progresso dos grandes eventos"
- "Eventos que exigem atenção"
- Estilos e helpers que ficarem órfãos após a remoção.

KPIs do topo, Volume de eventos, Horários com maior demanda, Atividade, Qualidade e Insights permanecem.

## O que entra

### Fonte de dados
Sem base paralela. O componente usa os mesmos eventos já carregados e filtrados da Agenda (respeitando RLS e escopo do usuário) cruzados com o registro oficial de Comissões/Assessorias e seus responsáveis, que já é carregado pelo sistema. Qualquer criação, edição, troca de comissão ou exclusão de evento atualiza o gráfico automaticamente pelo mesmo mecanismo de atualização já usado no módulo.

### Regra de contagem (definida com o usuário)
- Um evento conta em **todas** as comissões vinculadas a ele.
- Vínculos duplicados/legados do mesmo evento com a mesma comissão contam uma única vez.
- Percentual calculado sobre o total de vínculos do recorte; o centro do donut mostra o total de **eventos distintos** do período.
- Eventos cancelados e sem data válida ficam fora, como nos demais painéis.
- Eventos sem nenhuma comissão entram como "Sem comissão definida".

### Registro completo
Todas as Comissões e Assessorias oficiais ativas aparecem na legenda e no filtro, inclusive com zero eventos (marcadas como "sem eventos no período"), sem fatia no círculo.

### Donut interativo
- Fatias proporcionais, animação de entrada curta e transição ao mudar filtros.
- Hover (desktop) e tap (mobile) destacam a fatia; seleção persistente ao clicar.
- Tooltip enxuto: nome da área, responsável(is), nº de eventos, % do período.
- Centro: total de eventos do recorte + rótulo "eventos"; ao selecionar uma área, o centro passa a mostrar a contagem e o % dessa área.
- Selecionar uma fatia e confirmar abre a Linha do tempo filtrada por aquela comissão, usando o drill-down já existente.

### Legenda pesquisável (coluna direita)
- Lista compacta: marcador de cor, nome da área, responsável, contagem.
- Campo de busca, ordenação por volume (padrão) ou nome, scroll interno.
- Clique sincroniza com o destaque do donut.
- Copresidências: todos os responsáveis oficiais exibidos de forma organizada (nomes concatenados na linha, completos no tooltip).

### Ranking
"Maior participação no período" — até 3 áreas com maior volume, em formato compacto acima da legenda, clicável para destacar a fatia. Sem tabela.

### Filtros
Mesma linguagem visual dos filtros já usados na Dashboard:
- Período: mês atual, 3 meses, 6 meses, 1 ano, ciclo 2026–2028, personalizado.
- Ano: 2026 / 2027 / 2028.
- Situação: todos, planejados, concluídos, pendentes/atrasados.
- Comissão/Assessoria: seleção individual ou múltipla (recorte da análise).

Qualquer alteração recalcula simultaneamente donut, total, percentuais, ranking e legenda.

### Visual
Azul profundo, ouro e laranja como base, com paleta derivada determinística (mesma área sempre com a mesma cor) e contraste garantido, sem efeito arco-íris. Superfícies limpas, bordas precisas, sombras discretas, tipografia premium. Sem KPIs redundantes nem textos explicativos extras.

### Estados
Carregando (skeleton do donut), período sem eventos, comissão sem eventos, responsável ausente ("Responsável não definido"), erro de consulta com opção de recarregar. Nunca gráfico quebrado nem fatia artificial.

### Responsividade
- Desktop/notebook: donut à esquerda ocupando a largura recuperada, ranking + legenda à direita.
- Tablet: proporção intermediária.
- Mobile: título e total, filtros compactos em linha rolável, donut centralizado, ranking, legenda recolhível e pesquisável — sem overflow nem clipping.

## Detalhes técnicos

- Novo módulo `src/lib/cronograma-commission-distribution.ts`: normalização de vínculos (dedup por `commissionId`/slug), agregação por área, junção com o registro oficial, cálculo de percentuais, ranking e paleta determinística. Reaproveita helpers de status/data de `cronograma-dashboard-selectors.ts`.
- Hook `useCronogramaCommissionDistribution` memoizando o modelo sobre eventos filtrados + `useOrgCommissions()` (registro oficial com `commission_responsibles`).
- Componentes em `src/components/cronograma-eventos/dashboard/`: `CommissionDistributionPanel.tsx` (orquestra filtros, seleção e drill-down), `CommissionDonutChart.tsx`, `CommissionLegendList.tsx`, `CommissionTopAreas.tsx`.
- Recharts (`PieChart`/`Pie` com `innerRadius`) já usado no projeto; centro renderizado como overlay HTML para tipografia controlada.
- `CronogramaDashboardBoard.tsx`: remover `MajorEventProgress` e `AttentionEvents` e o wrapper `cronograma-dashboard-operations`; inserir o novo painel na área liberada.
- Estilos adicionados a `src/styles/cronograma-dashboard.css` com tokens semânticos; limpeza das regras `cronograma-major-*` e `cronograma-attention-*`.
- Drill-down pelo contrato `DashboardDrilldown` existente (`view: 'timeline'` + `filterPatch: { commission }`), sem novas rotas.
- Testes em `src/test/`: agregação (multi-vínculo, vínculo duplicado, comissão zerada, sem comissão, múltiplos responsáveis, combinação de filtros, soma dos percentuais) e ajuste do teste de integração da Dashboard que hoje referencia os blocos removidos.
- Validação com dados reais comparando contagens do gráfico com a Linha do tempo em desktop, notebook, tablet e mobile.

Sem alterações de backend, schema, RLS, permissões ou rotas.
