# Edição de vendas confiável: abrangência total, histórico por lote e sincronização

## Situação conferida
- As 34 vendas ativas são pedidos com itens. Não há venda antiga sem pedido nem lote vendido sem registro de venda. Por isso **todas as vendas já feitas e as futuras (o checkout cria pedido) já podem ser editadas**. Vou manter isso garantido com teste.
- Ao editar, o servidor já atualiza situação de lote (confirmado → azul, em aberto → amarelo, retirado → verde), parcelas e contratos da venda inteira.
- Problemas encontrados:
  1. O histórico do lote mostra textos crus ("LOT SALE ITEM ADDED"), sem expositor, sem antes/depois e sem o nome de quem fez.
  2. Só os lotes que entram ou saem ganham registro; os demais lotes da mesma venda não ficam sabendo que a venda mudou (total, parcelas).
  3. A ficha do módulo de pavilhão (ex.: Módulo 68) não tem aba de histórico.
  4. A Dashboard não mostra a lista de alterações da venda.
  5. A proteção contra duas pessoas editando a mesma venda ao mesmo tempo existe no servidor, mas a tela não a usa.
  6. Se um lote retirado estiver destacado em "Ver lotes no mapa" ou no carrinho, ele continua lá até recarregar.
  7. Contrato anexado só ao lote retirado (contrato individual) fica sem aviso.

## Melhorias
1. **Histórico em cada lote** (lote externo e módulo de pavilhão):
   - Entrada amigável: "Adicionado à venda de EXITO CONFECCAO", "Retirado da venda de… — voltou a Disponível", "Venda alterada (este espaço permaneceu)".
   - Detalhe: lotes antes → depois, total antes → depois, nº de parcelas, motivo, quem fez e quando.
   - Também deixa legíveis os registros já existentes (venda confirmada, cancelada, preço alterado).
   - Nova aba/seção "Histórico" recolhível na ficha do módulo de pavilhão, usando a mesma lista.
2. **Registro para todos os lotes da venda** a cada edição, ligado à revisão (`revision_id`).
3. **"Alterações da venda"** na Dashboard (dentro dos detalhes): linha do tempo das revisões com antes/depois.
4. **Proteção contra edição simultânea**: a janela envia a versão da venda; se outra pessoa salvou antes, aparece "A venda foi alterada por outra pessoa" e a janela recarrega os dados, sem gravar nada.
5. **Sincronização imediata**: após salvar, remover lotes retirados da inspeção "Ver lotes no mapa" e do carrinho, atualizar ficha, mapa, matriz, barra de progresso e lista.
6. **Avisos na janela de edição**: lote retirado com contrato individual ("o arquivo continua no histórico do lote"); venda com contrato da venda inteira ("anexe nova versão"); lote com parcela recebida não bloqueia, mas mostra que o valor recebido fica preservado.
7. **Revisão antes de salvar**: resumo "Entram: 68 · Saem: 73 · Total R$ X → R$ Y · Parcelas 17 × R$ Z" acima do botão Salvar.

## Detalhes técnicos
- Migração (sem apagar nada):
  - `map_activity_logs` registra `LOT_SALE_ITEM_ADDED`, `LOT_SALE_ITEM_REMOVED` e novo `LOT_SALE_ORDER_REVISED` (lotes mantidos) com `after_state` contendo `revision_id`, `order_id`, comprador, `lots_before/after`, `total_before/after`, `installment_count`. Atualiza `_revise_sale_order_items_core` (mesma assinatura).
  - `get_commercial_sale_order_detail` passa a devolver `header.updatedAt`, `revisions` (lista de `lot_sale_order_revisions` com nome do autor) e, por item, se há contrato individual.
- Front:
  - `describeSaleActivity(item)` puro em `utils/saleActivity.ts` (+ testes), usado no histórico do `MapPanels` e em novo `LotActivityList` compartilhado; `PavilionModuleCard` ganha seção "Histórico" com `useLotActivity`.
  - `ReviseSaleOrderDialog`: envia `p_expected_updated_at`; trata `ORDER_CHANGED` refazendo a consulta; resumo final; avisos de contrato.
  - Após salvar: `useSaleInspectionStore` remove lotes retirados; `useSalesStore.removeLot` para lotes que deixaram de ser vendáveis; invalida `['commercial-map']`, `['commercial-sale-orders']`, `['commercial-sale-order-detail']`, identidade da venda.
  - Seção "Alterações da venda" em `CommercialSalesOrdersSection`.
- Testes: rótulos do histórico; conflito de versão; checkout novo → editável; remoção limpa inspeção/carrinho; consultas no banco confirmando registros em todos os lotes da venda após uma revisão de teste revertida em transação.
- AGENTS.md: atualizar a regra de revisão (registro por lote ligado à revisão).
- Não publicar.
