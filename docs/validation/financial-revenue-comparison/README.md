# Receitas FENASOJA 2028 — comparação entre projeção e recebimento

## Diagnóstico e fronteira financeira

Base anterior: `3b9555d1fc78a13de64552effbd9835354e006ca`. `FinancialManagementPage` resolve a edição; `CommissionLayout` e `CommissionSidebar` apresentam navegação e menu móvel. As entradas `receitas-projetadas` e `receitas-confirmadas` usavam a mesma consulta de receitas manuais, com filtros distintos, e o mesmo `RevenueDialog`. A Dashboard Comercial serviu como referência de números tabulares, leitura de indicadores e acabamento, sem trazer seus dados para a soma financeira.

`confirmed_cents` é compromisso confirmado; o recebido vem de `revenues.received_cents` no resumo canônico ou de `obligations.received_cents` na compatibilidade já utilizada pelo painel. O total projetado também vem do resumo da edição. As listas retornam até 500 receitas manuais; não substituem esses totais.

O contrato operacional fornece `funding_type` para a origem do recurso. Ele não oferece categoria comercial, detalhamento de comercialização, recebimento por registro ou recebimento por origem. Portanto:

- Total projetado e Total realizado usam os agregados canônicos existentes. Realizado identifica discretamente recebimentos líquidos registrados.
- Comercialização projetada/realizada e Rouanet realizado aparecem como **Não disponível**. Nenhum valor é inferido de título, status, vendas de lotes ou patrocínio.
- Rouanet projetado mostra a origem `lei_rouanet` das receitas manuais não canceladas do **Recorte carregado**. Valores de origem `misto` não são repartidos.
- O ranking projetado usa as origens oficiais existentes, com essa classificação explícita. Não recebe os nomes de categorias do anexo sem uma fonte correspondente.
- O ranking realizado informa a ausência de detalhamento. A listagem de compromissos confirmados preserva sua natureza, situação, filtros e ações; ela não é apresentada como recebimento.
- A ação “Registrar receita” abre o cadastro existente e informa que não registra recebimento. Não foi criada uma operação de caixa.

Os cards são recortes de escopos diferentes, identificados no texto de apoio, e não devem ser somados. Não houve mudança em rotas, Supabase, banco, permissões, cálculos ou contratos de integração.

## Apresentação e interação

A edição agora está em dois cards compactos da sidebar e no mesmo menu móvel. A URL, a preferência já usada pela aplicação e o refresh conservam a edição ativa. O menu de 2028 tem um item Receitas, enquanto ambas as entradas anteriores renderizam a comparação. A entrada confirmada abre Realizado no modo compacto e mantém sua identificação de compromissos.

Os painéis começam em 50/50 e usam o componente de painéis existente, com limites de 35–65%, mouse, toque e teclado. Enter, duplo clique e Restaurar divisão retornam ao equilíbrio; a preferência fica somente em `localStorage`. O arraste mantém agregações memorizadas, filtros, formulários e consultas. Em conteúdo abaixo de 840 px, os dois painéis continuam montados e um seletor Projetado/Realizado controla a apresentação, considerando a largura restante após a sidebar.

O histórico 2026 mantém sua composição, dados e ações somente de leitura. A única mudança compartilhada é a localização do seletor.

## Evidências comparáveis

Dados exclusivamente sintéticos, com página, layout, sidebar e formulários reais. Não houve gravação financeira real nem homologação de permissões remotas. Os scripts bloqueiam acesso externo aos serviços financeiros. Desktop: 1366 × 768. Mobile: 390 × 844. Notebook adicional: 1024 × 768.

| Entrada | Desktop antes / depois | Mobile antes / depois |
| --- | --- | --- |
| Projetadas 2028 | [Antes](before/desktop-2028-receitas-projetadas.png) / [Depois](after/desktop-2028-receitas-projetadas.png) | [Antes](before/mobile-2028-receitas-projetadas.png) / [Depois](after/mobile-2028-receitas-projetadas.png) |
| Confirmadas 2028 | [Antes](before/desktop-2028-receitas-confirmadas.png) / [Depois](after/desktop-2028-receitas-confirmadas.png) | [Antes](before/mobile-2028-receitas-confirmadas.png) / [Depois](after/mobile-2028-receitas-confirmadas.png) |
| Projetadas 2026 | [Antes](before/desktop-2026-receitas-projetadas.png) / [Depois](after/desktop-2026-receitas-projetadas.png) | [Antes](before/mobile-2026-receitas-projetadas.png) / [Depois](after/mobile-2026-receitas-projetadas.png) |
| Confirmadas 2026 | [Antes](before/desktop-2026-receitas-confirmadas.png) / [Depois](after/desktop-2026-receitas-confirmadas.png) | [Antes](before/mobile-2026-receitas-confirmadas.png) / [Depois](after/mobile-2026-receitas-confirmadas.png) |

