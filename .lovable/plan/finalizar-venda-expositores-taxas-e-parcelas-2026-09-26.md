# Finalizar venda: expositores, taxas e parcelas

## Situação atual (verificada)
- Vendas ficam em `lot_sale_orders` (dados do comprador copiados na própria venda: nome, documento, celular, e-mail), `lot_sale_order_items` (valor por lote) e `lot_sale_installments` (número, vencimento, valor).
- Não existe cadastro de expositores reutilizável no banco — será criado um único.
- Método hoje: PIX/Boleto/Transferência/Cartão/Outro + À vista/Parcelado separados (gera "PIX parcelado", "À vistaParcelado" colado e "1 de 36").
- A função do servidor `register_commercial_sale_order` já faz a venda atômica, idempotente, com preço recalculado no servidor.

## O que o usuário verá
1. **Expositor**: botão de livro "Expositores cadastrados" ao lado do título; lista pesquisável (nome, documento, celular, e-mail) que preenche tudo de uma vez. Salvamento automático com indicador discreto "Salvando / Salvo / Erro — tentar de novo". Observações continuam só da venda.
2. **Pagamento**:
   - Bloco "Taxas da venda": Taxa administrativa, PPCI, Limpeza ou licença (R$ 0,00 inicial, máscara BR, sem negativos). Cobradas uma vez por venda.
   - Seletor único: PIX · Boleto à vista · Boleto parcelado.
   - PIX/Boleto à vista: 1 parcela com o total, vencimento editável, "1 parcela".
   - Boleto parcelado: "Quantidade de parcelas" (2 a 36) + "Aplicar parcelas" → gera todas de uma vez, vencimento dia 5 a partir de 05/12/2026 (05/01/2027, 05/02/2027…), datas e valores editáveis.
   - Rodapé: Total da venda · Soma das parcelas · Diferença (bloqueia continuar e explica quanto falta/excede). Botão "Redistribuir valores" quando houver ajuste manual.
   - Cards de parcela no celular (número, data e valor em linhas separadas, sem sobreposição).
3. **Revisão** em blocos: Expositor (e-mail visível ou "Não informado"), Espaços (lotes, segmento, quantidade, área, Renovação/2ª Etapa), Composição do valor (subtotal, 3 taxas, total das taxas, total final; "Exibir detalhamento das taxas" aberto por padrão), Pagamento (método, "N parcelas", lista completa). Texto novo: "Total composto pelos espaços e pelas taxas discriminadas acima."
4. Painel/detalhe da venda passam a mostrar Valor dos espaços, Taxas e Total.

## Regras de cálculo
- Total = subtotal dos espaços (regra oficial/override atual, sem mudanças) + 3 taxas.
- Tudo em centavos inteiros. Divisão: resto distribuído nas primeiras parcelas (R$ 1.000 / 3 → 333,34 + 333,33 + 333,33).
- Datas como data civil (AAAA-MM-DD), sem fuso; exibidas DD/MM/AAAA.
- Mudança de total: modo automático recalcula preservando datas; com valores manuais, preserva e oferece "Redistribuir". Nova quantidade só via "Aplicar parcelas", com aviso se havia ajustes.
- Trocar para PIX/Boleto à vista consolida em 1 parcela (sem sobras no envio).

## Detalhes técnicos

### Migração (única, idempotente)
- Nova tabela `commercial_exhibitors`: org_id, project_id?, name, document_number (exibição), document_normalized (só dígitos), phone, email, created_by, updated_by, timestamps. Índice único `(org_id, document_normalized)`. GRANT só a `authenticated`/`service_role` (sem `anon`), RLS: leitura/escrita só para quem tem `map.manage_sales` ou admin na org.
- RPC `upsert_commercial_exhibitor(p_org_id, p_name, p_document, p_phone, p_email, p_exhibitor_id)` SECURITY DEFINER, search_path fixo: valida permissão, normaliza documento, `INSERT … ON CONFLICT (org_id, document_normalized) DO UPDATE` apenas com campos não vazios (COALESCE(NULLIF)); se `p_exhibitor_id` veio e o documento mudou para outro, resolve/cria a identidade do novo documento sem mexer no antigo nem em vendas.
- `lot_sale_orders`: novas colunas `exhibitor_id` (FK, null em vendas antigas), `spaces_subtotal`, `fee_admin`, `fee_ppci`, `fee_cleaning_license` (numeric default 0, check >= 0), `fees_total`. Backfill: vendas antigas → `spaces_subtotal = negotiated_total`, taxas 0. `negotiated_total` passa a ser o total final.
- `register_commercial_sale_order`: nova versão com parâmetros extras opcionais (`p_exhibitor_id`, `p_fee_admin`, `p_fee_ppci`, `p_fee_cleaning_license`) mantendo a antiga compatível. Valida: permissão, métodos permitidos em novas vendas (PIX, BOLETO_AVISTA, BOLETO_PARCELADO), PIX/à vista = 1 parcela, parcelado >= 2 e <= 36, datas válidas, taxas >= 0, subtotal recalculado pela view oficial, total = subtotal + taxas, soma exata das parcelas em centavos; `FOR UPDATE` nos lotes; idempotência mantida. Snapshot dos dados do expositor continua em `lot_sale_orders`.
- Links públicos: nenhuma RPC pública lê `commercial_exhibitors` (só `buyer_name` já autorizado).

### Frontend
- `salesTypes.ts`: métodos novos + rótulos legados para leitura; `SalesFeesDraft`; `exhibitorId`.
- `salesMoney.ts` (novo): centavos, divisão, máscara BR.
- `salesInstallments.ts`: `defaultMonthlyDay5Schedule(count, start='2026-12-05')`, split em centavos.
- `SalesBuyerForm.tsx` + novo `ExhibitorBookDialog.tsx` + hook `useExhibitorAutosave` (debounce 800 ms, só com nome+documento+celular válidos; await no "Continuar").
- `SalesPaymentForm.tsx` reescrito (taxas, seletor, aplicar parcelas, cards, rodapé de diferença); `SalesReview.tsx` em blocos; `SalesCheckoutDialog.tsx` com estado preservado entre etapas e modal com rolagem interna/altura útil (`100dvh`).
- `salesService.ts`/`useSalesCheckout.ts`: envia taxas e exhibitor_id; mensagens de erro novas.
- Consumidores: `LotSaleHistoryCard`, serviço de histórico e métricas do Dashboard — valor de espaços continua de `item_total` (preço/m² e métricas por segmento sem taxas); "total de vendas" soma `negotiated_total` por pedido distinto (taxas uma vez), nunca por item.

### Testes
Vitest para: split de centavos, sequência 05/12/2026 → 05/01/2027 → 05/02/2027, PIX/à vista 1 parcela, alternância sem sobras, taxas uma vez com vários lotes, redistribuição/edição manual, exemplo integrado (10.000 + 100 + 200 + 50 = 10.350 → 3 × 3.450), e-mail na revisão, preservação ao voltar, normalização de documento. No banco (transação desfeita, sem venda real): upsert com e sem máscara, concorrência via ON CONFLICT, idempotência, falha sem gravação parcial, soma divergente rejeitada. Playwright mobile 393 px na etapa Pagamento/Revisão. Nada publicado.
