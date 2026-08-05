# Reaplicação completa dos portais Exporural e Indústria, Comércio e Serviços

Objetivo: deixar os dois portais de mapa comercial funcionando de verdade neste banco (nada simulado, nada de atalho), concluindo a cadeia de migrations que não veio na restauração e validando os inventários oficiais.

## Estado atual confirmado

- Tabelas base do mapa já recriadas: `map_projects`, `map_entities`, `commercial_lots`, `map_lot_lineage` (e demais 16 tabelas do núcleo).
- `map_projects` está **vazia** (0 linhas) — nenhum projeto cartográfico semeado.
- `map_segments` **não existe** — por isso os portais por comissão não têm como resolver escopo.
- Só 3 funções presentes: `map_has_explicit_capability`, `map_polygon_from_geojson`, `map_geometry_overlaps_sellable`. Todos os triggers, RPCs de lote, split/merge e `save_map_geometry` estão faltando.

## Etapas

### 1. Concluir `20260710010000_create_commercial_map.sql`
Aplicar as partes 2 e 3 (triggers de auditoria/lineage, RPCs de lote, reservas, split/merge, `save_map_geometry`, políticas restantes), em blocos submetidos para aprovação. Cada bloco é idempotente (`create or replace`, `if not exists`), então reaplicar o que já existe é seguro.

### 2. `20260711010000_upgrade_commercial_map_2026.sql`
Upgrade do modelo 2026 (colunas novas, portões oficiais, validações de área).

### 3. `20260726120000_apply_exporural_reference_2026.sql`
Semeia o projeto cartográfico ativo e a referência oficial Exporural — é esta migration que popula `map_projects`, camadas, entidades e lotes.

### 4. `20260804090000_create_commission_map_segments.sql`
Cria `map_segments`, o `segment_id` em entidades/lotes, `map_can_access_segment`, `get_commission_map_segment_inventory`, `expire_commission_segment_reservations`, os guards de lineage e as policies por capability.

### 5. Conferência de inventário
Rodar `get_commission_map_segment_inventory` para cada segmento e comparar com os alvos oficiais:

```text
exporural                       -> 116 entidades / 95 lotes
industria-comercio-servicos     -> 140 entidades / 103 lotes
```

Se divergir, rodar `reconcile_commission_map_lineage` e reconferir. Não seguimos adiante com número fora do esperado.

### 6. Capabilities e usuários de QA
- Conceder `exporural_access` e `industria_comercio_servicos_access` aos membros que devem enxergar cada portal (hoje `user_capabilities` só tem `full_access`, `cronograma_reminder_all` e `mobility_access`).
- Criar os 8 usuários de QA da matriz de permissão (um por combinação: sem capability, capability única, ambas, admin, gestor, operador, leitura, service_role) — todos em contas descartáveis identificáveis, removíveis ao fim.

### 7. Validação RLS (Fases C a J)
Para cada perfil: consultar `map_entities`, `commercial_lots`, `map_segments` e o RPC de inventário, registrando o que retorna. Critérios:
- quem não tem a capability do segmento recebe zero linhas daquele segmento;
- quem tem uma capability não enxerga o outro segmento nem o parque completo;
- `map_calibrations` não vaza para escopo de comissão.

### 8. Regressão funcional
- `/comissoes/exporural/mapa-comercial` e `/comissoes/industria-comercio-servicos/mapa-comercial` carregando com dados reais, sem cair no erro `MAP_SEGMENT_EMPTY` / `MAP_SEGMENT_INVENTORY_MISMATCH`.
- `/mapa-comercial` (parque completo) inalterado para admin.
- Split/merge e expiração de reservas exercitados em lotes descartáveis do projeto de QA, nunca em dados reais.
- Suíte de testes existente (`commissionMapMigration.contract`, `commercialMapSegments`, `commissionMapPortals`, `commissionMapSidebar`) verde.

### 9. Veredito
Relatório final com evidências por fase e GO/NO-GO, mais limpeza dos usuários e lotes de QA.

## Notas técnicas

- Cada migration vai como uma chamada separada para sua aprovação; migrations grandes serão fatiadas em blocos coerentes (DDL, funções, triggers, policies) para caberem e falharem de forma legível.
- Todo `CREATE TABLE` novo em `public` sai com `GRANT` explícito para `authenticated`/`service_role` na mesma migration (o arquivo original omitia isso em alguns pontos).
- Nenhuma policy será enfraquecida para "fazer passar": se algo bloquear, a causa é investigada e corrigida na origem.
- Sem fallback local de dados no cliente — o serviço continua falhando fechado quando o segmento está inconsistente.