Detalhes: [ranking](after/desktop-ranking-comparison.png), [divisor ajustado](after/desktop-resized-comparison.png), [conteúdo estreito com sidebar](after/notebook-2028-comparison.png), [menu móvel e edições](after/mobile-sidebar-editions.png), [formulário desktop](after/desktop-revenue-form.png), [formulário móvel](after/mobile-revenue-form.png) e [falha recuperável](after/desktop-revenue-error.png).

Os valores sintéticos antes/depois preservam a projeção manual carregada de R$ 1.284.567,90, o Rouanet desse recorte de R$ 50.000,01 e a confirmação manual de R$ 45.000,01 nos registros. Antes, o destaque de projeção era o recorte manual; agora, Total projetado apresenta o resumo integral já existente no Painel Financeiro: R$ 5.000.000,00. O ranking permanece sobre os mesmos R$ 1.284.567,90 carregados. A mudança é de escopo identificado do destaque, sem alterar cálculo ou regra. Confirmado integral R$ 4.000.000,00 e recebido R$ 3.000.000,00 continuam distintos; as listas não são novamente somadas ao total.

No navegador, todas as verificações registradas passaram: alternância/refresh/teclado nas nove telas, divisor por mouse e toque, limites, reset, armazenamento local, consultas sem refetch no arraste, filtros independentes no mobile, formulário, falha recuperável, estados financeiros e ausência de rolagem horizontal. As duas matrizes de oito capturas também ficaram sem erro JavaScript, acesso financeiro externo ou overflow.

A comparação do conteúdo histórico exclui igualmente a sidebar e a faixa fixa compartilhada do mobile. Os quatro pares têm os mesmos textos, títulos, ações e dimensões. Três pares são idênticos pixel a pixel; o quarto varia em 46 pixels (0,0172%), com diferença máxima de 1/255 por canal, compatível com rasterização. Nenhuma composição ou valor de 2026 mudou.

## Arquivos modificados

- `CommissionSidebar.tsx`: cards de edição, identificação móvel e um item Receitas para 2028.
- `FinancialManagementPage.tsx`, `FinancialEditionSwitch.tsx` e `useFinancialEditionSelection.ts`: seleção compartilhada pela URL e retirada do bloco do conteúdo.
- `Financial2028Workspace.tsx`: cabeçalho compacto e composição comum das duas entradas existentes.
- `Financial2028RevenueComparison.tsx`, `FinancialRevenueRanking.tsx` e `Financial2028Ledgers.tsx`: indicadores, divisor, ranking e lista operacional compartilhada.
- `resizable.tsx`: referência imperativa ao componente existente de painéis, necessária para restaurar a divisão.
- `financial-revenue-comparison.css` e `financial-sidebar.css`: acabamento, proporção e apresentação por largura disponível.
- `financialRevenueComparison.test.tsx`, `financial2028Presentation.test.tsx` e `financialEditionSidebar.test.tsx`: integridade, regressão de formulário e seleção/navegação.
- Harness, scripts e documentos nesta entrega: somente fixtures, capturas e verificação local.

## Verificação reproduzível

Os scripts existentes compilam/servem a apresentação com fixtures locais. `FINANCIAL_QA_SOURCE` permite apontar para a fonte congelada da revisão anterior; os dois builds usam as mesmas fixtures.

```sh
npx vite build --config scripts/financial-2028/preview.vite.config.ts
node scripts/financial-2028/preview-server.cjs dist-qa/financial-2028 5197
node scripts/financial-2028/revenue-comparison-qa.cjs http://127.0.0.1:5197
node scripts/financial-2028/revenue-history-compare.cjs http://127.0.0.1:5196 http://127.0.0.1:5197
npm test -- src/test/financialRevenueComparison.test.tsx src/test/financial2028Presentation.test.tsx
```

`PLAYWRIGHT_MODULE` e `QA_PNG_MODULE` podem apontar para as dependências do runtime de QA, sem acrescentá-las ao aplicativo. Os detalhes do ambiente, build, typecheck, lint e suíte completa estão em [validation.md](validation.md). As verificações de navegador ficam em [interaction-results.json](after/interaction-results.json), as matrizes em [antes](before/results.json) e [depois](after/results.json), e a preservação do conteúdo histórico em [historical-content-comparison.json](historical-content-comparison.json).

O teste novo cobre consolidação versus compromisso, compatibilidade do resumo, ausência de dupla contagem, escopo das origens, canceladas, proporções do ranking, barras negativas e zero, valor exato acessível, filtros independentes, ausência de dados, carregamento, falha, zero verdadeiro e limite da lista. Os testes existentes de formulários foram adaptados à composição compartilhada preservando verificações de payload, centavos, versão, chave de tentativa, erro e bloqueio durante envio.

Toque foi exercitado por eventos confiáveis do Chromium via CDP; viewport e menus móveis são emulados. Isso não certifica aparelhos físicos ou o calendário nativo do sistema. A entrega não adiciona fonte de dados inexistente para os recortes financeiros indisponíveis.
