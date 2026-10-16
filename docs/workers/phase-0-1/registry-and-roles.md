# Registry e matriz de acesso — Fases 0 e 1

Catálogo fechado de leitura: cada nome, schema Zod/JSON, capability e fonte é revisado. Não há registro de handlers externos, SQL livre ou ferramentas de escrita executáveis. A configuração abaixo é compartilhada com os três adapters MCP de leitura já existentes; o bundle gerado permanece fora do diff.

As permissões são verificadas novamente a cada execução com Auth/JWT, vínculo ativo, organização, RLS, capacidades e escopo persistido. A listagem de tools não é uma autorização permanente. `member` significa identidade autenticada + vínculo ativo; `commission` acrescenta o vínculo à comissão (Central só admin).

| Worker | Tool | Gate | Fontes | Link |
|---|---|---|---|---|
| agenda | `list_events` | member | `cronograma_eventos_full` | `/cronograma-eventos` |
| agenda | `get_event` | member | `cronograma_eventos_full` | `/cronograma-eventos` |
| agenda | `list_subevents` | member | `cronograma_eventos_full`, `cronograma_subeventos` | `/cronograma-eventos` |
| agenda | `commission_agenda` | member | `commissions`, `cronograma_unit_agenda` | `/cronograma-eventos` |
| agenda | `commission_metrics` | member | `commissions`, `cronograma_unit_metrics` | `/cronograma-eventos` |
| arena | `list_venue_events` | venue_events_access | `venue_events` | `/eventos-restaurante-arena` |
| arena | `venue_availability` | venue_events_access | `venue_spaces`, `venue_check_availability` | `/eventos-restaurante-arena` |
| arena | `venue_occupancy` | venue_events_access | `venue_occupancies` | `/eventos-restaurante-arena` |
| arena | `venue_counterparts` | venue_events_access + (venue_reports_view ou venue_counterparts_manage) | `venue_counterpart_balances` | `/eventos-restaurante-arena` |
| arena | `restaurant_alert` | venue_events_access | `cronograma_restaurant_alert` | `/cronograma-eventos` |
| mapa | `map_projects` | map.view | `map_projects` | `/mapa-comercial` |
| mapa | `map_segments` | map.view | `map_projects`, `map_segments` | `/mapa-comercial` |
| mapa | `map_entities` | map.view | `map_projects`, `map_entities` | `/mapa-comercial` |
| mapa | `map_inventory` | map.view | `map_projects`, `commercial_lots` | `/mapa-comercial` |
| mapa | `map_prices` | map.view | `map_projects`, `commercial_lot_pricing_2028` | `/mapa-comercial` |
| mapa | `map_segment_inventory` | map.view | `map_projects`, `map_segments`, `get_commission_map_segment_inventory` | `/mapa-comercial` |
| mapa | `list_sale_orders` | map.manage_sales | `map_projects`, `list_commercial_sale_orders` | `/mapa-comercial` |
| mapa | `sale_order_detail` | map.manage_sales | `map_projects`, `lot_sale_orders`, `get_commercial_sale_order_detail` | `/mapa-comercial` |
| mapa | `sale_order_contract_summary` | map.manage_sales + map.manage_contracts | `map_projects`, `lot_sale_orders`, `get_commercial_sale_order_detail` | `/mapa-comercial` |
| interesse | `interest_summary` | map.analytics.view + map.manage_sales | `workers_interest_summary` | `/mapa-comercial` |
| interesse | `public_links_overview` | map.analytics.view + map.manage_sales | `workers_public_links_overview` | `/mapa-comercial` |
| comissao | `my_commissions` | commission | `commissions`, `commission_responsibles` | `/portal` |
| comissao | `commission_responsibles` | commission | `commissions`, `commission_responsibles` | `/portal` |
| comissao | `meeting_sessions` | commission | `commissions`, `cronograma_eventos_full`, `cronograma_evento_comissoes`, `agenda_meeting_sessions` | `/cronograma-eventos` |
| comissao | `meeting_actions` | commission | `commissions`, `cronograma_eventos_full`, `cronograma_evento_comissoes`, `agenda_meeting_sessions`, `agenda_meeting_action_items` | `/cronograma-eventos` |
| logistica | `list_transports` | full_access | `transports` | `/transports` |
| logistica | `vehicle_summary` | full_access | `vehicles` | `/vehicles` |
| logistica | `cart_reservations` | full_access | `cart_reservations` | `/electric-carts` |
| logistica | `scooter_reservations` | full_access | `scooter_reservations` | `/scooters` |
| logistica | `logistics_schedules` | full_access | `schedules` | `/ver-escala` |
| logistica | `transport_weather` | full_access | `transport_weather_snapshots` | `/transports` |
| caixa | `financial_editions` | financial_access | `financial_editions` | `/comissoes/financeiro-gerencial` |
| caixa | `financial_edition_summary` | financial_access | `financial_editions`, `financial_edition_summary` | `/comissoes/financeiro-gerencial` |
| caixa | `financial_budget_execution` | financial_access | `financial_editions`, `financial_budget_execution` | `/comissoes/financeiro-gerencial` |
| caixa | `financial_expense_comparison` | financial_access | `financial_editions`, `financial_expense_comparison` | `/comissoes/financeiro-gerencial` |
| radar | `web_search` | membro autenticado, JWT + org | Firecrawl via gateway gerenciado; fontes primárias permitidas | título + URL HTTPS + data |

