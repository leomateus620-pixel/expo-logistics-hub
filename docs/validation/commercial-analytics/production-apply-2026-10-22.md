# PR #221 — commercial_sales_analytics (aplicação no banco ativo, 22/10/2026)

- Banco: Lovable Cloud do app (mesma instância de preview e publicado), projeto do mapa `0538d132…` "Parque Fenasoja — referência oficial 2026" (141 pedidos).
- Guarda: md5 de `confirm_sale_order_items` antes = `8eea44244ed5ff1d1c1b384161a9a475` (esperado). Guarda mantida no SQL.
- Aplicado pela ferramenta transacional como `drizzle/migrations/0026_commercial_sales_analytics.sql`; conteúdo idêntico a `supabase/migrations/20261021223000_commercial_sales_analytics.sql` (diff vazio). Nenhuma outra migração.
- Rollback da função: `rollback_confirm_sale_order_items_2026-10-22.sql`.

## Releitura após COMMIT
- Tabela `commercial_signature_completions`: RLS ligada, sem políticas, sem acesso anon/authenticated (só service_role e funções).
- 92 conclusões por backfill `SIMPLE_HISTORY`, todas com conclusão ≥ registro e ≤ agora. Nenhuma `CONFIRMATION` (nenhuma confirmação nova executada).
- RPCs públicas: SECURITY DEFINER, executáveis só por authenticated; auxiliares privadas sem EXECUTE.
- Contagens/somas idênticas antes e depois: 1652 lotes, 664 vendas (R$ 1.568.197,81), 141 pedidos, 664 itens (446 assinados), 2351 parcelas (0 pagas, R$ 1.591.120,81), 94 contratos, 2847 históricos.

## RPCs com sessão real (admin com map.manage_sales)
- Principal: meses = anos (2026/2027/2028) = total R$ 1.012.683,15; previsto = baixas (0) + a receber.
- Cobrança: R$ 1.028.987,15 = principal + taxas incluídas R$ 16.304,00; taxas de pedidos parciais excluídas R$ 11.061,00.
- Confirmado conhecido = coberto + sem distribuição (0); 0 pedidos com divergência.
- Paginação de todos os meses: 1568 parcelas, 0 duplicadas, soma de principal = coberto (sem multiplicação em pedidos com vários itens).
- Assinatura: 92 na amostra, média ≈ 4,9 dias; excluídos 45 pendentes/parciais, 2 cancelados, 2 inconsistentes. Detalhe confere com a média.
- Sem e-mail, telefone, documento ou URL no retorno.
- Anônimo: 401. Projeto sem permissão: `MAP_PERMISSION_DENIED`. Geração antiga: `ANALYTICS_CHANGED`.
- map.view sem map.manage_sales: negado pela checagem `_commercial_analytics_access`; não testado com conta real (nenhuma disponível).

## Dashboard (navegador, sessão autenticada)
Fluxo aberto, bases Principal/Cobrança com os mesmos valores das RPCs, mês consultado, detalhamento de assinaturas (200), recarga reabre com os mesmos valores. Sem erros de página. Testes do painel: 9/9. Build OK.
