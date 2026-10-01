# Módulo 49 do Pavilhão 13: Renovação a R$ 795/m²

## O que muda
- Só o Módulo 49 do Pavilhão 13 (3 m²): a Renovação passa de R$ 776/m² (R$ 2.328,00) para **R$ 795/m², total R$ 2.385,00**.
- A 2ª Etapa continua igual (R$ 854/m², R$ 2.562,00). Os outros módulos e as regras de preço também não mudam.
- O módulo está Disponível e não tem venda, então nenhuma venda antiga é alterada.

## Onde aparece
O preço sai da fonte oficial de preços que já alimenta a ficha do mapa, os links públicos, o carrinho, a finalização de venda, o menu Vendas e o dashboard. Por isso, o novo valor aparece em todos esses lugares sem precisar mexer nas telas.

## Detalhes técnicos
- Gravar o total de R$ 2.385,00 como ajuste manual autorizado (`commercial_lot_price_overrides`, etapa renovação, `previous_total` 2328), no lote `6de9acf2-…` (B5-M049), registrando auditoria pelo mesmo caminho usado pela edição manual de preço.
- Conferir em `commercial_lot_pricing_2028`: `renovacao_total` = 2385, `renovacao_price_per_sqm` = 795, `renovacao_is_manual` = true; 2ª Etapa sem mudança.
- Se a edição manual usar uma função própria de auditoria, chamar essa função em vez de inserir direto.
