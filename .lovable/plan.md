# Confirmar a venda inteira ao clicar em "Confirmar contrato assinado"

## Problema
Hoje o botão confirma só o espaço clicado. No pedido dos módulos 34–39 do Pavilhão 13, confirmar o 37 deixou os outros cinco em aberto, em amarelo.

## Como vai ficar
- O botão, em qualquer espaço de uma venda em aberto, confirma **todos os espaços desse mesmo pedido** que ainda aguardam assinatura. Todos ficam azuis juntos.
- Antes de confirmar, a janela mostra a lista dos espaços que serão marcados, por exemplo: "6 espaços: Módulos 34, 35, 36, 37, 38, 39 — Pavilhão 13".
- Não são alterados:
  - outros pedidos, mesmo que sejam do mesmo expositor;
  - espaços cancelados ou já confirmados;
  - registros antigos.
- O botão "Cancelar venda em aberto" continua valendo só para o espaço clicado.
- O pedido de 34–39 que já ficou pela metade se resolve sozinho: basta abrir o 34 (ou outro que ainda esteja amarelo) e confirmar. Os cinco restantes ficam azuis juntos.

## Onde a mudança aparece
O resultado vem confirmado do servidor e é recarregado, então todos os lugares mostram o mesmo estado:
- o mapa externo e a planta do pavilhão;
- a ficha do lote;
- a seção "Vendas e contratos" da Dashboard, com a contagem de assinados;
- os links públicos, que já leem o mesmo estado.

Nada é pintado antes da resposta do servidor.

## Detalhes técnicos
- `SaleOpenSection.tsx`: a confirmação passa a enviar `order.items.map(i => i.itemId)` em vez de apenas o `currentItem`. A lista vem de `fetchLotOpenSaleOrder`, que já filtra o mesmo `order_id`, `contract_state='PENDING_SIGNATURE'` e pedido `CONFIRMED`. A RPC `confirm_sale_order_items` já aceita vários itens, é idempotente e revalida `map.manage_sales` no servidor. Por isso não muda nada no banco.
- Antes de enviar, o pedido é buscado de novo, para não usar uma lista desatualizada caso alguém tenha cancelado um item nesse meio-tempo.
- Ao concluir, as consultas `['commercial-map']` e da dashboard de pedidos são recarregadas. A mensagem informa quantos espaços foram confirmados.
- Teste novo: com um pedido de 6 itens pendentes, clicar no 37 chama a confirmação com os 6 IDs desse pedido e nenhum outro.
- Não publica.