## Matriz por papel

| Grupo | Agenda | Arena | Mapa | Interesse | Comissão | Logística | Caixa | Radar |
|---|---|---|---|---|---|---|---|---|
| admin | RLS | RPC de permissões | escopo de projeto | gate comercial + analytics | inclui Central | acesso completo | financial_can | membro |
| gestor | RLS | RPC de permissões | escopo de projeto | gate comercial + analytics | comissão persistida | acesso completo | capability financeira + financial_can | membro |
| operador | RLS | acesso completo/RPC | map.view equivalente do app + RLS | grant comercial + analytics | comissão persistida | acesso completo se sem restricted_scope | capability financeira + financial_can | membro |
| leitura, sem grants | RLS | negado | negado | negado | comissão persistida | negado | negado | membro |
| membro de comissão, com grants | RLS | venue_events_access + RPC | map.view + escopo | map.manage_sales/map.admin + analytics | comissão persistida | somente acesso completo | financial_access + RPC | membro |
| membro de comissão, sem grants | RLS | negado | negado | negado | comissão persistida | negado | negado | membro |

“RLS” ou um gate permitido não garante existência/visibilidade do registro. O servidor continua a recusar organizações, segmentos, comissões e eventos não autorizados. `venue_reports` exige também relatório/contrapartidas; vendas/contratos exigem gates explícitos adicionais. O comportamento equivalente de papéis vem dos helpers existentes, sem criar capabilities.

## Escritas futuras e proibições

O inventário `src/lib/workers/inventory.ts` mantém as RPCs de proposta das fases seguintes com `enabled:false`. Comissão não ganhou criação de tarefa: o hook existente faz INSERT direto, sem RPC segura. Clima usa somente cache minimizado nesta fase, pois `weather-service` tem efeitos adicionais; nenhuma chamada ao serviço legado foi registrada.

Exclusões, ações financeiras, confirmação/cancelamento/revisão de venda, preço/geometria, publicação/rotação/desativação de links, criação de usuários/capabilities, comunicação com terceiros e endpoints com efeitos são recusados. Os testes tentam registrar cada operação proibida e nomes desconhecidos; nenhuma passa pelo catálogo fechado.

## RLS auditada

A evidência remota somente de metadados está em `../preflight-2026-10-16/rls-metadata.json`:154 tabelas com RLS habilitada,11 sem policies. O inventário detalhado e limites das views/security-definer estão nos dois relatórios de permissões do preflight. As novas tabelas/policies foram verificadas em PostgreSQL WASM isolado, com identidades sintéticas (ver `rls-validation.json`), sem aplicar migrations ao banco remoto. Esse ensaio não substitui os testes da RLS de negócio no ambiente conectado.
