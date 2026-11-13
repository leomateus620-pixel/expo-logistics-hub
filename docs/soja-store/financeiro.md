# Financeiro da Soja Store

A rota `/comissoes/soja-store/financeiro` usa `finance.view` para consulta e `finance.manage` para lançar orçamento, reconhecer títulos e registrar suas liquidações. As tabelas de orçamento, obrigações, liquidações e ajustes de obrigações ficam no esquema privado da loja, com RLS. Cada RPC valida sessão, organização, comissão e capacidade. As rotinas de pagamento e estorno da operação são funções privadas chamadas dentro da mesma transação da operação de origem.

## Orçamento e competência

- O orçamento aprovado é anual e por categoria. Revisões preservam autor, documento de aprovação, versão e valor anterior no registro de auditoria.
- Compras da loja são compromissos no ano civil do pedido enquanto não houver título reconhecido até o fechamento desse ano. O reconhecimento dentro do mesmo ano transfere seu valor integral para o realizado, sem somar os dois. Se o reconhecimento for posterior, o realizado aparece no ano da nova competência e o ano original preserva o compromisso existente no fechamento. O servidor usa o total persistido do pedido, inclusive frete e encargos. Cada pedido pode originar um único título. Pedidos gratuitos não geram obrigação a pagar.
- Um título reconhecido a pagar integra o realizado do ano da sua data de reconhecimento. Títulos a receber aparecem em visão própria. O saldo disponível é aprovado menos realizado menos compromissos ainda não realizados. Se o ano não tiver orçamento aprovado, a tela apresenta essa condição.
- Pagamentos e recebimentos usam a data efetiva de cada baixa ou estorno, inclusive quando o título foi reconhecido em outro ano. Valor liquidado, saldo a vencer e vencidos vêm do razão do título. O painel calcula os totais no banco sobre o recorte completo.
- O registro de um título ligado a pedido exige referência de evidência. Compra, recebimento físico, reconhecimento do título e liquidação mantêm seus efeitos separados.

## Títulos e movimentos

| Comando | Efeito |
|---|---|
| `soja_store_save_budget` | Cria orçamento anual por categoria ou registra revisão mediante a versão esperada. |
| `soja_store_recognize_obligation` | Reconhece título da loja ou obrigação de compra com valor derivado do pedido. |
| `soja_store_settle_obligation` | Registra baixa parcial ou total de título manual ou de compra, com data efetiva, forma e evidência. |
| `soja_store_reverse_settlement` | Registra compensação integral da baixa original. Um novo pagamento pode corrigir o valor. |
| `soja_store_finance_summary`, `soja_store_finance_entries`, `soja_store_finance_settlements` | Consultam resumo anual, títulos paginados e histórico das baixas no mesmo escopo. |
| `soja_store_finance_purchase_options` | Busca pedidos elegíveis por fornecedor ou referência. |

Baixa e estorno bloqueiam o título, validam a versão esperada e mantêm o total líquido entre zero e o valor do título. O mesmo identificador de envio recupera o resultado persistido. Uma obrigação vinculada à operação de atendimento recebe pagamentos e devoluções pelo fluxo de origem. A devolução anexa ajuste ao valor reconhecido e mantém o valor original no título.

A loja possui sua própria origem operacional. A integração com o Financeiro Fenasoja, a conciliação bancária, o parcelamento formal por obrigação e a destinação social dependem de etapas posteriores. Esta migração cria estruturas de uso corrente da loja e preserva o histórico existente. Dados de fontes históricas seguem a preparação e aprovação documental definidas para importação.

`node scripts/soja-store/finance-qa.mjs` usa o servidor PostgreSQL descartável descrito na [base de dados da loja](./banco.md). Cobre cálculo por recorte completo, reconhecimento único por pedido, baixa parcial, concorrência, estorno, segregação de acesso e integração transacional de uma venda com reembolso.
