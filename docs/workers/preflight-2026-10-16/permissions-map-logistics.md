# Pré-validação de permissões: Mapa, Interesse, Comissão e Logística

Data: 16/10/2026, America/Sao_Paulo.

Este documento registra uma inspeção estática do checkout, complementada pela auditoria de metadados descrita ao final. Nenhuma tool de worker foi implementada ou registrada, nenhuma migration foi criada, nenhum dado de negócio foi consultado e nenhum teste com usuários por papel foi executado. A existência no código e nas migrations não confirma, por si só, o estado do banco implantado. O trabalho está limitado à pré-validação documental; os critérios de aceite das Fases 0 e 1 continuam pendentes.

## Fontes e limites

Foram lidos os [AGENTS da raiz](../../../AGENTS.md), os [AGENTS do Mapa Comercial](../../../src/features/commercial-map/AGENTS.md), os [tipos Supabase](../../../src/integrations/supabase/types.ts), as rotas em [App.tsx](../../../src/App.tsx), [Sidebar.tsx](../../../src/components/Sidebar.tsx), [useCapabilities](../../../src/hooks/useCapabilities.ts), [CapabilitiesProvider](../../../src/contexts/CapabilitiesProvider.tsx), [useModuleAccess](../../../src/hooks/useModuleAccess.ts), hooks e migrations pertinentes.

Os identificadores abaixo são identificadores reais encontrados no repositório. As classificações de uso futuro pelos workers são requisitos propostos, não permissões já implementadas. Toda leitura futura deverá usar JWT do próprio usuário, organização validada no servidor, RLS e retorno de campos por allowlist. Papel não substitui a validação do escopo de cada registro.

## Inventário encontrado

