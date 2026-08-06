# Horários com maior demanda

Substituir o bloco "Agenda estratégica / Próximos marcos" do Dashboard de Cronograma e Eventos por um novo painel analítico que mostra em quais horários o calendário concentra mais eventos.

## O que o usuário verá

Um painel único, no mesmo padrão visual de "Volume de eventos":

```text
Horários com maior demanda                     [Semana | Mês | 6 meses | 1 ano | Personalizado]

Eventos por horário                            Horários de maior demanda
[gráfico de barras 07:30 → 20:00]              [ranking Top 5]

[até 3 insights operacionais]
38 de 202 eventos com horário definido
```

- Gráfico de barras com todos os intervalos de 30 minutos de 07:30 a 20:00, inclusive os vazios; azul institucional nas barras normais, ouro no pico, estado selecionado claro.
- Ranking Top 5 compacto: posição, horário, nº de eventos, % do período e o dia da semana (ou mês, em períodos longos) que mais contribui.
- Até 3 insights curtos gerados dos dados reais (pico do período, faixa que concentra a maioria, janela ociosa).
- Tooltip com intervalo, total, distribuição por status, principais comissões e dia da semana predominante.
- Clicar em uma barra ou em um item do ranking abre os eventos daquele horário na Timeline, preservando o período selecionado.
- Nota discreta de cobertura ("38 de 202 eventos com horário definido"), clicável para abrir os eventos sem horário.

## Regras de agregação (decididas)

- Referência: data + `start_time` normalizado do evento.
- Eventos cancelados e sem horário válido ficam fora da contagem do gráfico.
- Cada evento conta uma única vez, no intervalo de 30 min do seu início (08:20 → 08:00; 08:55 → 08:30).
- Horários fora da janela são agrupados nas pontas: antes de 07:30 conta em 07:30; depois de 20:00 conta em 20:00.
- Empate no ranking: vence o horário mais cedo.

## Filtros de período

Mesma linguagem visual dos filtros de "Volume de eventos": Semana, Mês (padrão), 6 meses, 1 ano, Período personalizado (data inicial, data final e filtros opcionais de comissão, categoria e status), com validação de intervalo invertido e resumo compacto do período ativo.

Insights adaptam-se ao período: Semana destaca dia da semana do pico; Mês destaca a semana/dia responsável pela concentração; 6 meses e 1 ano revelam padrões recorrentes e o mês que mais alimenta os picos.

## Responsividade

- Desktop: gráfico e ranking lado a lado, gráfico com a maior parte da largura.
- Tablet: gráfico em largura total, ranking abaixo, filtros com quebra intencional.
- Mobile: empilhamento vertical, rolagem horizontal controlada apenas dentro do gráfico (sem overflow da página), filtros com alvo de toque confortável, Top 5 em linhas compactas.

## Detalhes técnicos

- Novo módulo `src/lib/cronograma-time-demand.ts`: geração dos slots 07:30–20:00, normalização/binning do horário, agregação por slot (total, status, comissões, dias da semana, meses), Top 5, insights e resolução de presets de período. Fonte única de cálculo para gráfico, ranking e insights.
- Novo hook `src/hooks/useCronogramaTimeDemand.ts` com `useMemo` em cada etapa (filtro de período, slots, agregação, ranking, análise semanal/mensal, insights). Reage automaticamente aos eventos já carregados pelo módulo, então criação/edição/cancelamento/remoção atualizam o painel sem trabalho extra.
- Novos componentes em `src/components/cronograma-eventos/dashboard/`: `TimeDemandPanel.tsx` (filtros + layout), `TimeDemandChart.tsx` (Recharts, escala Y dinâmica, tooltip), `TimeDemandTopSlots.tsx`, `TimeDemandInsights.tsx`.
- `CronogramaDashboardBoard.tsx`: remover `UpcomingMilestones` e sua chamada; renderizar `TimeDemandPanel` no lugar, reutilizando o mesmo `onDrilldown` (`view: 'timeline'`, `eventIds`).
- CSS em `src/styles/cronograma-dashboard.css`: reaproveitar os tokens/superfícies de `cronograma-volume-*`; remover as regras órfãs de `cronograma-milestone*`.
- Testes: `src/test/cronogramaTimeDemand.test.ts` (binning nas bordas 07:30/20:00, 08:20/08:55, agrupamento nas pontas, sem horário, cancelados, empate no ranking, presets e período personalizado, insights) e `src/test/cronogramaTimeDemandPanel.test.tsx` (render, troca de período, drill-down por barra e por ranking, estado vazio), com Recharts mockado como no teste existente do Volume.

Observação sobre os dados atuais: 38 de 202 eventos têm `start_time` preenchido e 2 começam às 07:15 (agrupados em 07:30); nenhum evento passa das 20:00 hoje.
