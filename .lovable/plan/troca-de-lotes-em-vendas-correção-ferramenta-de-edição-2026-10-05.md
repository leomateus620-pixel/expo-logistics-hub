# Troca de lotes em vendas (correção + ferramenta de edição)

## Situação atual (conferida no banco)
- **Êxito Confecção** (confirmada, assinada): módulos 69–73 do Pavilhão 13, 5 × 3 m² a R$ 776/m², subtotal R$ 11.640 + taxas R$ 107 = R$ 11.747, 17 parcelas no boleto.
- **Boleiros e Girls Store** (confirmada, assinada): módulos 34–39, subtotal R$ 13.968 + R$ 107 = R$ 14.075, 17 parcelas.
- Módulos 68 e 33 estão **Disponíveis**; nenhum dos dois pedidos tem contrato anexado.

## Parte 1 — Correção imediata
- Êxito: entra o 68, sai o 73 → fica **68 a 72**.
- Boleiros: entra o 33, sai o 39 → fica **33 a 38**.
- O item que sai fica registrado como "removido da venda" (histórico preservado) e o lote volta a **Disponível**.
- O item novo entra já como **assinado/vendido (azul)**, igual aos demais da venda, com o preço oficial do lote novo.
- Total e parcelas recalculados. Como a quantidade e a área ficam iguais, o valor deve continuar o mesmo, a menos que o lote novo tenha preço diferente (esquina, ajuste manual) — nesse caso o sistema recalcula e eu informo a diferença.
- Parcelas já pagas não são alteradas; a diferença é distribuída só nas parcelas em aberto.

## Parte 2 — Editar lotes de uma venda
- Ícone de **lápis "Editar lotes"** em cada venda da seção "Vendas e contratos" (abertas e confirmadas) e na ficha da venda no mapa. Só para quem tem permissão de gerenciar vendas. Vendas legadas e totalmente canceladas não mostram o ícone.
- Janela de edição em 3 passos:
  1. **Lotes**: lista atual com botão remover; campo de busca/lista de lotes Disponíveis do mesmo projeto para adicionar (busca por número, pavilhão, quadra). Lote reservado, vendido ou bloqueado aparece desabilitado com o motivo.
  2. **Valores**: preço de cada lote pelo mesmo cálculo oficial do checkout, novo subtotal, taxas mantidas (editáveis), novo total. Parcelas: mantém quantidade e vencimentos; recalcula só as em aberto e preserva as pagas e edições manuais; permite mudar a quantidade.
  3. **Revisão**: "Antes → Depois" (lotes saindo, entrando, valor total, parcelas) e um motivo obrigatório.
- Ao salvar: uma única operação no servidor, tudo-ou-nada. Se outra pessoa vendeu/reservou um lote no meio do caminho, a operação falha com mensagem clara e nada é alterado.
- Lote adicionado herda o estado da venda: venda em aberto → amarelo; venda confirmada → azul. Lote removido volta a verde.
- Contratos já anexados à venda inteira: o lote novo passa a fazer parte da abrangência; o removido sai, sem apagar o arquivo. Aviso sugerindo anexar nova versão do contrato.
- Mapa, Dashboard (matriz, barra de progresso, lista) e carrinho atualizam na hora.

## Detalhes técnicos
- Migração: estado `REMOVED` em `contract_state` de `lot_sale_order_items` (com `removed_at/removed_by/removal_reason`) e tabela de auditoria `lot_sale_order_revisions` (snapshot antes/depois, motivo, autor) com GRANTs + RLS espelhando pedidos.
- RPC `revise_sale_order_items(p_order_id, p_add_lot_ids, p_remove_item_ids, p_fees, p_installments, p_reason, p_expected_updated_at)` SECURITY DEFINER, `search_path` fixo, valida `map.manage_sales`, bloqueia linhas com `FOR UPDATE`, exige lotes `AVAILABLE` e do mesmo projeto, usa `commercial_lot_pricing_2028` para o preço, cria `lot_sales`, atualiza status dos lotes, `lot_status_history`, `lot_contract_lots`, totais do pedido e parcelas em aberto; trava otimista por `updated_at`. Não exige mínimo de 1 lote (para zerar, usar cancelar venda).
- RPCs de listagem/detalhe, agregados da Dashboard e links públicos passam a ignorar itens `REMOVED`.
- A correção da Parte 1 é executada com essa mesma RPC (motivo "Correção solicitada em 05/10/2026"), garantindo o mesmo caminho testado.
- Front: `ReviseSaleOrderDialog` reutilizando `salesPricing`, `salesInstallments` e `salesMoney`; ação no `CommercialSalesOrdersSection` e no `SaleOpenSection`/ficha vendida; invalidação das consultas do mapa e da Dashboard.
- Testes: recálculo de parcelas (pagas preservadas, arredondamento em centavos), troca com mesmo total, lote indisponível, permissão negada, concorrência.
- AGENTS.md: regra de revisão de itens por RPC transacional com histórico.
- Não publicar até você pedir.
