# Dashboard Comercial — lotes como métrica principal + auditoria do Modo Vendas

Objetivo: trocar a hierarquia das métricas (quantidade de lotes passa a ser o indicador principal), manter área e valores como informação complementar, e validar de ponta a ponta a cadeia venda → status SOLD → analytics → mini mapa → dashboard. Sem reconstruir a interface, sem tocar em banco, migrações, RPCs ou rotas.

## 1. Mudança de hierarquia das métricas

Reutilizar exclusivamente `soldLots`, `availableLots`, `commercialLots` e `soldLotPercentage` já existentes em `commercialDashboardAnalytics.ts` — nenhum cálculo novo, nenhuma alteração na camada de analytics.

Visão geral (`CommercialDashboard.tsx`), nova ordem dos cartões:
1. Lotes comerciais
2. Lotes vendidos (com barra de progresso por `soldLotPercentage`)
3. % dos lotes vendidos
4. Lotes disponíveis
5. Área comercial cadastrada, área vendida, área disponível (com % por área)
6. Valor comercial vendido e potencial pendente

Os avisos de dados pendentes (área/preço/sem segmento) permanecem como estão.

## 2. Gráfico principal: Distribuição dos lotes

Em `CommercialDashboardCharts.tsx`, o donut principal deixa de ser ponderado por área e passa a usar `lotCount` por status (Vendido, Disponível, Reservado, Em negociação, Bloqueado):

- Título: "Distribuição dos lotes".
- Centro: `X,X%` + `LOTES VENDIDOS`, e abaixo `X de Y lotes`.
- Tooltip e lista lateral: quantidade em destaque, área como informação secundária.
- Percentual complementar de área permanece visível como linha de apoio.
- Estado vazio passa a depender de haver lotes, não de haver metragem.

Para não quebrar quem já importa o componente, o gráfico é renomeado internamente para distribuição de lotes mantendo o mesmo ponto de importação, com um alias exportado do nome antigo.

## 3. Segmentos e comparativo

- `CommercialSegmentDashboard.tsx`: o percentual do cabeçalho passa a ser `soldLotPercentage` ("dos lotes vendidos"); o bloco de contagem vem primeiro, área e valores continuam abaixo; o gráfico do segmento usa a mesma distribuição por lotes. Vale para Exporural, Indústria/Comércio/Serviços e Espaço do Automóvel.
- `CommercialDashboardComparison.tsx`: `lots` vira o modo padrão e a primeira opção; Área e Valor comercial continuam disponíveis.

## 4. Auditoria da integração com o Modo Vendas (sem alterar o fluxo)

Revisão de leitura em `useSalesCheckout.ts`, `salesService.ts`, `salesPricing.ts`, `useCommercialMap.ts`, `useCommercialDashboardSync.ts`, `CommercialMiniMap.tsx`.

Ponto a confirmar: `useSalesCheckout` invalida `['commercial-map']` por prefixo, enquanto a chave real inclui usuário, organização e escopo. Verificar em teste que a invalidação por prefixo realmente alcança a chave montada e que a Dashboard recebe o novo estado sem F5. Se não alcançar, o ajuste será mínimo e restrito à invalidação — nenhuma mudança estrutural.

Confirmar também que a identificação no mini mapa continua por `lot.id` / `entityId` / `publicIdentifier` e segmentação oficial, nunca por posição de array.

## 5. Testes (ampliar, não substituir)

Ampliar `commercialDashboardAnalytics.test.ts`, `commercialDashboardMiniMap.test.tsx`, `commercialDashboardSync.test.tsx`, `salesMode.test.ts`:

- Percentual por quantidade: 1 de 5 = 20%, 2 de 5 = 40%, 5 de 5 = 100%, usando lotes com metragens propositalmente muito diferentes para provar que o indicador principal não depende de área.
- Venda por segmento (Exporural, ICS, Espaço do Automóvel): após cada venda, `soldLots` sobe, `availableLots` cai, percentual recalcula, área vendida cresce exatamente pela metragem do lote, valor vendido atualiza, e a visão geral contabiliza a venda uma única vez.
- Venda múltipla: 3 lotes com áreas e preços distintos vendidos juntos resultam em exatamente +3 lotes, e soma exata de área e valor.
- Cenário combinado: soma geral igual à soma dos três segmentos.
- Consistência: mudança só de área não altera contagem nem percentual de lotes; mudança só de preço não altera contagem, percentual nem área; lote vendido sem metragem conta como vendido sem inventar área; lote vendido sem preço não vira `R$ 0,00`.
- Mini mapa: `AVAILABLE → SOLD` muda a cor do mesmo polígono, sem sumir, duplicar, mudar de posição ou migrar de segmento.
- Teste integrado: `AVAILABLE → venda → SOLD → analytics → mini mapa/dashboard`.

## 6. Verificação final

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Revisão de responsividade em 1366×768, 1920×1080, 390×844 e 430×932 (cartões, donut, mini mapas, comparativo, tooltips, scroll, ausência de overflow horizontal, checkout e multiseleção do Modo Vendas).

Ao final, relatório curto com alterações, problemas encontrados, resultado por segmento, multiseleção, confirmação do mini mapa e limitações remanescentes.

## Limitações conhecidas

- Os cenários de venda são executados em testes automatizados com dados controlados; nenhuma venda fictícia é gravada em produção.
- A validação visual do mapa 3D historicamente esbarra no renderizador WebGL do ambiente; a revisão de responsividade cobre a Dashboard e o checkout, e qualquer parte não verificável será declarada como tal.
- Nada será publicado.
