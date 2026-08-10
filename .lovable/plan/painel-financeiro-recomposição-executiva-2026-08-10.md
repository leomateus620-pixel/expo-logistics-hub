# Painel Financeiro — recomposição executiva

Reconstrução da visão `dashboard` do módulo Financeiro Gerencial como centro executivo único, equilibrando Receitas, Despesas, Orçamento e Execução. Toda a lógica financeira já validada é reutilizada — nenhum cálculo novo é criado, nenhuma semântica é alterada.

## Base de dados reutilizada (verificada)

O painel continua consumindo exatamente as mesmas fontes dos menus especializados:

- Despesas previstas: `selectExpenseLedgerTotal(expenses, 'planning')` — soma `value2025 + value2026`, idêntico ao menu Despesas Previstas.
- Despesas realizadas: `selectExpenseLedgerTotal(expenses, 'realized')` — coluna realizado, idêntico ao menu Despesas Realizadas.
- Agrupamentos: `groupExpensesByCommission`, `groupExpensesByCategory`, `groupExpensesByFundingSource`.
- Receitas: `selectRevenueTotals`, `groupRevenuesByCategory`.
- Orçamento: `selectCommissionBudgets`, `selectOverBudgetCommissions`, `financialWorkbookTotals`.

Distinções preservadas: Lacuna de consolidação ≠ A Receber; Orçado ≠ Realizado; a diferença de R$ 2.600,00 entre períodos e realizado permanece exposta na nota de conciliação.

## Header

- Remover `FinancialRestrictedBadge`, o chip "Planejamento 2026" e o bloco `FinancialDataProvenance` ("Base Orçamentária Fenasoja 2026 · Planilha oficial · somente leitura") apenas na visão dashboard — as demais visões seguem inalteradas.
- Header azul mantido como identidade, porém mais baixo e compacto: eyebrow curto "COMANDO EXECUTIVO" + título "Painel Financeiro". Sem frase descritiva.
- A procedência da fonte continua acessível no bloco recolhível "Fonte e metodologia" já existente no rodapé.

## Nova composição da página

```text
1. FAIXA EXECUTIVA (KPIs)
   Receitas: Projetada · Consolidada · A Receber · Lacuna     (cards principais compactos)
   Despesas: Previstas · Realizadas                            (par comparativo destacado)
   Orçamento: Orçado/Teto · Saldo                              (métricas secundárias densas)
2. EXECUÇÃO DE DESPESAS  → dois gráficos lado a lado (previstas × realizadas)
3. PRESSÃO ORÇAMENTÁRIA  → refinada, logo abaixo das despesas
4. RECEITAS              → ecossistema + composição projetada
5. RANKING + ORIGENS     → 10 maiores orçamentos (compacto) + origens redesenhadas
6. Conciliação da fonte + Fonte e metodologia
```

## Bloco de despesas (novo, protagonista)

Dois painéis lado a lado no desktop, empilhados no mobile:

- Esquerda — Despesas Previstas: barras horizontais por comissão (ou categoria, alternável), cobrindo 100% da base agregada, com barra de participação e acesso ao detalhe por grupo.
- Direita — Despesas Realizadas: mesma escala máxima da esquerda, tratamento visual sólido (execução) contra tratamento planejado à esquerda, com faixa interna de origem do recurso quando houver.
- Alternância de agrupamento (Comissão / Categoria) compartilhada pelos dois gráficos.
- Hover/seleção de um grupo destaca automaticamente sua contraparte no outro gráfico; itens não selecionados reduzem opacidade.
- Tira comparativa acima dos gráficos: Previsto, Realizado, % de execução e diferença — todos derivados dos selectors existentes.
- Empty state próprio para grupos sem valor realizado (não inventar zero como execução).

## Tooltip financeiro

Tooltip próprio (sem o padrão do Recharts) exibindo, quando matematicamente válido: grupo, Previsto, Realizado, Execução %, Diferença e Participação no total. Números tabulares alinhados à direita, fundo navy sólido, entrada suave, contido na viewport no mobile.

## Componentes existentes reorganizados

- Pressão orçamentária: mantida, com tipografia mais densa e alertas de teto tratados como avisos executivos (não cards de erro).
- 10 maiores orçamentos: mantido como ranking explicitamente rotulado, mais compacto, sem competir com a nova análise integral.
- Valores por origem registrada: redesenhado como distribuição empilhada compacta + linhas de leitura, eliminando o grande vazio atual.
- Receita por ecossistema e Composição projetada: mantidos, com altura reduzida e alinhados à nova grade.

## Tipografia, cor e movimento

- `font-variant-numeric: tabular-nums` em todos os valores; valores abreviados na leitura executiva com valor exato em `title`/tooltip.
- Semântica de cor: projetado azul profundo, consolidado teal, a receber âmbar, previsto tom quente controlado, realizado tom sólido, excesso vermelho apenas em estouro, neutro navy.
- Motion isolado ao painel: entrada sequenciada dos KPIs, crescimento das barras a partir da base, transição de tamanho ao trocar agrupamento, destaque cruzado. Somente `transform`/`opacity`. O escopo `data-financial-motion="full"` já existente é usado para dispensar a redução global de movimento apenas nesta tela.

## Detalhes técnicos

- Arquivos principais: `src/pages/commissions/FinancialManagementPage.tsx` (apenas `renderDashboard` e o header), novos componentes de gráfico em `src/features/financial-management/components/FinancialCharts.tsx`, estilos em `src/styles/financial-management.css`.
- Novos selectors, se necessários, apenas como composição dos existentes (ex.: par previsto×realizado por grupo) em `financialSelectors.ts`, sem redefinir regra financeira.
- Todas as agregações memoizadas uma única vez e compartilhadas entre KPIs e gráficos; nada calculado dentro do JSX.
- Testes existentes (`financialFlagshipExperience.test.tsx`, `financialSelectors.test.ts`, `financialExpenseVisualizationSelectors.test.ts`) atualizados quando a asserção referenciar textos removidos do header.
- Validação visual via navegador em 1440/1600/1920 e 390/430, com uma rodada adicional de refinamento após a primeira renderização.
