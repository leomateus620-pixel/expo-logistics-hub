# Fechar a cadeia do Mapa Comercial e liberar os portais Exporural e Indústria

Entrega única: aplicar a migration que falta, semear o projeto cartográfico, conferir os inventários oficiais e validar os dois portais com dados reais.

## Estado confirmado agora

- `map_segments` ainda **não existe** (`to_regclass` retorna vazio).
- `map_projects`, `map_entities` e `commercial_lots` estão com **0 linhas** — nenhum projeto cartográfico semeado.
- `apply_exporural_reference_2026` e `rollback_exporural_reference_2026` já existem no banco (migration anterior aplicada).
- O arquivo `20260804090000_create_commission_map_segments.sql` tem 1.481 linhas: 1 tabela, índices, ~20 funções, triggers, revokes, 10 policies de segmento e `validate_commercial_map_segments`.

## Etapas

### 1. Aplicar `20260804090000_create_commission_map_segments.sql`
Submetida em blocos coerentes para aprovação, na ordem do arquivo:
1. `map_segments` + índices únicos + GRANTs (`authenticated` select, `service_role` all) + guard de projeto.
2. Funções de capability e `ensure_commission_map_segments` (+ trigger em `map_projects`).
3. Classificação canônica: `resolve_commission_map_segment_slug`, `map_entity_inherits_segment`, `set_map_entity_canonical_segment`, guards de ciclo de vida e sincronização lote→entidade.
4. Linhagem: herança em `map_lot_lineage`, `reconcile_commission_map_lineage`, revoke de DML direto.
5. Inventário: baselines, delta de linhagem, `map_segment_is_complete`, `map_can_access_segment`, `get_commission_map_segment_inventory`, `expire_commission_segment_reservations`.
6. Policies RLS por segmento (projeto, camadas, entidades, geometrias, lotes, preços, reservas, vendas, logs) + `validate_commercial_map_segments`.

Nenhum bloco enfraquece policy existente; `map_calibrations` continua fora do escopo de comissão.

### 2. Semear o projeto cartográfico
- `bootstrap_commercial_map` para criar projeto ativo e camadas.
- `sync_commercial_map_reference_2026` e `apply_exporural_reference_2026` para popular entidades e lotes.
- `ensure_commission_map_segments(<project_id>)` como `service_role`.

### 3. Conferência de inventário (bloqueante)
`validate_commercial_map_segments` + `get_commission_map_segment_inventory` por segmento, comparando com os alvos oficiais:

```text
exporural                    -> 116 entidades / 95 lotes
industria-comercio-servicos  -> 140 entidades / 103 lotes
```

Divergência → rodar `reconcile_commission_map_lineage` e reconferir. Se ainda divergir, o relatório sai com o número real e a causa, sem ajuste forçado.

### 4. Capabilities
Conceder `exporural_access` e `industria_comercio_servicos_access` em `user_capabilities` aos membros que devem enxergar cada portal (hoje a tabela só tem `full_access`, `cronograma_reminder_all` e `mobility_access`).

### 5. Validação
- RLS: consultas por perfil (capability única, ambas, sem capability, admin/gestor) confirmando zero vazamento entre segmentos e que `map_calibrations` não aparece.
- Navegação real com Playwright em `/comissoes/exporural/mapa-comercial`, `/comissoes/industria-comercio-servicos/mapa-comercial` e `/mapa-comercial`, sem `MAP_SEGMENT_EMPTY` nem `MAP_SEGMENT_INVENTORY_MISMATCH`.
- Suítes `commissionMapMigration.contract`, `commercialMapSegments`, `commissionMapPortals`, `commissionMapSidebar` + typecheck.

### 6. Relatório final
Evidências por etapa e veredito GO/NO-GO.

## Notas técnicas

- Cada bloco de SQL vai como uma chamada de migration separada para sua aprovação; todos são idempotentes (`if not exists`, `create or replace`).
- Sem fallback de dados no cliente: o serviço continua falhando fechado quando o segmento estiver inconsistente.
- Nenhum arquivo de frontend precisa mudar — o código dos portais já está implementado e aguarda apenas o schema.
