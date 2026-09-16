# Auditoria do Mapa Comercial — preparação do modo "Vendas"

Auditoria somente leitura. Nada foi editado, nenhuma migração aplicada, nada publicado.

## 1. Onde o modo Vendas entra

- Raiz do módulo: `src/pages/CommercialMapPage.tsx` → `CommercialMapShell` (cabeçalho) + `src/features/commercial-map/CommercialMapPage.tsx` (workspace, 681 linhas).
- O botão **Gestão** vive em `components/shell/CommercialMapHeaderTools.tsx` (popover com `managementActions`, ao lado de "Lista e tabela"). O workspace decide as permissões; o shell decide o lugar.
- A barra flutuante do 3D é `components/controls/CommercialMapTopBar.tsx` (presets de câmera, camadas, árvores, chuva, noite, validação técnica).
- Encaixe recomendado: **novo botão "Vendas" ao lado de Gestão**, em `CommercialMapHeaderTools`, ativando um novo `workspaceMode: 'sales'` (hoje `'3d' | 'list' | 'edit' | 'create'` em `types.ts`). A topbar ganha o preset visual leve; o carrinho vira painel próprio.

## 2. Seleção hoje é estritamente única

Em `state/useCommercialMapStore.ts`:
- `selectedEntityId: string | null` (lotes externos e entidades) e `selectedModuleId: string | null` (módulos internos dos pavilhões) — dois caminhos separados, ambos單 singulares.
- `setSelectedEntityId` limpa interior e abre o painel `details`; `enterInterior` / `exitInterior` controlam a entrada nos pavilhões e zeram `selectedModuleId`.
- Não existe nenhuma estrutura de multi-seleção. Será necessário um conjunto novo (`salesSelection: Map<lotId, snapshot>`) **paralelo**, sem alterar a seleção atual, para não quebrar painéis, câmera e explorer.

## 3. Renderer e ambientação

- Canvas: `components/canvas/CommercialMapCanvas.tsx` (5.269 linhas) e `CommercialMapEnvironment.tsx` (1.696).
- Lotes externos e módulos: `CommercialPavilionModuleLayer.tsx`, `CommercialPavilion.tsx`, `CommercialPavilionInteriorScene.tsx`.
- Ambientação pesada (candidata a desligar no modo Vendas): `CommercialTreeLayer`, `VegetationPilot*`, `AmusementPark*`, `ExporuralActivity`, `LivestockCattle`, `NationsDistrict`, `LateralResidentialDistrict`, `RegionalLandscapeLayer`, `TerritorialEnvironment`, `CommercialMapRainLayer`, `NightLightingLayer`, `LunarRocketLaunchEffects`, `StrategicLandmarks`, `FenasojaComplexOverlay`.
- Já existe uma flag de qualidade: `reducedGraphics` no store + `CommercialMapAdaptiveQuality.tsx`. O modo Vendas deve **reutilizar** essa flag e somar um `salesModeActive` que oculta camadas de ambientação — sempre por visibilidade de camada, nunca mexendo em geometria ou dados.
- Manter sempre: ruas (`RoadInfrastructure`), pavilhões, quadras, rótulos e referências de orientação.

## 4. Filtros, segmentos e entrada nos pavilhões

- Segmentos: `data/commercialMapSegments.ts`, `components/segments/SegmentLegend.tsx`, `utils/areaScope.ts` (Exporural vs geral).
- Filtros: `statusFilters`, `classificationFilters`, `verificationFilters`, `locationFilter`, `search` no store; dock com seções `search | area | segments | view | filters | management`.
- Entrada no pavilhão: `enterInterior(entityId)` + `useInteriorCameraRequest`. O carrinho de vendas precisa **sobreviver** a entrar/sair de pavilhões e trocar de segmento.

## 5. Banco: o que já existe e o que falta

Existe (confirmado no banco):
- `lot_sales`: `lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, contract_number, payment_status, internal_notes, status, reverted_at/by`.
- `lot_reservations` (com `phone`, `email`, `expires_at`), `lot_negotiations`, `lot_contracts` (+ `lot_contract_versions`), `lot_prices` (agora com `source, stage, rule_id, area_used_sqm`), `lot_status_history`.
- RPCs: `reserve_commercial_lot`, `start_commercial_negotiation`, `register_commercial_sale`, `update_commercial_lot`, `register_lot_contract_version`, `apply_lot_price_rules_2028`.
- Serviços: `services/commercialMapService.ts` (linhas ~1018–1090) e `components/commercial/LotWorkflowDialog.tsx`.

Falta para o modo Vendas (tudo **um lote por vez** hoje):
- Agrupador de venda: uma tabela `lot_sale_orders` (comprador/expositor, CPF/CNPJ, celular, e-mail, etapa `RENOVACAO|SEGUNDA_ETAPA`, área total, valor total, condição à vista/parcelado, nº de parcelas, método, 1º vencimento, observações, status, autor, timestamps) e `lot_sale_order_items` (lote, snapshot de área oficial, preço/m², regra aplicada, valor do item) — o vínculo com `lot_sales` mantém o histórico por lote intacto.
- Parcelas: `lot_sale_installments` (nº, vencimento, valor, status de pagamento).
- Uma RPC transacional `register_commercial_sale_order(...)` que valide e grave tudo num único bloco.

