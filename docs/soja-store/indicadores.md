# Indicadores da operação atual

A visão geral consulta o banco com intervalo civil inclusivo em `America/Sao_Paulo` e local ou ponto selecionado. Os indicadores de compra usam a data do pedido e o local de recebimento definido no pedido. Os indicadores de venda usam a data da operação e seu ponto. Os links abrem as listagens com o mesmo recorte. Uma venda que já teve devolução permanece no recorte das vendas confirmadas, com os valores ajustados pelas devoluções e estornos registrados.

O valor confirmado é o valor das vendas confirmadas menos devoluções. O valor recebido soma os pagamentos e estornos das mesmas vendas. O recorte recebido é uma visão daquelas operações, com todos os movimentos de pagamento que as compõem até a consulta. O financeiro da loja oferece a visão pelo dia efetivo das liquidações. O saldo físico mostra o estado atual no local, independentemente do período selecionado. A contagem de produtos ativos aparece na visão geral sem filtros de data ou local.

| RPC | Fonte e recorte |
|---|---|
| `soja_store_current_dashboard` | Agregação completa por capacidade de consulta. Inclui pontos, pedidos pendentes, vendas confirmadas, valor confirmado, recebimento das vendas confirmadas e posições atuais de estoque. |
| `soja_store_sales_filtered` | Vendas por data da operação, local e condição de confirmação. Total calculado antes da paginação. |
| `soja_store_purchases_filtered` | Pedidos por data, local, situação, fornecedor e variante. Total calculado antes da paginação. |

A migração `20261112121500_soja_store_current_overview.sql` acrescenta três RPCs públicas e funções auxiliares privadas. SHA-256 da fonte versionada `81e4d157285827cf1b24dc8453cc7e0eeec2390f435f40233fa82fde8e6bf8d0`. As RPCs antigas permanecem disponíveis para os clientes anteriores. O teste PostgreSQL `scripts/soja-store/current-operation-qa.mjs` compara números e identificadores entre painel e listagens, incluindo paginação, ponto, período, devolução e acesso negado.
