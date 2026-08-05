# Volume de eventos — novo bloco analítico do Dashboard

Substituir os dois gráficos genéricos do Dashboard de "Cronograma e Eventos" ("Planejado × realizado" e "Desempenho por comissão") por um bloco analítico único, **Volume de eventos**, que mostra concentração de eventos por mês e por dia a partir dos dados reais já carregados.

## O que sai

- Painel "Evolução acumulada / Planejado × realizado".
- Painel "Responsabilidade primária / Desempenho por comissão".
- Seletores e estilos que ficarem órfãos após a remoção.

Os KPIs do topo, o card de Prontidão e os demais blocos permanecem intactos.

## O que entra

### Fonte de dados
Nenhuma consulta nova. O bloco consome os mesmos eventos normalizados (`CronogramaEvent`) já entregues ao Dashboard, respeitando os filtros globais ativos, RLS e permissões atuais.

### Regra de contagem
- Referência: data de início normalizada do evento (mesmas regras de fuso já usadas no módulo).
- Cada evento conta uma vez no seu mês e uma vez no seu dia de início.
- Excluídos: cancelados e eventos sem data válida.
- Incluídos: planejado, confirmado, em andamento, concluído, atrasado e reprogramado.
- Eventos de vários dias contam apenas na data de início nesta versão.

### Gráfico mensal — "Eventos por mês"
- Barras por mês, com filtros compactos: 3 meses, 6 meses, 1 ano e Período personalizado (padrão: 6 meses).
- Barra com hover, foco por teclado e clique.
- Tooltip: mês/ano, total, concluídos, ativos, atrasados, dia mais movimentado do mês e variação frente ao mês anterior.
- Clicar em um mês abre o detalhamento diário.

### Detalhamento diário — "Eventos por dia — [Mês/Ano]"
- Uma posição para cada dia real do mês (28/29/30/31), dias sem eventos aparecem com zero.
- Tooltip: data completa, número de eventos, distribuição por status, comissões predominantes e ação para abrir os eventos do dia.
- Clique abre a Linha do tempo filtrada naquela data, reutilizando o mecanismo de drill-down já existente no Dashboard.
- Botão claro de retorno à visão mensal, preservando período e filtros globais.

### Período personalizado
- Data inicial e final, com granularidade diária, semanal ou mensal.
- Sugestão automática de granularidade pelo tamanho do intervalo, com troca manual quando o resultado continuar legível.
- Intervalos inválidos bloqueados; em densidade excessiva, as datas são preservadas e o sistema recomenda outra granularidade.

### "Dias com maior concentração"
Três datas com maior número de eventos no período: posição, data completa, dia da semana, contagem, comissão/categoria predominante e ação para abrir o dia. Empate resolvido por maior contagem e, depois, data mais antiga. Apresentação integrada ao layout, sem pódio decorativo.

### Insights operacionais
Até três frases determinísticas calculadas dos próprios dados (concentração do mês dominante, dia de maior carga, variação frente ao mês anterior, número de comissões no dia mais cheio), cada uma abrindo o recorte correspondente quando aplicável. Sem uso de IA.

### Visual e responsividade
Superfícies claras, texto navy, acentos contidos em verde/azul/dourado, bordas e sombras sutis, topos de barra arredondados, eixos legíveis e estado selecionado evidente — coerente com o Dashboard atual. Sem 3D, gradientes pesados ou fundos decorativos.

- Desktop: gráfico mensal como área principal, Top 3 ao lado, diário abaixo.
- Tablet: layout intermediário próprio.
- Mobile: empilhado, com rolagem horizontal apenas dentro do gráfico de 31 dias e sem overflow de página.

### Estados, acessibilidade e desempenho
Carregando, atualização em segundo plano, sem eventos datados, sem eventos nos filtros, offline, erro de origem e mês selecionado vazio — nunca gráfico em branco, `NaN` ou eixo quebrado. Foco visível, controles de período acessíveis, resumo textual do gráfico para leitores de tela, informação não transmitida só por cor e respeito a movimento reduzido. Agregações memoizadas, sem recálculo em hover, fluido com mais de 1.000 eventos.

## Detalhes técnicos

- Novos utilitários em `src/lib/cronograma-event-volume.ts`: `isEligibleForEventVolume`, `getEventReferenceDate`, `groupEventsByMonth`, `groupEventsByDay`, `getBusiestDates`, `buildEventVolumeModel` (mês, dia, semana, Top 3 e insights), reaproveitando os helpers de data/status de `cronograma-dashboard-selectors.ts` e `dateUtils.ts`.
- Hook `useCronogramaEventVolume` memoizando o modelo sobre os eventos já filtrados.
- Componentes em `src/components/cronograma-eventos/dashboard/`: `EventVolumePanel.tsx` (orquestra período, granularidade e drill-down), `EventVolumeMonthlyChart.tsx`, `EventVolumeDailyChart.tsx`, `EventVolumeTopDays.tsx`, `EventVolumeInsights.tsx`.
- Gráficos em Recharts, biblioteca já adotada pelo Dashboard.
- Drill-down usando o contrato `DashboardDrilldown` existente (`view: 'timeline'` + `filterPatch`), sem novas rotas.
- Estilos adicionados ao CSS de dashboard do cronograma já existente, com tokens semânticos.
- Testes em `src/test/`: cobertura das utilidades (datasets vazios, cancelados/sem data, múltiplos eventos na mesma data, meses de 28/29/30/31 dias, períodos personalizados, viradas de ano, empate no Top 3) e um teste de componente para drill-down mensal → diário → retorno.
- Validação visual em desktop, notebook, tablet e mobile com os dados reais da Linha do tempo.

Sem alterações em rotas, autenticação, configuração de backend, RLS, permissões ou regras de negócio não relacionadas.
