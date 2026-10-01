# Implementação e verificações

## Arquivos de produto

| Arquivo | Alteração |
| --- | --- |
| `src/features/commercial-map/dashboard/CommercialDashboard.tsx` | Cards globais com valores gravados/oficiais, cobertura e seletor local de etapa. |
| `src/features/commercial-map/dashboard/commercialDashboardAnalytics.ts` | Resolução única por lote, status da venda e etapa oficial. Sem fallback para preço cadastral antigo. |
| `src/features/commercial-map/dashboard/commercialDashboardTypes.ts` | Documentação do significado dos agregados monetários. |
| `src/features/commercial-map/dashboard/CommercialMiniMap.tsx` | Identificação correta de valor negociado ou tabela oficial no espaço selecionado. |
| `src/features/commercial-map/dashboard/commercial-dashboard.css` | Painel ampliado, lateral de 340 px, composição vertical até 1100 px e seletor compacto. |
| `src/features/commercial-map/services/commercialMapService.ts` | Vendas e preços no select paginado existente, tanto no mapa completo quanto no escopo de comissão. |
| `src/features/commercial-map/utils/commercialLotFinancialData.ts` | Normalização de identidade, valores nulos/zero, duplicatas e conflitos. |
| `src/features/commercial-map/types.ts` | Campos opcionais de vendas e preços oficiais no lote carregado. |
| `src/integrations/supabase/types.ts` | Coluna e relacionamento da view existente. |
| `supabase/migrations/20261001193000_commercial_dashboard_financial_embed.sql` | Coluna final `entity_id`, invoker e reload de cache. Sem alteração de fórmulas ou registros. |

Não foram alterados status/persistência de checkout, confirmação, cancelamento, regras de preços, permissões, sincronização, rotas, câmera ou o Canvas. O snapshot recebe os dados enriquecidos pelo fluxo atual.

## Testes e ferramentas

Atualizados: `src/test/commercialDashboardAnalytics.test.ts`, `commercialDashboardLotMetrics.test.ts`, `commercialDashboardMiniMap.test.tsx`, `commercialDashboardPresentation.test.tsx`, `commercialDashboardScopes.test.ts`, `commercialDashboardSpaces.test.tsx` e `commercialMapLoadingPipeline.test.ts`. Adicionados: `commercialLotFinancialData.test.ts`, `commercialDashboardFinancialView.contract.test.ts` e `src/test/helpers/dashboardFinancialFixture.ts`.

O harness `scripts/dashboard/browser-smoke.cjs` registra escala visível e troca de etapa. Os scripts `db-smoke-runtime.py`, `db-smoke.ps1`, `db-smoke-schema.sql` e `db-smoke-http.cjs` verificam a migration e o relacionamento num PostgreSQL/PostgREST isolado. `remote-pricing-gate.cjs` verifica somente schema publicado, sem ler registros.

## Checks locais

**158 testes passaram em 20 arquivos** no código final, incluindo analytics, apresentação, seleção/refetch, fit/resize, paginação, identidade, escopo/permissões, seleção de vendas, taxas e overrides. Comando:

```powershell
npx vitest run --maxWorkers=2 --testTimeout=20000 src/test/commercialDashboard src/test/commercialLotFinancialData.test.ts src/test/commercialMapLoadingPipeline.test.ts src/test/commercialMapSegments.test.ts src/test/commercialLotIdentity.test.ts src/test/commercialMapPavilionWayfinding.test.ts src/test/commercialMapPavilion7OfficialLayout.test.ts src/test/commercialMapSharedQuery.test.ts src/test/restrictedScope.test.ts src/test/salesMode.test.ts src/test/salesModeInteraction.test.ts src/test/salesCheckoutFees.test.ts src/test/lotPriceOverride.test.ts
```

Typecheck (`npm run typecheck`) e ESLint dos arquivos TypeScript alterados passaram. A invariância da view compara literalmente a definição anterior, retirando apenas a nova coluna/opção invoker, e verifica a ausência de escrita em inventário ou alteração de políticas.

O build final passou (`npm run build`, 2 min 39 s), com avisos preexistentes de Browserslist e tamanho de chunks. `git diff --check` passou. O workflow existente `.github/workflows/commercial-dashboard.yml` também passa a executar os testes do payload financeiro, paginação e query/escopo compartilhados.

O teste adicional `lotPricing2028.test.ts` apresentou **7 passados e 1 falha preexistente**, reproduzida no baseline isolado `3c653eb8`: texto esperado “Ainda não definido”, texto atual “Valor ainda não definido”, linha 99. Esse motor e seu teste permanecem inalterados; não foi escondida nem corrigida uma falha fora do escopo.

Os casos monetários incluem leitura de venda aberta antes da assinatura, transição para confirmada com o mesmo valor, cancelamento com histórico revertido, zero, ausência/RLS, múltiplas vendas abertas, identidades conflitantes, centavos, total misto por etapa, manual/override, exclusão e refetch. Não são realizados checkout ou vendas reais no banco publicado.

## Relacionamento real do banco

PostgreSQL 16.15 e PostgREST 16.4 executaram o select literal do serviço num banco isolado. A migration foi aplicada duas vezes, conservando colunas anteriores e invoker. O embed retornou um objeto por entidade, com no máximo uma linha de preço mesmo em empates de regras 2×2. Gestor e leitor: 1.205 lotes em páginas 1.000 + 205, sem duplicatas; comissão: 1.100 no escopo autorizado, em páginas 1.000 + 100; anônimo: nenhum lote. Valores de override/zero, ausência de área e múltiplas vendas abertas foram preservados. As funções de autorização dessa fixture usam claims sintéticos; não comprovam toda a autenticação ou latência do projeto publicado.

O gate remoto read-only permanece pendente: a view publicada ainda não tem `entity_id`/relacionamento na última conferência. A PR deve permanecer em rascunho até a aplicação combinada com o usuário e o sucesso de `remote-pricing-gate.cjs`.

## Limites do contrato carregado

A agregação continua tratando lotes sem entidade carregada como `orphanLots`, fora dos indicadores, com aviso explícito. Entidades presentes com geometria inválida continuam nos indicadores e no seletor. O loader atual elimina entidades sem qualquer registro de geometria; essa limitação preexistente não foi alterada nesta correção financeira. Não há associação espacial por suposição nem consulta adicional para completar essas entidades.

Os resultados visuais, o smoke do banco isolado e a verificação de schema publicado são evidências distintas. Prints e números da fixture não representam valores ou inventário de produção. Ver [comparativos e medições](README.md) e [ordem de liberação](DEPLOYMENT.md).
