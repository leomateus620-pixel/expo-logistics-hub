# Novo preço: Pavilhão 14, módulos 36 a 93

## O que muda
- Os módulos 36 a 93 do Pavilhão 14 (3,5 m² cada) passam a custar:
  - **Renovação:** R$ 342,00/m², ou seja, **R$ 1.197,00 por módulo**
  - **2ª Etapa:** R$ 376,00/m², ou seja, **R$ 1.316,00 por módulo**
- Os demais módulos do Pavilhão 14 continuam com o preço atual (750/825, ou 780/858 nas faixas especiais).
- Não há vendas nesses módulos, então nenhum pedido, parcela ou contrato muda.

## Onde o valor novo aparece
O preço sai de uma única tabela oficial, lida por todas as telas. Por isso o novo valor vale automaticamente para:
- a ficha do módulo no mapa, com as duas etapas;
- o carrinho e o checkout de vendas (total e parcelas);
- a edição de lotes de uma venda (valor dos lotes adicionados);
- a Dashboard Comercial (valores do inventário e barra de progresso);
- a edição manual de preço por lote (o valor da regra passa a ser a nova referência).

## Detalhes técnicos
- Alteração só nos dados: inserir em `commercial_price_rules` duas regras `MODULE_RANGE` para `P14`, de 36 a 93 (RENOVACAO 342,00 e SEGUNDA_ETAPA 376,00), com prioridade 100 e o mesmo `project_id`. Elas vencem a regra geral `PAVILION`, de prioridade 40. Rótulo: "Pav 14 - Módulos 36 a 93".
- Antes de gravar: confirmar que não existem overrides manuais nem itens de venda ativos entre 36 e 93.
- Depois de gravar: conferir em `commercial_lot_pricing_2028` que os 58 módulos têm 1197,00/1316,00 com `resolution_status = OK`, e que os módulos 35 e 94 continuam como estavam.
- Os módulos já existem como `MODULE_RANGE` nas faixas 94–96, 120–125 e 149–151, então não há mudança de código nem de permissões. Os caches do mapa e da Dashboard são atualizados ao recarregar a página.
- Nada será publicado.
