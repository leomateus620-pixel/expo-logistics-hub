# Cancelar contrato do Módulo 147 — Pavilhão 3 (DIVA PAPELARIA E PRESENTES)

## Situação confirmada
- O Módulo 147 do Pavilhão 3 está "Vendido" (contrato assinado em 13/10/2026) para DIVANI KRETSCHMER LTDA.
- Ele é o único lote ativo dessa venda. Os módulos 140 a 146 da mesma venda já foram cancelados em 26/10/2026.
- O Módulo 147 do Pavilhão 12 é outro lote e não será alterado.

## O que será feito
1. Cancelar só o Módulo 147 do Pavilhão 3 com a mesma ação oficial de cancelamento usada nos outros 7 módulos. O motivo registrado será "CONTRATO CANCELADO".
2. O módulo volta a ficar Disponível (verde) no mapa.
3. Nada é apagado. A venda, o contrato e o pagamento continuam guardados como cancelados, e o cancelamento entra no histórico do lote e da venda.
4. Conferir depois: o lote aparece Disponível, o histórico mostra o cancelamento e nenhum outro lote mudou.

## Detalhes técnicos
- Item `2d2d4724…` (B6-M147), pedido `05b25582…`, lote `f9d53a71…`.
- Executar `cancel_sale_order_items` (idempotente; revalida `map.manage_sales`) para esse item, nunca UPDATE/DELETE direto.
- Validar `commercial_lots.status`, `lot_status_history`, `lot_sales.status=REVERTED` e o item `CANCELLED`.