## 6. Permissões

`utils/permissions.ts` já entrega `canManageSales` (`map.manage_sales`, ou admin/gestor). Recomendação: **reutilizar `canManageSales`** para abrir o modo Vendas e concluir a venda; nenhuma capability nova é necessária. As RLS das novas tabelas devem espelhar as de `lot_sales`, com `GRANT` explícito para `authenticated` e `service_role`.

## 7. Riscos de vender vários lotes de uma vez

- **Atomicidade:** venda multi-lote precisa ser uma única RPC `SECURITY DEFINER`; nada de N chamadas do cliente.
- **Concorrência:** `SELECT ... FOR UPDATE` nos lotes na ordem do `id` para evitar deadlock; reconferir status dentro da transação.
- **Estado inválido:** lote `SOLD`, `BLOCKED` ou reservado por terceiro aborta a operação inteira com mensagem por lote (nunca venda parcial silenciosa).
- **Preço:** a etapa (Renovação / 2ª Etapa) é escolhida uma vez por venda; o valor de cada item é recalculado no servidor pela view `commercial_lot_pricing_2028` — o total do cliente é apenas conferência.
- **Snapshot:** gravar área, preço/m², regra e etapa no item; mudanças futuras de regra não podem reescrever vendas passadas.
- **Pavilhão 7 (B10):** permanece sem preço → não pode entrar no carrinho.
- **Idempotência:** chave de operação enviada pelo cliente, com unicidade no banco, para evitar duplicidade por duplo clique/reenvio.
- **Rollback:** reversão pelo caminho já existente (`reverted_at/by`), aplicada à ordem inteira.

## 8. Performance

Modo Vendas ativa um perfil leve: força `reducedGraphics`, desliga árvores/vegetação, pessoas, gado, parque de diversões, chuva, noite, amanhecer, lançamento lunar e overlays decorativos; reduz sombras e pós-processamento. Mantém ruas, pavilhões, quadras, rótulos e realce de seleção. Tudo por flags de visibilidade — nenhuma geometria, posição ou dado é tocado.

## 9. UI — carrinho sem poluir o mapa

- Desktop: painel lateral fixo à direita (mesma linguagem Liquid Glass de `MapPanels.tsx` / `lot-pricing-2028.css`), com lista de lotes, área total, total por etapa e botão "Finalizar venda".
- Mobile (320–430px): barra resumo fixa no rodapé ("N lotes · área · total") que abre uma gaveta, no padrão de `CompactDetailSheet.tsx`.
- Finalização em diálogo de duas etapas: dados do expositor → condições de pagamento → revisão e confirmação.

## 10. Arquivos que serão tocados

Novos: `features/commercial-map/sales/` (store slice, tipos, serviço, hook), `components/sales/SalesCart.tsx`, `SalesCheckoutDialog.tsx`, `SalesModeOverlay.tsx`, `sales-mode.css`; testes em `src/test/`. Migração com `lot_sale_orders`, `lot_sale_order_items`, `lot_sale_installments`, RLS/GRANT e a RPC transacional.

Alterados: `state/useCommercialMapStore.ts` (modo + seleção múltipla), `types.ts` (`MapWorkspaceMode`), `components/shell/CommercialMapHeaderTools.tsx` (botão Vendas), `controls/CommercialMapTopBar.tsx`, `CommercialMapPage.tsx` (workspace), `CommercialMapCanvas.tsx` / `CommercialMapEnvironment.tsx` (perfil leve + clique de seleção múltipla), `CommercialPavilionModuleLayer.tsx`, `panels/PavilionModuleCard.tsx` e `panels/MapPanels.tsx` (ação "Adicionar à venda"), `services/commercialMapService.ts`.

## Invariantes

Nenhuma alteração em áreas oficiais, geometrias, posições, numeração, segmentos ou `area_validation_status`; Pavilhão 7 continua sem preço e fora do carrinho; preço manual nunca sobrescrito; vendas existentes preservadas; sem taxas adicionais (PPCI, limpeza, licença); nada publicado sem pedido explícito.

## Fluxo de venda sugerido

1. Abrir **Vendas** → mapa em modo leve.
2. Escolher a etapa (Renovação ou 2ª Etapa).
3. Clicar nos lotes externos e nos módulos internos — cada clique soma ao carrinho.
4. Conferir área total e valor total no painel.
5. "Finalizar venda" → dados do expositor (nome/empresa, CPF/CNPJ, celular, e-mail).
6. Condições: à vista ou parcelado, nº de parcelas, método, primeiro vencimento.
7. Revisão lote a lote → confirmar.
8. Servidor valida, trava, grava a ordem, os itens, as parcelas e o histórico por lote; os lotes passam a VENDIDO no mapa.

## Próximo passo

Se aprovar esta direção, o próximo passo é o plano de implementação detalhado (banco primeiro, depois seleção múltipla, depois modo visual e checkout).
