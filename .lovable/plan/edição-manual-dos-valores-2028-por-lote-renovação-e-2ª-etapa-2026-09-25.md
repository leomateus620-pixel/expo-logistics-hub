# Edição manual dos valores 2028 por lote (Renovação e 2ª Etapa)

## Diagnóstico da fonte atual (confirmado)
- Todos os valores oficiais vêm de uma única leitura no banco: `commercial_lot_pricing_2028`.
- Ela calcula, por lote e etapa: regra ativa de `commercial_price_rules` (pavilhão, quadra, faixa, esquina, prioridade) → preço/m² → total = área oficial × preço/m². P7 = EXCLUIDO.
- Essa mesma leitura alimenta: sidebar/tooltip (`fetchLotPricing2028`), carrinho do Modo Vendas (`summarizeCart`), checkout/registro de venda (`register_commercial_sale_order`), links públicos (`public_map_inventory`, `public_map_lot`, `public_map_scope_revision`) e o Dashboard.
- A venda grava seu próprio valor em `lot_sale_order_items.item_total` / `pricing_stage` e `lot_sales.negotiated_value` — ou seja, já existe snapshot histórico.

## Estratégia: override manual dentro da mesma fonte
```text
regra oficial (commercial_price_rules)  -> valor padrão
override do lote/etapa (se existir)     -> valor efetivo
commercial_lot_pricing_2028             -> única saída lida por todo o sistema
```
- Nova tabela de overrides por lote+etapa (um registro ativo por par), guardando o total manual. Não é uma segunda fonte: a leitura oficial passa a considerá-la, e nenhuma tela lê a tabela diretamente.
- Regras globais do pavilhão/quadra nunca são alteradas.
- Com override: total = valor manual; preço/m² = total ÷ área oficial (2 casas); rótulo da regra indica "Valor manual"; o valor padrão calculado continua disponível para referência e para "restaurar padrão".
- Zero é aceito e exibido como `R$ 0,00`; não muda status, elegibilidade nem disponibilidade. P7 continua EXCLUIDO (edição não oferecida lá).
- Override também faz o lote com SEM_REGRA naquela etapa ter valor válido; área ausente mantém preço/m² vazio, mas total manual é aceito.

## Segurança e permissões
- Gravação apenas por função segura no servidor, que valida: usuário autenticado, membro ativo da organização do lote e com permissão de edição do mapa (admin/gestor ou capabilities `map.edit`, `map.manage_lots`, `map.admin`, `full_access`) — mesma regra usada hoje no front.
- Valor validado: ≥ 0, até 2 casas, limite superior razoável.
- Leitura pela view já existente; links públicos continuam passando pelas funções públicas, que recebem o novo total automaticamente e mudam a revisão (atualização em até ~15–30 s).
- Ícone de edição só aparece para quem tem `canEditPricing`; usuários de visualização (ex.: Eduardo) não veem nem conseguem gravar.

## Lotes vendidos
- A venda registrada não é alterada: `item_total`, `pricing_stage` e `negotiated_value` permanecem como snapshot.
- "✓ Confirmado" continua vindo da etapa gravada na venda.
- No lote vendido, o card mostra o preço comercial atual e, quando diferente, uma linha discreta "Vendido por R$ X" no card confirmado, evitando confusão.

## Histórico e auditoria
- Cada salvamento registra em `map_activity_logs` (já exibido na aba Histórico): lote, etapa, valor anterior → novo, usuário, data/hora; também em `audit_log`.
- Histórico mostra: "Valor da 2ª Etapa alterado · R$ 5.400,00 → R$ 5.850,00 · Leonardo · 24/09/2026 22:41". Restaurar padrão também é registrado.

## Interface (sem mudar o layout aprovado)
- Ícone ✎ pequeno no título de cada card (Renovação / 2ª Etapa).
- Ao clicar, só aquele card vira edição inline: campo monetário BR (`inputMode="decimal"`), prévia do preço/m² recalculado, `Salvar`, `Cancelar`, e "Restaurar valor oficial" quando houver override.
- Carregamento no botão, toast de sucesso/erro, proteção contra duplo clique; Esc cancela, Enter salva.
- Mobile: campo largo com alvo de 44 px, botões visíveis sem overflow, cards empilhados.

## Sincronização
- Após salvar: invalidar o prefixo `commercial-map` (pricing do lote, mapa de preços do carrinho, dashboard, inventário) → sidebar, tooltip, carrinho, checkout e dashboard atualizam sem F5. Links públicos atualizam pelo polling existente via mudança de revisão.
- Checkout continua recalculando no servidor pela mesma view, então o carrinho e a venda nunca divergem.

## Detalhes técnicos
1. Migração:
   - `commercial_lot_price_overrides (id, lot_id, stage check in RENOVACAO/SEGUNDA_ETAPA, total numeric(14,2) >= 0, previous_total, updated_by, created_at, updated_at, unique(lot_id, stage))`; GRANTs (select a authenticated, all a service_role), RLS com leitura para quem pode ver o mapa; sem insert/update direto.
   - `CREATE OR REPLACE VIEW commercial_lot_pricing_2028` mantendo colunas existentes e acrescentando `renovacao_default_total`, `segunda_default_total`, `renovacao_is_manual`, `segunda_is_manual`; totais/preço-m²/resolution_status passam a usar COALESCE(override, regra).
   - RPC `set_lot_price_override(p_lot_id, p_stage, p_total, p_expected_updated_at)` e `clear_lot_price_override(...)`, SECURITY DEFINER, `search_path` fixo, grava log/auditoria. Recompilar funções dependentes se necessário (sem alterar assinaturas).
2. Front:
   - `lotPricing2028Service`/tipos: novos campos; `lotPricingOverrideService` + hook `useUpdateLotPrice` com invalidação.
   - `resolveMapPermissions`: `canEditPricing`.
   - `LotPricing2028Panel`: modo de edição inline no `StageBlock`, prop `canEdit`, linha "Vendido por".
   - Histórico: formatter do novo tipo de evento.
3. Testes: cálculo preço/m² a partir do total manual (450 m² × R$ 5.850 → R$ 13,00), zero aceito sem mudar status, permissão oculta ícone, carrinho usa override, venda antiga intacta; tipos e build.
4. Nada publicado; nenhuma venda real alterada.
