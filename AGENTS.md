# AGENTS.md

- Mudanças de planta em segmentos do mapa comercial (ex.: Exporural 2028) arquivam lotes antigos (nunca apagam), registram origem em `map_lot_lineage` e snapshot em `map_reference_migration_snapshots` — por quê: rastreabilidade e rollback sem perder vendas/contratos.
- Lotes novos criados por reparcelamento nascem `BLOCKED` até precificação aprovada (Exporural 2028 já liberada pelo usuário em 26/09/2026) — por quê: não liberar checkout sem preço oficial.
- Identificação comercial exibida deve resolver número/quadra/segmento/pavilhão a partir de lotes e entidades persistidos, mantendo códigos técnicos e snapshots históricos distintos — por quê: renumeração não pode ser inferida de IDs nem reescrever vendas anteriores.

- Identidade visual opcional de venda fica vinculada ao pedido confirmado em bucket privado; mapas só recebem URLs temporárias após autorização por projeto ou link de escopo — por quê: evitar vazamento e aplicar a mesma imagem a todos os itens sem replicar arquivos.
