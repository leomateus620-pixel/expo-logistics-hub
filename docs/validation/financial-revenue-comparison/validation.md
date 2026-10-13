# Validação da comparação de receitas de 2028

Verificação de 12 de outubro de 2026, com Node 24.19.0 e as dependências instaladas deste checkout. A base de comparação é o commit `3b9555d1fc78a13de64552effbd9835354e006ca`, extraído integralmente para um diretório temporário e executado com os mesmos `node_modules` e a mesma configuração de testes.

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado, código de saída 0. |
| Build de produção do frontend, com a configuração vigente | Aprovado, código de saída 0; 10,02 s na execução final, após a memorização da listagem. |
| Testes pertinentes ao Financeiro e à sidebar compartilhada | 5 arquivos, 37 testes aprovados; 3,54 s. |
| Testes finais do Financeiro incluindo seletores existentes | 5 arquivos, 59 testes aprovados; 3,75 s. |
| Suíte completa no commit anterior | 391 arquivos: 343 aprovados e 48 com falhas. 3.148 testes: 3.062 aprovados e 86 com falhas. |
| Suíte completa após a implementação | 393 arquivos: 345 aprovados e 48 com falhas. 3.160 testes: 3.074 aprovados e 86 com falhas. |
| Comparação das falhas por arquivo e nome completo do teste | As mesmas 86 falhas anteriores; nenhuma falha introduzida. |
| `git diff --check` | Aprovado. |
| ESLint dos arquivos TypeScript/TSX alterados | Aprovado, código de saída 0. |
| Arquivos de Supabase e backend | Nenhuma modificação encontrada no Git. |

A comparação completa dos nomes de testes está em [`test-suite-comparison.json`](test-suite-comparison.json). As falhas anteriores pertencem à dívida existente do checkout; não foram alteradas para fazer a suíte passar.

## Testes pertinentes

Foram executados juntos, após os ajustes finais do JSX, os seguintes arquivos:

- `financialEditionSidebar.test.tsx`: edição compartilhada, parâmetros e fragmento da URL, seleção por teclado, lembrança na aba, menu histórico e menu móvel.
- `financialRevenueComparison.test.tsx`: valores integrais, confirmação separada de recebimento, limites das fontes, filtros independentes, consultas compartilhadas, contexto inicial, carregamento/erro, escala do ranking e valores com sinal.
- `financial2028Presentation.test.tsx`: formulários, ações, listagens e payloads operacionais existentes.
- `financialOperational2028.test.ts`: cálculo e semântica financeira já existentes.
- `commissionMapSidebar.test.tsx`: regressão do menu compartilhado em outras comissões.

Uma segunda execução final incluiu `financialSelectors.test.ts` (24 testes), mantendo os testes da comparação (8), apresentação (15), edição (4) e operação (8): 59 testes aprovados em cinco arquivos. O log dessa execução está em `/tmp/financial-revenue-focused-final.log`.

## Arquivos de produção alterados

- `src/components/commissions/CommissionSidebar.tsx`: seletor lateral e navegação de receitas por edição.
- `src/components/ui/resizable.tsx`: encaminhamento da referência ao grupo existente, permitindo restaurar a divisão sem remontar os painéis.
- `src/pages/commissions/FinancialManagementPage.tsx`: retirada do seletor do conteúdo e reutilização do estado de edição.
- `src/features/financial-management/operational/FinancialEditionSwitch.tsx` e `useFinancialEditionSelection.ts`: cards compactos e edição compartilhada via URL/armazenamento da aba.
- `src/features/financial-management/operational/Financial2028Workspace.tsx`: as duas entradas existentes renderizam a mesma composição.
- `src/features/financial-management/operational/Financial2028Ledgers.tsx`: reaproveitamento das listagens operacionais e adaptação responsiva de apresentação.
- `src/features/financial-management/operational/Financial2028RevenueComparison.tsx` e `FinancialRevenueRanking.tsx`: composição comparativa, indicadores e ranking com escala comum.
- `src/styles/financial-revenue-comparison.css` e `financial-sidebar.css`: acabamento e adaptação à largura disponível.

Os demais arquivos desta entrega são testes, documentação, capturas e scripts/fixtures exclusivos de validação. Rotas, chamadas de API, Supabase, permissões e regras de cálculo permanecem sem alterações. As limitações de comercialização, Rouanet realizado e ranking por categoria estão explicitadas no diagnóstico do README e na interface; não se estimam valores a partir de títulos ou contratos confirmados.

As capturas, a verificação no navegador e o diagnóstico das fontes de dados estão no [`README.md`](README.md) deste diretório.

## Limitação do ambiente e reprodução

Os comandos originais `npm run build` e `npm test` foram tentados. Neste ambiente, o esbuild fica pendente ao empacotar os arquivos de configuração, antes do início do build ou da coleta dos testes. A transpilação isolada com `esbuild.transform` e a execução programática funcionam.

O helper [`run-verification.mjs`](run-verification.mjs) transpila os arquivos de configuração vigentes para um arquivo temporário, preserva suas opções e usa as APIs do Vite/Vitest com `configFile: false`. Não modifica `vite.config.ts`, `vitest.config.ts`, as rotas ou o produto.

No build, também foi necessário excluir da configuração temporária apenas `@lovable.dev/mcp-js/supabase`: esse plugin regenera uma função Supabase e seu esbuild igualmente fica pendente. Os plugins de frontend, a configuração de produção, a minificação e os chunks do aplicativo permanecem vigentes. Portanto, o resultado comprova o build de produção completo do frontend; não comprova a execução do gerador de função Supabase. O diretório `supabase/` permaneceu sem mudanças.

```sh
npm run typecheck
node docs/validation/financial-revenue-comparison/run-verification.mjs build
node docs/validation/financial-revenue-comparison/run-verification.mjs test
node docs/validation/financial-revenue-comparison/run-verification.mjs test src/test/financialEditionSidebar.test.tsx src/test/financialRevenueComparison.test.tsx src/test/financial2028Presentation.test.tsx src/test/financialOperational2028.test.ts src/test/commissionMapSidebar.test.tsx
```

O build emite avisos de tamanho de chunks e de atualização da base Browserslist; não houve erro de compilação. Os logs completos desta sessão ficaram em `/tmp/financial-task-typecheck.log`, `/tmp/financial-task-final-build.log`, `/tmp/financial-task-baseline-tests.log`, `/tmp/financial-task-final-tests.log` e `/tmp/financial-task-focused-tests.log`; a evidência durável e compacta é o JSON de comparação versionado.
