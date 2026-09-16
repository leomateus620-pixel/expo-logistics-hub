# Modo VENDAS no Mapa Comercial — Fenasoja 2028

Novo modo operacional dentro do próprio Mapa Comercial: seleção de vários espaços, soma automática de áreas e valores pela etapa comercial, e fechamento da venda em uma única operação atômica.

## Estado atual confirmado (leitura)

- O botão **Gestão** vive em `components/shell/CommercialMapHeaderTools.tsx`, ao lado de "Lista e tabela"; as ações vêm de `CommercialMapPage.tsx:360-472`.
- A seleção é **única**: `selectedEntityId` e `selectedModuleId` (escalares) em `state/useCommercialMapStore.ts`. Não existe multi-seleção.
- Já existe `reducedGraphics` no store + `CommercialMapAdaptiveQuality` (governador de qualidade), sem botão de usuário.
- Ambientação pesada: `CommercialTreeLayer`, `VegetationPilot*`, `AmusementPark*`, `ExporuralActivity`, `LivestockCattle`, `NationsDistrict`, `LateralResidentialDistrict`, `RegionalLandscapeLayer`, `TerritorialEnvironment`, `CommercialMapRainLayer`, `NightLightingLayer`, `LunarRocketLaunchEffects`, `StrategicLandmarks`.
- Entrar/sair de pavilhão: `enterInterior` / `switchInterior` / `exitInterior`; módulos por `pavilionModuleCommercial.ts`.
- Banco: `lot_sales`, `lot_reservations`, `lot_negotiations`, `lot_contracts`, `lot_prices` (com `source/stage/rule_id/area_used_sqm`), `lot_status_history`; RPCs `reserve_commercial_lot`, `start_commercial_negotiation`, `register_commercial_sale` — todas **um lote por vez**. Não há agrupador de venda nem parcelas.
- `canManageSales` (`map.manage_sales`) existe em `utils/permissions.ts` e hoje só é lido em `MapPanels.tsx` / `PavilionModuleCard.tsx`.
- A view `commercial_lot_pricing_2028` já entrega área oficial, preço/m² e total nas duas etapas; Pavilhão 7 (B10) sai como EXCLUÍDO.

## Etapa 1 — Banco (migração)

Três tabelas novas no padrão do projeto (RLS + GRANT para `authenticated` e `service_role`):

- `lot_sale_orders`: projeto, comprador, CPF/CNPJ, celular, e-mail, etapa, área total, valor total, tipo de pagamento, nº de parcelas, método, primeiro vencimento, status, observações, vendedor, `idempotency_key` único, timestamps, reversão.
- `lot_sale_order_items`: ordem, lote, snapshot de área oficial, preço/m², regra aplicada, etapa, total do item, status anterior do lote. Unicidade por `(order_id, lot_id)`.
- `lot_sale_installments`: ordem, número, vencimento, valor, situação de pagamento, pago em, observações.

RPC `register_commercial_sale_order(...)` `SECURITY DEFINER`, transacional:
valida sessão e `map.manage_sales` → trava os lotes com `SELECT ... FOR UPDATE` em ordem de `id` → reconfere existência, não arquivado e status elegível → **recalcula os preços no servidor** pela view (nunca aceita o total do cliente) → compara com o total enviado e aborta em divergência → cria ordem, itens e parcelas → grava um `lot_sales` por lote (histórico individual preservado) → atualiza status para `SOLD` → registra `lot_status_history` e log de atividade. Qualquer falha derruba a operação inteira. Reenvio com a mesma `idempotency_key` devolve a ordem já criada, sem duplicar.

Regras dentro da RPC: Pavilhão 7 e qualquer lote sem preço resolvido são rejeitados com motivo; preço de origem `MANUAL` é respeitado e nunca sobrescrito; nenhuma taxa é somada.

## Etapa 2 — Estado e seleção múltipla

Novo módulo `src/features/commercial-map/sales/`:

- `salesTypes.ts`, `salesValidation.ts` (CPF/CNPJ, celular BR), `salesPricing.ts` (soma item a item, centavos inteiros; nunca área total × um preço único), `salesInstallments.ts` (cronograma mensal com ajuste do centavo na última parcela para `Σ parcelas = total`).
- `useSalesSelection.ts` — slice próprio no store: `salesModeActive`, `salesStage` ('RENOVACAO' | 'SEGUNDA_ETAPA'), `salesSelection` (mapa lotId → snapshot). Clicar adiciona, clicar de novo remove; a seleção sobrevive a troca de quadra, segmento e entrada/saída de pavilhão. Só some ao limpar, sair do modo ou concluir.
- `salesService.ts` + `useSalesCheckout.ts` — leitura em lote da view de preços e chamada única da RPC, com invalidação das queries do mapa ao concluir.

`types.ts` ganha `'sales'` em `MapWorkspaceMode`. A seleção atual (`selectedEntityId` / `selectedModuleId`) fica intacta.

## Etapa 3 — Modo visual comercial

`salesModeActive` liga um perfil leve: força `reducedGraphics`, desliga árvores, vegetação, pessoas, gado, parque de diversões, chuva, noite, amanhecer, lançamento lunar e overlays decorativos; mantém terreno, ruas, quadras, pavilhões, lotes, módulos, rótulos e marcos úteis de orientação. Tudo por visibilidade de camada — nenhuma geometria, posição ou dado é alterado, e sair do modo restaura o estado anterior.

Leitura comercial reforçada: contorno mais forte por lote e estados visuais distintos (disponível, hover, selecionado, reservado, em negociação, vendido, bloqueado), diferenciados por cor **e** opacidade, espessura de borda e marcação de status — o mesmo vale para os módulos internos.

## Etapa 4 — Carrinho e checkout

- `SalesMode.tsx`, `SalesCart.tsx`, `SalesCartItem.tsx`, `SalesCheckoutDialog.tsx`, `SalesBuyerForm.tsx`, `SalesPaymentForm.tsx`, `SalesReview.tsx`, `sales-mode.css`.
- Desktop: painel lateral direito compacto — etapa, contagem, lista (identificação, área, valor), área total, valor total em destaque, "Finalizar venda", remover item e limpar seleção.
- Mobile (320/360/390/430): barra fixa inferior "3 lotes • 418,20 m² • R$ 20.271,00" que abre gaveta no padrão de `CompactDetailSheet.tsx`.
- Checkout em três passos: expositor → pagamento (à vista ou parcelado, método, vencimentos, cronograma automático) → revisão e **Confirmar venda**, com botão bloqueado durante o envio.
- Pavilhão 7 aparece como "Valor ainda não definido" e impede a finalização, explicando o motivo.

## Etapa 5 — Integração e permissões

Botão **Vendas** ao lado de Gestão em `CommercialMapHeaderTools.tsx`, visível com `canManageSales`; ações "Adicionar à venda" em `MapPanels.tsx` e `PavilionModuleCard.tsx`; cliques de seleção múltipla em `CommercialMapCanvas.tsx` e `CommercialPavilionModuleLayer.tsx` quando o modo está ativo. Nenhuma capability nova.

## Etapa 6 — Testes e auditoria

Testes de seleção (adicionar, remover, limpar, não duplicar, sobreviver ao pavilhão), de cálculo (somas, etapas, esquina + comum, centavos), de parcelas (à vista, 2, 3, diferença de R$ 0,01, soma exata), de Pavilhão 7 bloqueado e da RPC (lote vendido/reservado durante o checkout, duplo clique, rollback, idempotência) em ambiente isolado. Verificação visual desktop e mobile, comparação de desempenho mapa normal × modo Vendas, e auditoria final confirmando que quantidade de lotes, áreas, geometrias, IDs, numeração, regras de preço e classificação de esquina permanecem idênticas.

## Invariantes

Área oficial, geometria, posição, numeração, segmentos e `area_validation_status` nunca mudam; Pavilhão 7 continua sem valor e nunca vira R$ 0,00; preço manual nunca é sobrescrito; total do cliente nunca é autoridade; sem venda parcial; sem taxas (PPCI, limpeza, administrativa, licença); histórico de preço e de venda preservados. Nada publicado em produção.
