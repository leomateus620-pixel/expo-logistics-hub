# Cancelar vendas Charm See e Isaura's Modas e liberar o cancelamento de venda inteira

## Motivo de o cancelamento estar indisponível (confirmado)
- Na tela "Editar lotes da venda", o botão "Salvar alterações" fica bloqueado quando a venda ficaria com 0 espaços. Retirar todos os lotes nunca é aceito.
- No sistema, o cancelamento só aceita espaços com "Venda em aberto" (aguardando assinatura). Espaços com contrato assinado (Vendido, azul) são recusados.
- Nenhuma tela oferece "Cancelar venda inteira".
- As duas vendas estão confirmadas e com contratos assinados:
  - CHARM SEE LTDA, Pavilhão 3, módulos 168, 169, 170 e 171
  - MARIA ISAURA DO AMARAL E SILVA (Isaura's Modas), Pavilhão 1, módulos 47 a 51

## O que será feito
1. **Novo cancelamento oficial** de venda inteira ou de espaços específicos, aberta ou assinada:
   - exige a permissão de gerenciar vendas e um motivo
   - não apaga nada: os espaços ficam como cancelados, a venda fica como cancelada e os contratos continuam no histórico
   - libera os módulos (Disponível no mapa) e registra "VENDA CANCELADA" com o motivo no histórico de cada lote
   - parcelas em aberto são canceladas; parcelas já pagas continuam registradas para estorno manual
   - se o módulo tiver sido usado em outra venda, o cancelamento é recusado
2. **Botão "Cancelar venda"** no detalhe da venda na Dashboard Comercial, com confirmação e motivo. Em "Editar lotes da venda", retirar todos os lotes passa a oferecer o cancelamento completo em vez de bloquear o botão.
3. **Cancelar as duas vendas** com o motivo "CONTRATO CANCELADO". Depois, conferir que os 9 módulos estão Disponíveis, aparecem no histórico e não ficam vendas ativas.
4. Testes da nova regra: venda assinada pode ser cancelada, módulos liberados, histórico preservado e pedido de quem não tem permissão recusado.

## Detalhes técnicos
- Migração com a RPC `cancel_sale_order(p_order_id, p_item_ids nullable, p_reason)` SECURITY DEFINER, `search_path` fixo, com checagem de `map.manage_sales` e idempotência. Ela marca `contract_state='CANCELLED'`, `lot_sales.status='CANCELLED'`, lote `AVAILABLE`, `lot_status_history` + `map_activity_logs` e `lot_sale_orders.status='CANCELLED'` quando não restam itens ativos. Se faltar o estado CANCELLED no pedido, ele é adicionado de forma aditiva.
- Frontend: `salesService.ts`, `SaleOrderDetail.tsx`, `ReviseSaleOrderDialog.tsx` (condição `remaining === 0`) e `scheduleCommercialMapRefresh` após a ação.
- As duas vendas são canceladas pela própria RPC, como ação administrativa registrada.