| Módulo | Tabelas/views existentes | RPCs/funções existentes | Evidência |
| --- | --- | --- | --- |
| Mapa | `commercial_lots`, `commercial_exhibitors`, `commercial_price_rules`, `commercial_lot_price_overrides`, `lot_sales`, `lot_contracts`, `lot_contract_lots`, `map_segments`, `map_lot_lineage`, `map_reference_migration_snapshots`; views `commercial_lot_pricing_2028`, `commercial_sale_eligibility` | `list_commercial_sale_orders`, `get_commercial_sale_order_detail`, `get_sale_order_revisions`, `get_commission_map_segment_inventory`, `commercial_map_lot_buyers`, `commercial_buyer_display_name`, `reserve_commercial_lot`, `start_commercial_negotiation`, `register_commercial_sale_order`, `confirm_sale_order_items`, `cancel_sale_order_items`, `revise_sale_order_items` | [Tabelas comerciais](../../../src/integrations/supabase/types.ts#L1107), [contratos](../../../src/integrations/supabase/types.ts#L4613), [segmentos e linhagem](../../../src/integrations/supabase/types.ts#L5892), [views](../../../src/integrations/supabase/types.ts#L9971), [RPCs de leitura](../../../src/integrations/supabase/types.ts#L11368), [reserva e revisão](../../../src/integrations/supabase/types.ts#L11766) |
| Interesse | `public_map_links`, `public_map_events` | `public_map_resolve_link`, `public_map_track`, `public_map_interest_summary`, `public_map_links_overview`, `public_map_link_rotate`, `public_map_link_set_active`, `public_map_inventory` | [Tabelas](../../../src/integrations/supabase/types.ts#L6617), [RPCs](../../../src/integrations/supabase/types.ts#L11527) |
| Comissão | `commissions`, `commission_responsibles`, `official_committees`, `org_members`, `organizations`, `user_capabilities`, `user_roles`, `agenda_meeting_action_items`, `cronograma_evento_comissoes`, `tasks`; view `org_members_safe` | `get_user_org_role`, `is_org_member`, `has_role`, `has_capability`, `cronograma_managed_commission_ids` | [Comissões](../../../src/integrations/supabase/types.ts#L1505), [ações de reunião](../../../src/integrations/supabase/types.ts#L17), [organização](../../../src/integrations/supabase/types.ts#L6366), [tarefas](../../../src/integrations/supabase/types.ts#L7487), [view segura](../../../src/integrations/supabase/types.ts#L10316), [RPCs de papel](../../../src/integrations/supabase/types.ts#L11381) |
| Logística | `transports`, `transport_guests`, `transport_locations`, `transport_weather_alerts`, `transport_weather_snapshots`, `expenses`, `expense_*`, `reimbursements`, `events`, `fenasoja_events`, `schedules`, `schedule_shifts`, `shift_assignments`, `tasks`, `vehicles`, `vehicle_usage`, `fuel_records`, `electric_carts`, `cart_reservations`, `scooters`, `scooter_reservations`, `mobility_authorizations`, `committee_mobility_forms`, `committee_mobility_members`, `public_mobility_forms`, `public_mobility_members`, `guests`, `weather_city_cache`; view `guests_safe` | MCP `list_transports`; Edge Functions `transport-lifecycle` e `weather-service` | [Reservas](../../../src/integrations/supabase/types.ts#L1047), [despesas](../../../src/integrations/supabase/types.ts#L3113), [escala](../../../src/integrations/supabase/types.ts#L7097), [transportes e clima](../../../src/integrations/supabase/types.ts#L7549), [veículos](../../../src/integrations/supabase/types.ts#L8052), [cache climático](../../../src/integrations/supabase/types.ts#L9891), [MCP](../../../src/lib/mcp/tools/list-transports.ts), [transport-lifecycle](../../../supabase/functions/transport-lifecycle/index.ts), [weather-service](../../../supabase/functions/weather-service/index.ts) |

A existência de uma tabela ou função não autoriza seu registro como tool. Despesas, hóspedes, mobilidade pública e funções de ciclo de transporte aparecem no inventário do pedido, mas não precisam ser expostos ao worker Logística v1. Resumos devem usar somente os campos necessários, sem contatos nem observações livres por padrão.

## Diferenças reais e consequências

### 1. Comissão não possui RPC segura de criação de tarefa

O hook existente [`useTasks.create`](../../../src/hooks/useTasks.ts#L24) usa `.from('tasks').insert(...)`, com auditoria posterior; atualização e conclusão também usam gravações diretas. A busca em `src`, `supabase/functions` e `supabase/migrations` não encontrou RPC `create_task`/`save_task` nem Edge Function equivalente para criação de tarefas de negócio. As funções `complete_google_sync_task` encontradas são de sincronização do calendário e não criam tarefas da aplicação.

Consequência: o worker Comissão não pode registrar a escrita “criar tarefa interna” sob a regra inviolável de escrever somente por RPC/função existente e nunca inserir diretamente em tabela de negócio. A fase somente leitura pode consultar tarefas autorizadas; não deve simular sucesso de criação. Uma futura escrita exige decisão explícita sobre o escopo e uma interface de negócio segura antes de ser habilitada.

A [página de tarefas por comissão](../../../src/features/commission-agenda/components/CommissionTasksPage.tsx#L21) informa que o plano operacional está em preparação. Ela não fornece uma implementação alternativa de criação.

### 2. Interesse exige `map.analytics.view`

O pedido sugere `map.manage_sales`/`map.admin`, mas [`public_map_require_manager`](../../../supabase/migrations/20260920140827_933304d5-bed6-4a02-9900-2e0a74616514.sql#L312) chama `has_capability(..., 'map.analytics.view')`. Tanto [`public_map_interest_summary`](../../../supabase/migrations/20260920140827_933304d5-bed6-4a02-9900-2e0a74616514.sql#L387) quanto [`public_map_links_overview`](../../../supabase/migrations/20260920221336_0cb5717f-5311-4d87-9da0-06f573931006.sql#L44) passam por essa checagem. O frontend também possui [`canViewMapAnalytics`](../../../src/features/commercial-map/utils/permissions.ts#L23).

`map.manage_sales` ou `map.admin` isolados não satisfazem, para um membro `leitura`, a função genérica `has_capability` usada por essas RPCs. Não ampliar grants ou policies para ajustar silenciosamente a divergência. O registry futuro deve documentar e exigir `map.analytics.view`, mantendo a validação da RPC.

### 3. Overview de links entrega token permanente

A migration vigente de [`public_map_links_overview`](../../../supabase/migrations/20260920221336_0cb5717f-5311-4d87-9da0-06f573931006.sql#L59) inclui `'token', k.token` na resposta. Antes de qualquer dado chegar ao provedor, ao histórico ou aos logs dos workers, um adaptador deverá selecionar somente estatísticas e metadados permitidos; jamais copiar o JSON integral. O token não é necessário para responder qual área recebeu mais interesse. Links de resposta devem apontar para a tela interna autorizada, sem criar URL pública com token.

### 4. Inventário de segmento é estrutural

[`get_commission_map_segment_inventory`](../../../supabase/migrations/20260929211814_22ba0d96-330c-4d85-9a35-9a1a69a78698.sql#L17) retorna somente `expected_entity_count`, `expected_lot_count` e `lineage_delta`. Valida `map_can_access_segment`, conta entidades/lotes ativos e não devolve lista, status comercial, preços ou contratos.

Para responder inventário detalhado, será necessário consultar com JWT as tabelas/views existentes e respeitar seu escopo. Não inferir número comercial de ID técnico; usar número/quadra/segmento/pavilhão persistidos, conforme os AGENTS. A view de preços não substitui as regras de acesso a contratos ou vendas.

### 5. Vendas e contratos exigem permissões adicionais ao mapa

[`list_commercial_sale_orders`](../../../supabase/migrations/20261002173355_fb9ace96-b362-46e4-a7ca-ff2c4d94e046.sql#L39) e [`get_commercial_sale_order_detail`](../../../supabase/migrations/20261002173355_fb9ace96-b362-46e4-a7ca-ff2c4d94e046.sql#L110) exigem `map.manage_sales` via `map_has_explicit_capability`; a leitura de contratos ainda depende de `map.manage_contracts`.

O detalhe retorna documento, telefone, e-mail e parcelas, conforme a [construção do JSON](../../../supabase/migrations/20261002173355_fb9ace96-b362-46e4-a7ca-ff2c4d94e046.sql#L122). O adaptador futuro deve extrair status e agregados necessários, sem enviar esse payload completo à IA. Para a consulta permitida apenas por `map.view`, existe [`commercial_map_lot_buyers`](../../../supabase/migrations/20261006202148_0eb20308-f82c-413a-b0fb-5a9695916bae.sql#L1), que retorna lote, situação e nome de exibição, sem documento, contato ou pagamento.

“Venda em aberto” continua `SALE_OPEN`/`OPEN`/`PENDING_SIGNATURE`; não contar como venda confirmada nem receita realizada. O worker nunca executa confirmação, cancelamento ou revisão de venda.

### 6. `weather-service` não é uma leitura genérica segura

A função cria um [cliente service role global](../../../supabase/functions/weather-service/index.ts#L10). As ações [`sync_transport`/`refresh`](../../../supabase/functions/weather-service/index.ts#L287) leem snapshots/transportes e persistem novos dados. [`sync_batch`](../../../supabase/functions/weather-service/index.ts#L318) lê transportes e grava jobs e snapshots. Não devem ser registradas como ferramentas de leitura nem receber `action` livre do modelo.

Para dados do transporte, usar consultas JWT a `transport_weather_snapshots` e `transport_weather_alerts`. Para previsão externa sem registro de negócio, [`preview`](../../../supabase/functions/weather-service/index.ts#L261) é um candidato a adaptador restrito a coordenadas públicas da feira; seu cache climático ainda passa pelo cliente admin e precisa de avaliação explícita antes da implementação. Nunca aceitar ID de transporte em uma tool externa de preview.

### 7. MCP de transportes precisa de gate e minimização

[`list_transports`](../../../src/lib/mcp/tools/list-transports.ts#L20) já usa `supabaseForUser(ctx)`, mas só valida autenticação, não `full_access`. Retorna `origem`, `destino` e `observacoes`, que podem conter dados pessoais livres. Compartilhar essa definição sem adaptação não satisfaz todos os requisitos dos workers. O registry precisa validar o acesso Logística no servidor e fornecer saída agregada/campos permitidos.

### 8. Views “safe” não mascaram contatos para todos os papéis

[`guests_safe` e `org_members_safe`](../../../supabase/migrations/20260308010441_9a16a471-c97c-4528-86df-a1632a286236.sql#L2) ocultam contatos de `leitura`, mas devolvem os valores reais para admin/gestor/operador. O sufixo `safe` não garante anonimização antes de uso por IA. Os workers deverão omitir contatos por allowlist e mascarar CPF, telefone, e-mail e PIX em texto livre quando sua leitura for necessária e autorizada.

### 9. Resolvedores de capability têm semânticas diferentes

- [`has_capability`](../../../supabase/migrations/20260416170750_eaf9c72f-4022-4a76-9d7f-0e44e36c06d4.sql#L29) concede acesso genérico por papel admin/gestor/operador; para os demais consulta a capability pedida ou `full_access`.
- [`map_has_explicit_capability`](../../../supabase/migrations/20260805023923_e2e83fac-31b4-4cc6-98d0-aa767827fee7.sql#L133) exige associação à organização e admin/gestor ou grant da capability, `map.admin` ou `full_access`. Operador não herda escrita de mapa automaticamente.
- [`map_can_access_segment`](../../../supabase/migrations/20260929212323_92cbb10a-72dc-44bf-9b26-d0971b346b92.sql#L1) exige associação, segmento ativo e projeto não arquivado; aceita admin/gestor ou `segment.required_capability`, `full_access` ou `admin_access`. Um grant global `map.view` isolado não substitui essa checagem de portal segmentado.
- O [`CapabilitiesProvider`](../../../src/contexts/CapabilitiesProvider.tsx#L45) trata `restricted_scope` de operador e grants `venue_*` separadamente. Portanto a apresentação da UI e o gate server-side não devem presumir uma única regra genérica para todos os módulos.
- [`useModuleAccess`](../../../src/hooks/useModuleAccess.ts#L20) admite papel admin/gestor, `full_access`, `admin_access`, capability do módulo e vínculo institucional em módulos não sensíveis. Isso não concede automaticamente leitura de toda reunião nem de todos os dados de negócio.

## Matriz papel × tool: contrato de acesso a validar

Matriz documental derivada do código, sem execução por papel. `A/G/O/L` abaixo são papéis de organização `admin/gestor/operador/leitura`; não são o `app_role` global `admin|user`. Todos os casos pressupõem JWT válido e organização do usuário validada. “Comissão” descreve vínculo institucional, que pode coexistir com qualquer papel; as duas últimas colunas consideram um membro `leitura` para evitar presumir herança de administrador.

`RLS` significa somente linhas visíveis pelo JWT e pelos filtros de organização/registro. `Grant` significa exigir a capability real e revalidar a RPC existente, sem confiar na UI. “Futura” significa escrita apenas após Fase 2 e confirmação; nesta pré-validação e na Fase 1 continua indisponível.

| Tool/fonte real | Admin | Gestor | Operador | Leitura | Comissão sem grants específicos | Comissão com grants específicos | Escopo e gate reais |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `commercial_lots`, `commercial_lot_pricing_2028`, `commercial_map_lot_buyers` | RLS | RLS | RLS; não presumir escrita | Grant + RLS | Somente segmento autorizado, se possuir capability do portal; vínculo sozinho não basta | `map.view` para leitura global; capability persistida do segmento para portal | `can_view_commercial_map`/RLS; não ler preço ou comprador fora do conjunto autorizado |
| `get_commission_map_segment_inventory` | RPC, segmento ativo | RPC, segmento ativo | Grant de segmento | Grant de segmento | Recusar sem capability do segmento | RPC valida capability do segmento | `map_can_access_segment`; somente contagens estruturais |
| `list_commercial_sale_orders`, `get_commercial_sale_order_detail`, `get_sale_order_revisions` | RPC | RPC | Grant | Grant | Recusar | `map.manage_sales` ou `map.admin`/`full_access` efetivo na RPC | Projeto/pedido persistido; omitir documento, contato e pagamento desnecessário |
| Contratos de venda retornados pelo detalhe | Grant efetivo da RPC | Grant efetivo da RPC | Grant | Grant | Recusar | `map.manage_contracts` além do acesso ao pedido | Não ler arquivo privado nem metadados sensíveis sem autorização |
| `reserve_commercial_lot`, `start_commercial_negotiation` | Futura | Futura | Futura com grant | Futura com grant | Recusar | Futura com `map.manage_sales` | RPC valida lote/projeto/status; confirmação individual obrigatória |
| `public_map_interest_summary`, `public_map_links_overview` | Gate da RPC + saída segura | Gate da RPC + saída segura | Gate da RPC + gate de worker | `map.analytics.view` | Recusar | `map.analytics.view`; `map.*` genérico não é um grant | RPC atual usa `has_capability`; remover token do overview; agregados por período |
| `commissions`, `commission_responsibles`, `org_members_safe` | RLS; Central exige política de worker admin | RLS; não equivale à Central admin | Vínculo/escopo autorizado + RLS | Vínculo/escopo autorizado + RLS | Própria comissão, sem ampliar visibilidade | Capability real do módulo + RLS | Sem nova capability inventada; resolver módulo e vínculo existentes; omitir telefone |
| `agenda_meeting_action_items`, `cronograma_evento_comissoes` | RLS de evento/sessão | RLS de evento/sessão | RLS de evento/sessão | RLS de evento/sessão | Somente eventos/sessões autorizados da comissão | Grants não substituem leitura da sessão | `agenda_meeting_session_readable` e escopo da agenda; consentimento respeitado |
| `tasks` leitura | RLS + filtro | RLS + filtro | RLS + filtro | RLS + filtro | Escopo da própria comissão somente se estabelecido por dados persistidos | Mesmo escopo persistido | Não inferir que tabela organizacional já separa tarefas por comissão |
| Criação de tarefa interna | Indisponível | Indisponível | Indisponível | Indisponível | Indisponível | Indisponível | Falta RPC/função segura existente; hook faz INSERT direto |
| `list_transports`, `vehicles`, `cart_reservations`, `scooter_reservations`, `schedules`, snapshots/alertas de clima | `full_access` efetivo + RLS | `full_access` efetivo + RLS | `full_access` efetivo + RLS; `restricted_scope` precisa validação | Grant `full_access` + RLS | Recusar sem `full_access` | `venue_*`, `map.*`, `financial_access` não substituem `full_access` | Gate próprio do worker Logística; organização e ciclo persistidos; resumos sem contatos/observações |
| `weather-service` ações `refresh`, `sync_transport`, `sync_batch` | Proibida como leitura | Proibida como leitura | Proibida como leitura | Proibida como leitura | Proibida como leitura | Proibida como leitura | Fazem leitura service role e/ou efeitos de negócio; não registrar |

Evidências complementares: [RLS de responsáveis por comissão](../../../supabase/migrations/20260803140802_7f12ee35-c61f-4752-b634-f0f13a989a8e.sql#L41), [RLS de ações de reunião](../../../supabase/migrations/20260814140653_52233306-5b6b-41d5-b8c4-eccbec6e6fff.sql#L234), [RLS de transportes/tarefas/escala](../../../supabase/migrations/20260308053112_dfacce48-420c-4464-80be-9a2c43555a23.sql#L41), [gate de escrita por reserva/negociação](../../../supabase/migrations/20260805012455_1844f1ca-ea09-4776-96f3-3d04eaf64ca6.sql#L43).

## Operações proibidas ao registry

Nenhuma capability, papel de admin, confirmação do card ou conteúdo de anexo poderá tornar registrável uma operação proibida pelo escopo do usuário. O futuro teste do registry deverá recusar essas operações antes de qualquer chamada de modelo ou RPC.

| Grupo | Identificadores/efeitos proibidos |
| --- | --- |
| Exclusão | Qualquer DELETE de negócio, `cronograma_delete_event`, `cronograma_delete_subevent`, operações `venue_delete_*` e qualquer equivalente |
| Financeiro | Qualquer escrita financeira, incluindo `financial_record_movement`, `financial_reverse_movement`, `financial_transition_expense`, baixa/confirmação de pagamento ou mutação em `expenses`/`reimbursements` |
| Venda | `register_commercial_sale_order` fora do escopo de escrita autorizado aos workers; sempre proibidos `confirm_sale_order_items`, `cancel_sale_order_items`, `revise_sale_order_items` e baixa de parcelas |
| Link/mapa público | `public_map_link_rotate`, `public_map_link_set_active`, `publish_commercial_map`, divulgação de token, publicação ou alteração pública |
| Geometria e preço | `save_map_geometry`, `set_lot_price_override`, `apply_lot_price_rules_2028`, reparcelamento, alteração de câmera/renderização, linhagem ou snapshots |
| Identidade/permissão | Criação de usuário, alteração de papel/capability, concessão de acesso a comissão, impersonação ou cliente service role para leitura de negócio |
| Comunicação | E-mail, push a terceiros, WhatsApp, mensagem a terceiros ou qualquer ação pública; a fase somente leitura não envia notificações |
| Efeitos disfarçados de leitura | `weather-service` com `refresh`, `sync_transport`, `sync_batch`; `transport-lifecycle`; `public_map_track` (grava telemetria); SQL livre e INSERT/UPDATE direto em tabela de negócio |
| Tarefa sem interface segura | Reutilizar `useTasks.create` como atalho para contornar a ausência de RPC/função de negócio |

As únicas escritas comerciais candidatas do catálogo são `reserve_commercial_lot` e `start_commercial_negotiation`, e permaneceriam desabilitadas na Fase 1. Não oferecer “Desfazer” sem RPC inversa segura existente e autorizada.

## Rotas reais para futuras citações

| Conteúdo | Rota encontrada | Evidência e limite |
| --- | --- | --- |
| Mapa | `/mapa-comercial` | [App.tsx](../../../src/App.tsx#L248), protegido por `map.view`; preservar câmera e renderização |
| Portal de mapa de comissão | `/comissoes/:moduleSlug/mapa-comercial` | [App.tsx](../../../src/App.tsx#L333); módulo deve ser persistido/resolvido, nunca inferido do texto |
| Logística | `/transports`, `/vehicles`, `/electric-carts`, `/scooters`, `/ver-escala`, `/checklist` | [App.tsx](../../../src/App.tsx#L453), protegidas por `FullAccessRoute` |
| Logística em comissão | `/comissoes/logistica/transportes`, `/comissoes/logistica/veiculos`, `/comissoes/logistica/carrinhos-eletricos`, `/comissoes/logistica/checklist` | [App.tsx](../../../src/App.tsx#L262) |
| Comissões/Central | `/comissoes/:moduleSlug/*`, `/admin/*`, `/portal` | [App.tsx](../../../src/App.tsx#L507); “admin area” atual admite admin/gestor em `useModuleAccess`, portanto a Central estritamente admin precisa validação explícita de papel |

Essas são rotas de tela existentes, não URLs de detalhe inventadas. Um chip por registro só pode ser implementado após verificar que a tela entende o identificador/filtro; não acrescentar query string fictícia. A resposta deverá distinguir o link para a lista do link para um registro específico.

## Auditoria de metadados e testes ainda pendentes

`audit_check_rls_status` e `audit_count_policies` existem nos [tipos](../../../src/integrations/supabase/types.ts#L10839) e na [migration de auditoria](../../../supabase/migrations/20260304204453_014fc217-873d-41a6-877b-7d49d54d6a2d.sql#L23). Na pré-validação geral, o agente principal executou ambas no projeto Supabase configurado pelo `.env` versionado: HTTP 200 nas duas RPCs, 154 tabelas retornadas, todas com RLS habilitada. A autenticação usou somente a chave pública já versionada, sem JWT de usuário e sem service role. A consulta foi limitada a metadados, sem ler linhas de negócio. Ver [resultado combinado](rls-metadata.json) e [relatório geral](README.md#estado-real-do-banco).

Onze tabelas retornaram zero policies, incluindo `public_map_links` e `public_map_events`. Isso não autoriza acesso direto nem criação de policies amplas; os fluxos existentes de links públicos passam por RPCs que precisam de inspeção de autorização e minimização. As contagens detalhadas das demais tabelas inventariadas constam em `rls-metadata.json`. Esses metadados não confirmam isolamento por usuário/organização/segmento, não verificam comportamento de views e não provam que toda migration local foi aplicada.

Para cada família de tools habilitada futuramente, os testes reais precisam cobrir admin, gestor, operador comum, operador com `restricted_scope`, leitura e membro de comissão com/sem cada grant relevante; incluir duas organizações, segmento não autorizado, projeto arquivado, pedido/contrato fora do escopo, sessão de reunião sem acesso e retorno de dados pessoais. Os testes também devem verificar token removido, impossibilidade de registrar proibidas e recusa server-side independente de botão oculto.

Nenhum teste por papel foi executado nesta pré-validação. A matriz orienta a implementação e a validação posterior, sem substituir os testes de RLS exigidos no pedido.
