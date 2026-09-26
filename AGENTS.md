# AGENTS.md

- Mudanças de planta em segmentos do mapa comercial (ex.: Exporural 2028) arquivam lotes antigos (nunca apagam), registram origem em `map_lot_lineage` e snapshot em `map_reference_migration_snapshots` — por quê: rastreabilidade e rollback sem perder vendas/contratos.
- Lotes novos criados por reparcelamento nascem `BLOCKED` até precificação aprovada (Exporural 2028 já liberada pelo usuário em 26/09/2026) — por quê: não liberar checkout sem preço oficial.
