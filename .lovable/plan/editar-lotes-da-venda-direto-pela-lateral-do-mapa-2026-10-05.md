# Editar lotes da venda direto pela lateral do mapa

## O que o usuário verá
- Na lateral do mapa, ao abrir um lote **Vendido** ou **Venda em aberto**, logo abaixo de "Editar dados do expositor", um novo botão **Editar lotes da venda** (ícone de lápis).
- Funciona igual nos três lugares onde a ficha aparece: lote externo, módulo de pavilhão (como o Módulo 68 da imagem) e ficha de venda em aberto.
- Abre a mesma janela já usada na Dashboard: retirar/desfazer, buscar e adicionar lote livre, taxas, parcelas, total atual × novo e motivo obrigatório.
- O lote que você clicou aparece destacado na lista, para ficar claro qual é o ponto de partida.
- Ao salvar, o mapa repinta na hora (lotes novos azuis/amarelos, retirados verdes) e a ficha se atualiza. Se o lote aberto foi retirado, a ficha passa a mostrar "Disponível".
- Só aparece para quem pode gerenciar vendas e apenas em vendas com pedido (vendas antigas sem pedido não mostram o botão, com uma linha explicando).

## Como será feito
1. Acrescentar a ação dentro do bloco de identidade do expositor que já é compartilhado pelas três fichas — ele já sabe a qual pedido o lote pertence. Assim não há três cópias da lógica.
2. Ao tocar, carregar os detalhes do pedido (mesma consulta da Dashboard) e abrir a janela de edição existente, passando os lotes e a localização (pavilhão/quadra) já carregados no mapa.
3. Depois de salvar, atualizar mapa, ficha, Dashboard e lista de vendas juntos.
4. Nenhuma mudança no banco: a regra de troca segura (tudo-ou-nada, parcelas pagas preservadas, histórico) continua a mesma.

## Detalhes técnicos
- `SaleExhibitorIdentity` (`SaleExhibitorEditDialog.tsx`): novo botão quando `identity.orderId` e `canManageSales`; abre `ReviseSaleOrderDialog` com `fetchSaleOrderDetail({ orderId, saleId: null })` via React Query (chave `commercial-sale-order-detail`).
- `ReviseSaleOrderDialog`: nova prop opcional `focusLotId` para destacar o item; `lots`/`locationOf` vindos de `useCommercialMap` (entidades + pai) por um pequeno hook compartilhado `useLotLocationLabel`, reaproveitado pela Dashboard.
- Invalidação: `['commercial-map']`, `['commercial-sale-orders']`, `['commercial-sale-order-detail']`, e a chave de identidade da venda.
- Diálogo renderizado em portal com z-index acima da lateral; no celular ocupa a tela com rolagem própria (campos com 16 px).
- Testes: botão aparece só com pedido + permissão; abre com o lote clicado destacado; após salvar invalida as consultas. Atualizar os mocks dos testes que já simulam esse bloco.
- Não publicar.
