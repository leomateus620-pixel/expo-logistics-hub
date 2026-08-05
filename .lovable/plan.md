# Volume de eventos — janela de período correta e refino analítico

Corrigir a janela de período que hoje omite julho e elevar os gráficos mensal e diário do bloco "Volume de eventos" do Dashboard de Cronograma e Eventos. Sem novas consultas, sem mudanças de rota, backend, permissões ou fluxos de evento.

## 1. Causa da ausência de julho (confirmada)

`resolvePresetRange` em `src/lib/cronograma-event-volume.ts` monta a janela como **mês atual + N-1 meses seguintes** (`start = 1º dia do mês atual`). Com agosto/2026 como mês corrente, "6 meses" gera Ago/26 → Jan/27. Julho nunca entra porque nenhum mês anterior é considerado — não é filtro de dados nem problema de fuso.

## 2. Nova regra de janela (documentada no código)

Referência: mês corrente normalizado no fuso já usado pelo módulo.

- 3 meses: mês anterior, mês atual e próximo mês.
- 6 meses: mês anterior, mês atual e os quatro meses seguintes.
- 1 ano: janeiro a dezembro do ano corrente.
- Período personalizado: datas exatas escolhidas pelo usuário.

Todos os meses da janela aparecem, inclusive com zero eventos. Limites de mês, viradas de ano e eventos no primeiro/último dia validados por testes.

## 3. Contagem de eventos

Mantida a fonte real já filtrada pelo Dashboard (comissão, categoria, responsável, status, prioridade, oficiais, período). Cada evento elegível conta uma vez pela data de início normalizada; cancelados e sem data ficam fora. O total exibido acima do gráfico passa a ser calculado da soma das barras visíveis, garantindo igualdade exata.

## 4. Gráfico mensal

- Proporções e altura maiores, largura de barra consistente, espaçamento uniforme, cantos superiores arredondados discretos.
- Eixo Y com domínio calculado dinamicamente a partir do máximo (sem área vazia excessiva e sem cortar a maior barra); eixo X em ordem cronológica com tipografia mais legível.
- Azul institucional para os meses; dourado controlado apenas no mês selecionado; hover sutil e foco de teclado visível.
- Tooltip enxuto: mês/ano, total, concluídos, ativos, atrasados, dia mais cheio e variação frente ao mês anterior visível.
- A faixa de "pills" mensais abaixo do gráfico é removida (informação já presente no eixo e no tooltip); permanece apenas o total do período no cabeçalho.

## 5. Filtros de período

Grupo de filtros integrado ao cabeçalho do painel: estado selecionado de alto contraste sem peso visual, hover/foco visíveis, dimensões estáveis, transição suave, alvos confortáveis no toque e rolagem horizontal contida apenas dentro do grupo no mobile.

"Período personalizado" mantém data inicial, data final, granularidade (diária/semanal/mensal), resumo curto do intervalo ativo e bloqueio de intervalos inválidos.

## 6. Interação mensal

Clique na barra: seleciona o mês, destaca visualmente, abre o gráfico diário do mês, preserva os filtros globais e mantém a posição de rolagem estável.

## 7. Gráfico diário

- Uma posição para cada dia real do mês (28/29/30/31); dias sem eventos ficam visíveis com zero em tom neutro.
- Altura maior, espaçamento adequado, alinhamento dos números do dia, escala Y própria e ênfase clara no dia selecionado.
- Desktop: mês inteiro visível, com frequência reduzida de rótulos quando necessário. Mobile: largura mínima interna com rolagem apenas dentro do gráfico, sem overflow de página.
- Lista de pills diárias abaixo do gráfico substituída por um resumo compacto do dia selecionado, com a ação de abrir os eventos daquela data.
- Tooltip diário: data completa, total, distribuição por status, comissões principais e a dica "Selecione para abrir os eventos desta data."
- Ação "Voltar à visão mensal" compacta e evidente, preservando período, mês e filtros.

## 8. Top 3 e insights

"Dias com maior concentração": hierarquia mais leve — posição, data completa, dia da semana, contagem, comissão predominante quando útil e ação de drill-down; sem bordas repetidas nem áreas vazias.

Insights: no máximo três frases determinísticas, sem repetição (mês de maior concentração, data de maior carga, variação relevante frente ao período anterior).

## 9. Direção visual e responsividade

Superfícies limpas, sem cards dentro de cards, sem bordas repetidas, sem gradientes fortes ou elementos decorativos. Validação visual em 1920×1080, 1680×1050, 1536×864, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 375×812 e 360×800.

## Detalhes técnicos

- `src/lib/cronograma-event-volume.ts`: reescrever `resolvePresetRange` para a nova regra (offset de -1 mês nos presets, ano-calendário completo em `12m`), manter `isValidRange`/`suggestGranularity`, e derivar `totalEvents` da soma dos buckets visíveis.
- `EventVolumePanel.tsx`: cabeçalho com filtros integrados, domínio dinâmico do eixo Y, estado selecionado do mês, remoção das pills mensais, resumo do dia selecionado.
- `EventVolumeDailyChart.tsx`: nova densidade/altura, células neutras para dias vazios, substituição da lista de pills, tooltip revisado.
- `EventVolumeTopDays.tsx` e `EventVolumeInsights.tsx`: ajuste de hierarquia e remoção de redundâncias.
- `src/styles/cronograma-dashboard.css`: estilos do painel, filtros, tooltips, estados de foco/seleção e comportamento mobile, usando tokens semânticos.
- Recharts continua sendo a única biblioteca de gráficos; todas as agregações permanecem memoizadas em `useCronogramaEventVolume`.
- Testes: atualizar `src/test/cronogramaEventVolume.test.ts` (nova regra de janela, inclusão de julho, meses zerados, virada de ano, primeiro/último dia do mês, total = soma das barras) e `src/test/cronogramaEventVolumePanel.test.tsx` (troca de preset, drill-down mensal → diário → retorno, ausência das pills removidas).

Ao final, reporto: causa da ausência de julho, regra corrigida, refinos mensal e diário, melhorias de filtros/navegação, redundâncias removidas, validação responsiva e confirmação de que todos os totais vêm dos eventos reais.
