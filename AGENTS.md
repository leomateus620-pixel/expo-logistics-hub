# AGENTS.md

- Mudanças de planta em segmentos do mapa comercial (ex.: Exporural 2028) arquivam lotes antigos (nunca apagam), registram origem em `map_lot_lineage` e snapshot em `map_reference_migration_snapshots` — por quê: rastreabilidade e rollback sem perder vendas/contratos.
- Lotes novos criados por reparcelamento nascem `BLOCKED` até precificação aprovada (Exporural 2028 já liberada pelo usuário em 26/09/2026) — por quê: não liberar checkout sem preço oficial.
- Identificação comercial exibida deve resolver número/quadra/segmento/pavilhão a partir de lotes e entidades persistidos, mantendo códigos técnicos e snapshots históricos distintos — por quê: renumeração não pode ser inferida de IDs nem reescrever vendas anteriores.

- Identidade visual opcional de venda fica vinculada ao pedido confirmado em bucket privado; mapas só recebem URLs temporárias após autorização por projeto ou link de escopo — por quê: evitar vazamento e aplicar a mesma imagem a todos os itens sem replicar arquivos.
- Espaços comerciais sem número podem manter `lot_number` nulo e uma faixa de preço explícita independente do número — por quê: a área de 568,78 m² da Expo Rural deve ser vendável sem inventar identidade ou mudar os preços das demais parcelas.
- A cena externa e o corte dos pavilhões não montam atlas numéricos permanentes; a identificação contextual usa a seleção, enquanto a planta interna detalhada conserva sua numeração — por quê: manter o mapa navegável sem poluição e preservar a leitura da planta interna.
- Fluxo comercial em quatro fases: vendas (checkout e registro individual) criam Venda em aberto (`SALE_OPEN`, amarelo, `lot_sales.status=OPEN`, item `PENDING_SIGNATURE`); só `confirm_sale_order_items` (permissão map.manage_sales, idempotente) marca Vendido azul; `cancel_sale_order_items` devolve a Disponível sem apagar histórico; os 57 itens históricos ficam `LEGACY_UNVERIFIED` e continuam SOLD — por quê: anexar contrato não comprova assinatura e venda aberta nunca é receita realizada.
<!-- LOVABLE:BEGIN -->
- Prévia pública: imagem por área e metadados de escopo somente após validar o token; nunca incluir comprador nem token na imagem — por quê: proteger links revogados e dados comerciais.
<!-- LOVABLE:END -->
- Acesso de comissão a segmento do mapa (`map_can_access_segment`) depende só de segmento ativo + capability; completude é estrutural (lotes com geometria), sem contagens fixas de baseline, e a view `commercial_lot_pricing_2028` é security_invoker — por quê: reparcelamentos não podem derrubar portais nem expor preços de outros segmentos.
