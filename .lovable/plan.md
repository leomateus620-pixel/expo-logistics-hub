# Nome fantasia e edição dos dados do expositor

Objetivo: corrigir a identificação do expositor uma única vez e vê-la igual no mapa, nos pavilhões, nos painéis, nas pesquisas e nos links públicos. A razão social continua sendo a identidade legal, usada em documentos e contratos.

## O que muda para o usuário
1. **Novo campo "Nome fantasia (opcional)"** logo abaixo de "Nome / Razão social", com o texto de apoio pedido. Aparece no cadastro da venda, na escolha de expositor já cadastrado (que traz os dois nomes), na revisão e na edição. O campo não é obrigatório.
2. **Botão "Editar dados do expositor"** nas fichas de lotes em Venda em aberto e Vendido, inclusive nos módulos dos pavilhões. Só aparece para quem pode gerenciar vendas. Permite corrigir razão social, nome fantasia, CPF/CNPJ, celular e e-mail, com as validações atuais.
   - Mostra todos os espaços do pedido que serão atualizados.
   - Uma opção separada e explícita: "Atualizar também o cadastro do expositor para futuras vendas". Vem desmarcada.
   - Nada é salvo antes de "Salvar alterações". Se houver mudanças, Cancelar ou fechar pede confirmação antes de descartar. Durante o envio aparece "Salvando…"; em caso de falha, os dados digitados continuam no formulário.
   - Vendas antigas sem pedido ou sem expositor vinculado também podem ser corrigidas, sem criar pedidos fictícios.
3. **Nome exibido = nome fantasia** quando preenchido; caso contrário, a razão social. Nos detalhes internos, o nome fantasia aparece em destaque e a razão social logo abaixo.
4. **Pesquisa interna** encontra pelos dois nomes, sem diferenciar maiúsculas, acentos ou espaços.
5. **Pesquisa pública** busca só pelo nome exibido autorizado e pelos identificadores dos lotes. Nenhum documento ou contato entra na busca pública.

## Regras preservadas
- Nunca gravar nome fantasia no lugar da razão social. Registros antigos ficam vazios, sem nomes inventados nem cópia da razão social.
- Apagar o nome fantasia, ou deixar só espaços, remove o valor e volta a mostrar a razão social.
- Os links públicos só mostram o comprador quando o lote está realmente Vendido e a venda foi confirmada. Vendas em aberto continuam sem nome público.
- A edição não altera estado, datas, preços, taxas, parcelas, áreas, geometria nem contratos já emitidos. Vendas canceladas ou revertidas não são reescritas, e outros pedidos do mesmo expositor não mudam.

## Validação
- Testes automatizados: regra do nome exibido, pesquisa pelos dois nomes, payloads, editor (cancelar sem salvar, envio duplo bloqueado, erro preserva os dados), apresentação pública sem dados privados.
- Conferência no banco, sem criar vendas reais. Permissão e organização verificadas dentro de uma transação de teste desfeita ao final (sem permissão, outra organização, venda cancelada, alteração concorrente). Também a contagem da coluna nova (todos os registros antigos vazios) e a resposta pública sem campos privados.
- Limitação conhecida: o mapa 3D não carrega nos testes automáticos do navegador, então a conferência visual das fichas no mapa pode ficar pendente.
- Não publicar.

## Detalhes técnicos
**Banco (uma migração):**
- Novas colunas `commercial_exhibitors.trade_name`, `lot_sale_orders.buyer_trade_name` e `lot_sales.buyer_trade_name` (text, nulas). Não usar `venue_stakeholders.trade_name`.
- Funções `register_commercial_sale_order` e `register_commercial_sale` (caminho legado) recriadas com o novo parâmetro `p_buyer_trade_name` opcional e no final, gravado direto no pedido e na venda, mesmo sem `exhibitor_id`. A assinatura antiga é removida para não ficar ambígua.
- `upsert_commercial_exhibitor` ganha `p_trade_name`.
- Função auxiliar `commercial_buyer_display_name(trade, legal)` usando `NULLIF(btrim(trade), '')`, com fallback para a razão social.
- Nova RPC `update_sale_exhibitor_identity(p_lot_sale_id, p_expected_updated_at, p_buyer_name, p_buyer_trade_name, p_document, p_phone, p_email, p_update_exhibitor bool, p_request_id)`:
  - Roda como SECURITY DEFINER e confere organização e `map.manage_sales`.
  - Trava com `FOR UPDATE` o pedido e as vendas OPEN/CONFIRMED do pedido. Se o estado ou `updated_at` mudou, retorna conflito.
  - Atualiza tudo em uma única transação. Só altera o cadastro central se `p_update_exhibitor` for verdadeiro.
  - Registra em `map_activity_logs` (`SALE_EXHIBITOR_EDITED`): autor, campos alterados (antes/depois) e registros afetados.
  - O `p_request_id` garante que um reenvio retorne o mesmo resultado (recibo em tabela existente de recibos ou em nova coluna idempotente, conforme o padrão já usado nas vendas). Retorna os registros salvos.
- `public_map_inventory`, `public_map_lot` e `public_map_scope_revision`: `buyerName` passa a ser o nome exibido, mantendo o mesmo formato de resposta. Continua exigindo SOLD e CONFIRMED. Alterar o nome muda a revisão, então os links existentes atualizam normalmente.

**Frontend:**
- Novo `utils/buyerDisplayName.ts`, usado por `commercialMapService` (currentBuyer + legal), `lotTooltipPresentation`, `MapPanels`, `PavilionModuleCard`, `SaleOpenSection`, `LotSaleHistoryCard`, `entityExplorer` (busca com `textNormalize`), `ExhibitorBookDialog`/`matchesExhibitor` e `CommercialMapCanvas`.
- `SalesBuyerDraft.tradeName`: atualizar `SalesBuyerForm`, `SalesReview`, `salesService` e `exhibitorService`. Em `useExhibitorAutosave`, só o fluxo de nova venda; o editor não usa autosave.
- Novo `SaleExhibitorEditDialog` (não reutiliza `LotEditDialog`), com mutação travada por ref e tratamento de resposta incerta: consulta o estado salvo antes de declarar sucesso. Ao salvar, invalida as consultas do mapa, do histórico da venda, do pedido e dos expositores, preservando câmera e seleção.
- Público: `publicMapService`, `PublicLotList` (busca pelo nome exibido) e `PublicLotDetails` seguem usando `buyerName`, que já chega resolvido.
- Atualizar `AGENTS.md` com a regra do nome exibido.
