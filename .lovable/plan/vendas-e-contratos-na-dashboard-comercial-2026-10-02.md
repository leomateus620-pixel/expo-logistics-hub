# Vendas e contratos na Dashboard Comercial

## O que o usuário verá
- Nova seção "Vendas e contratos" na Dashboard, abaixo dos indicadores atuais (que continuam como estão).
- Uma linha por pedido: nome fantasia (ou razão social), referência, data, situação, nº de espaços, valor negociado registrado ("Não é receita recebida"), forma de pagamento, resumo documental e botão "Ver lotes no mapa".
- Pedidos diferentes do mesmo expositor ficam em linhas separadas. Vendas antigas sem pedido aparecem como "Registro legado".
- Busca (expositor, referência, contrato, espaço) e filtros (situação, com/sem arquivo, forma de pagamento, período), com paginação e estados distintos de carregamento, vazio, erro e acesso restrito.
- Ao expandir: Expositor, Espaços (identificação oficial, setor/pavilhão, área, situação de cada item), Condições (subtotal, três taxas, total gravado; em cancelamento parcial, total original + subtotal ativo separado), Pagamento (parcelas, vencimentos, situação gravada), Contratos e documentos.
- Selos separados para: pedido registrado, assinatura confirmada (ex.: "3 de 5 assinados"), arquivo anexado e pagamento recebido.
- "Anexar contrato" (somente quem tem gestão de contratos): escolher "Toda a venda" ou espaços específicos; PDF/DOCX até 15 MB; barra de progresso; nova versão mantém histórico. Anexar não confirma assinatura nem pagamento.
- "Ver lotes no mapa": a dashboard se recolhe, o mapa enquadra todos os espaços da venda com destaque próprio (sem usar o carrinho), e um painel compacto "Venda selecionada" mostra expositor, referência, espaços por setor/pavilhão, "Visão geral da venda", entrada em cada pavilhão e "Voltar à dashboard" — que restaura busca, filtros, página, pedido expandido, rolagem e foco.

## Etapas
1. Banco (uma migração):
   - `lot_contracts`: colunas opcionais `order_id` e `scope` (`LOT` | `ORDER_ITEMS`); `lot_id` passa a ser opcional apenas quando há `order_id`.
   - Nova tabela de ligação `lot_contract_lots` (contrato ↔ lote), com GRANTs e RLS espelhando as regras atuais de contratos. Documentos antigos por lote ficam como estão (lidos como abrangência de um lote).
   - RPC `list_commercial_sale_orders` (paginada, com busca/filtros, escopo de projeto validado no servidor, devolve resumos já agregados — sem consulta por linha) incluindo registros legados de `lot_sales` sem pedido.
   - RPC `get_commercial_sale_order_detail` (itens, parcelas, contratos/versões e abrangência) sob demanda.
   - RPC `attach_order_contract` (valida `map.manage_contracts`, organização, que os lotes pertencem ao pedido e que o arquivo existe no bucket privado; cria/versiona contrato e ligações em transação; registra auditoria). Não altera preço, status, assinatura nem pagamento.
   - Nada é exposto às funções públicas do mapa.
2. Serviços e consultas: `salesOrdersService.ts` + hooks React Query com chaves próprias; upload reutiliza `validateContractFile` e o bucket privado atual; URLs temporárias renovadas ao expirar; invalidação após anexar mantendo a linha expandida.
3. Interface da Dashboard: `CommercialSalesOrdersSection` (lista, filtros, paginação, linha expansível, painéis de detalhe, diálogo de anexação), responsiva para desktop e celular. Estado da seção guardado num store leve fora da dashboard para sobreviver ao fechamento.
4. Inspeção no mapa: novo estado `saleInspection` (pedido, expositor, lista de lot.id → entity.id → pavilhão proprietário), independente do carrinho.
   - Só externos: enquadrar a união das geometrias reais com folga para painéis/mobile.
   - Só um pavilhão: entrar no pavilhão pelo pedido interno existente (`useInteriorCameraRequest`) e enquadrar os módulos quando a geometria interna estiver pronta.
   - Misto/vários pavilhões: visão geral com lotes externos destacados e pavilhões marcados com contagem de módulos; entrada por grupo mantendo a venda.
   - Espaços não localizados: aviso com quantidade e identificação pendente.
   - Uma nova seleção cancela a transição anterior; respeita redução de movimento; destaque calculado uma vez por seleção (sem varrer inventário a cada quadro, sem novo Canvas/câmera).
   - Clicar num lote abre sua ficha sem perder o contexto da venda.
5. Testes e verificação: agregação (um lote, vários lotes, mesmo expositor com dois pedidos, parcial assinado/cancelado, legado, sem arquivo, documento compartilhado), serviço de anexação (sucesso, falha, nova versão), resolução de grupos de enquadramento (externos próximos/separados, um pavilhão, misto, números repetidos), restauração de contexto, e consultas no banco confirmando bloqueio sem permissão e ausência nos links públicos. A conferência visual 3D pode continuar limitada, pois o mapa não termina de carregar no navegador automatizado — isso será informado.

## Fora do escopo
Sem alterar preços, parcelas, status, assinaturas, geometria, rotas, RLS existente ou links públicos; sem vendas de teste reais; sem publicar.

## Detalhes técnicos
- Agrupamento sempre por `order_id`; legados por `lot_sales.id` com flag `legacy`.
- Estados de item: `PENDING_SIGNATURE`, `SIGNED`, `CANCELLED`, `LEGACY_UNVERIFIED`; status `CONFIRMED` do pedido nunca é usado sozinho como prova de assinatura.
- Pagamento recebido = parcelas com `payment_status` pago/`paid_at` gravados.
- Permissões: `canManageSales` / `canManageContracts` de `utils/permissions.ts`, revalidadas nas RPCs SECURITY DEFINER com `search_path` fixo.
- Registrar no AGENTS.md a regra de documento por pedido com abrangência explícita.
