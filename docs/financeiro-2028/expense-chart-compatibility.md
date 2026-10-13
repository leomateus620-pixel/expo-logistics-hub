# Gráficos de despesas: compatibilidade 2026 → 2028

A comparação operacional usa exclusivamente a resposta completa de `financial_expense_comparison`, filtrada no servidor. `financial_list_expenses` permanece responsável pela lista paginada; seus itens não alimentam indicadores, escalas ou composição. O livro e as gravações existentes não foram alterados.

## Matriz de compatibilidade

| Componente histórico | Contrato histórico | Compatibilidade com 2028 | Aplicação nesta etapa |
| --- | --- | --- | --- |
| `ExpenseDistributionBarChart` | `ExpenseGroupSummary`, valores 2025 + 2026 para planejamento, realizado em reais; escala calculada por gráfico | Inteligência visual compatível, contrato e escala independentes incompatíveis | `FinancialExpenseRanking` reutiliza a leitura por barras horizontais em cada painel. Adapter explícito de `ExpenseGroupComparison`; escala monetária comum por dimensão, total RPC como denominador, nomes arbitrários e categorias arquivadas vinculadas. |
| `ExpenseCategoryDonutChart` | `ExpenseGroupSummary`, soma histórica para planejamento e paleta de categorias fixas | Wrapper incompatível; primitive genérico compatível | Reutiliza `FinancialDistributionDonutChart` com `FinancialDistributionDatum` de 2028. A conversão de centavos para reais ocorre somente nessa fronteira de apresentação. Cada lado mantém seu próprio total. Composição só aparece quando todos os grupos têm valores e reconciliam com o total RPC daquele lado. |
| `ExpensePeriodComparisonChart` | 2025 × 2026, soma das duas séries como total/denominador, texto acessível histórico | Incompatível com comparação operacional | `ExpensePairedComparison` usa `planned_cents` × `committed_cents`, mesmo conjunto, ordem e escala. Ordenação pelo maior valor individual; não soma as séries. Desvio e percentual vêm do servidor, com linguagem operacional em valores exatos, ajuda e nomes acessíveis. |
| `ExpenseTreemapChart` | Todas as despesas históricas, hierarquia por categoria, valores históricos em reais | Fonte 2028 paginada insuficiente | Não exibido. Criar árvore a partir de 25 itens mudaria a leitura do total. O agregado por categoria não fornece todas as folhas necessárias. |
| `ExpenseFundingStackedBarChart` | Colunas independentes de recurso livre, prefeitura e Rouanet por despesa | Campos ausentes em `ExpenseComparison`/`FinancialExpense` operacional | Não exibido. Valores ausentes não são preenchidos com zero nem derivados de categoria/comissão. |
| `FinancialRevenueRanking` | Eixo assinado para receita/recebimento, em centavos | Estratégia de escala e valor exato compatível; semântica específica diferente | A nova primitive de ranking de despesas usa escala comum, valores tabulares e `Popover` acessível. O componente de receitas e o histórico permanecem intactos. |

## Contrato e interpretação

`adaptExpenseComparison(comparison, categories)` produz um `ExpenseChartModel` para categoria e comissão. `comparison` ausente produz `null`, nunca uma série artificial com zeros. Valores monetários ausentes, inválidos ou fora da faixa inteira segura ficam indisponíveis; zero fornecido pelo servidor continua visível como zero.

Os rankings ordenam cada lado por valor, mas usam o mesmo máximo monetário entre projetado e realizado para uma dimensão. Assim, valores iguais têm barras iguais. A análise pareada usa uma única ordem dos grupos, baseada no maior valor de cada grupo, para alinhar as duas séries.

Participação de ranking = valor do grupo / total RPC da respectiva série. Com total zero, o percentual fica indisponível. A composição reaproveitada valida a igualdade entre soma dos grupos completos e total RPC antes de calcular arcos; essa validação não substitui os totais financeiros por agregação local.

Categorias não são adaptadas à enumeração de 2026. O nome retornado pelo agregado é preservado. Quando a lista autorizada de categorias inclui uma categoria arquivada com vínculos, aparece o marcador textual **Arquivada**. Grupos sem categoria/comissão permanecem identificados pelo nome RPC e pela identidade nula.

Realizado representa compromisso; pago representa liquidação. Desvio positivo significa compromisso acima da previsão. Desvio negativo não recebe indicação de economia, porque pode incluir planejamento ainda não realizado. `comparison_state='sem_previsao'` mantém o rótulo **Sem previsão** e o percentual indisponível.

## Apresentação e desempenho

Projetado usa índigo; realizado usa verde-petróleo. A identidade também consta nas legendas e nos nomes acessíveis dos botões, sem depender exclusivamente de cor. Valores compactos abrem o valor monetário exato com teclado ou toque. Os nomes podem quebrar linha, e todos os grupos ficam no DOM e na lista, inclusive zeros verdadeiros e grupos arquivados.

Rankings por categoria e comissão permanecem na visão principal. As duas composições e a comparação pareada ficam em **Análises complementares**, um disclosure nativo operável por teclado. Os gráficos complementares montam apenas na primeira abertura e permanecem montados ao recolher, preservando os estados e evitando custo de gráficos invisíveis na carga inicial. A composição muda para uma coluna pela largura do container; a comparação conserva os pares de séries no mobile.

Os componentes não consultam dados, não paginam, não recalculam obrigações e não persistem dados financeiros. As barras principais e pareadas não animam durante mudanças de largura. O donut genérico mantém sua implementação existente; seus dados são memoizados e não dependem do divisor. Estilos novos ficam nas classes `f28-expense-*`; nenhum estilo/componente histórico de 2026 foi modificado.

## Verificação automatizada

- `financialExpenseChartAdapters.test.ts`: denominadores RPC, centavos, escala comum, ordem sem soma, ausência vs zero, categorias personalizadas/arquivadas/sem classificação e sem previsão.
- `financialExpenseCharts.test.tsx`: igualdade visual da escala, consulta exata por toque, alinhamento das séries, troca categoria/comissão e estados de consulta.

Os fixtures automatizados existem apenas nos testes; não há injeção de demonstrações na tela operacional nem gravação de despesas de exemplo.
