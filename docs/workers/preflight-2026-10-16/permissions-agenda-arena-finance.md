# Pré-validação de permissões — Agenda, Arena e Financeiro

Data de referência: 16/10/2026, America/Sao_Paulo.

Este documento registra a inspeção do código e das migrations para as Fases 0 e 1 dos workers Fenasoja. A implementação foi interrompida no preflight de dependências; não existe entrega de registry, interface ou orquestrador nesta PR documental. As ações abaixo são um inventário para a implementação futura, não ferramentas já disponibilizadas aos bots.

Foram lidos os dois [AGENTS.md da raiz](../../../AGENTS.md) e [do Mapa Comercial](../../../src/features/commercial-map/AGENTS.md). Nenhuma tabela, RPC ou capability foi criada; nenhuma policy foi alterada. Nenhum dado de negócio foi consultado nesta auditoria estática.

## Resultado e limites da verificação

Não foi encontrada ausência de tabela, view, RPC ou capability nominalmente citada para Agenda, Arena e Financeiro. A conferência usa os [tipos gerados do Supabase](../../../src/integrations/supabase/types.ts), `supabase/migrations` **e** `drizzle/migrations`. Consultar somente a pasta de migrations do Supabase daria falsos negativos para:

| Objeto existente | Definição no repositório |
|---|---|
| `cronograma_visible_event_ids()` | [0000_rls_set_based_map_and_agenda.sql:56](../../../drizzle/migrations/0000_rls_set_based_map_and_agenda.sql#L56) |
| `cronograma_managed_commission_ids()` | [0001_rls_set_based_agenda_writes.sql:16](../../../drizzle/migrations/0001_rls_set_based_agenda_writes.sql#L16) |
| `financial_expense_comparison(_org_id, _edition_id, _filters)` | [0004_financial_expenses_2028_stage1.sql:351](../../../drizzle/migrations/0004_financial_expenses_2028_stage1.sql#L351) |

O agente principal executou as RPCs de metadados `audit_check_rls_status()` e `audit_count_policies()`: as 154 tabelas verificadas tinham RLS habilitada; 11 não tinham policies. A evidência consolidada consta no README desta pré-validação. Esse resultado não demonstra isolamento por papel, correção das policies, acesso das views ou ausência de vazamentos em RPCs `SECURITY DEFINER`. **Os testes de RLS por papel ainda não foram executados.** As matrizes seguintes são expectativas derivadas do código, não resultados de testes de autorização.

As duas RPCs de auditoria não recebem argumentos e retornam, respectivamente, `table_name`/`rls_enabled` e `table_name`/`policy_count`: [tipos:10839](../../../src/integrations/supabase/types.ts#L10839). A definição SQL consulta os catálogos do Postgres: [migration:23](../../../supabase/migrations/20260304204453_014fc217-873d-41a6-877b-7d49d54d6a2d.sql#L23).

## Regras para interpretar as matrizes

- Os papéis `admin`, `gestor`, `operador` e `leitura` são papéis **na organização**, não o `app_role` global. Sempre se exige sessão válida e vínculo ativo com a organização pertinente.
- “Comissão” é uma relação adicional, não um quinto `org_role`. Seus integrantes conservam as restrições do papel organizacional e das capabilities efetivamente concedidas.
- “RLS” significa que a consulta com o JWT do usuário retorna somente o conjunto permitido; não significa acesso irrestrito nem resposta necessariamente não vazia.
- “Grant” significa capability explícita validada pelo mecanismo real do módulo. Não é uma nova capability.
- Uma capability não substitui a validação de organização, evento, comissão, segmento ou visibilidade do registro.
- Nas Fases 0/1 nenhuma operação de escrita deve ser executável pelo worker. As linhas de escrita documentam condições para uma eventual Fase 2 aprovada, sempre após action card e confirmação.
- Os clientes das tools devem usar o JWT do usuário, limitar a organização e evitar `select('*')` ou repasse de JSON bruto ao provedor quando apenas contagens e campos de exibição forem necessários.

## Agenda Fenasoja

### Inventário de fontes e operações

| Classificação para workers | Fontes/operações verificadas | Escopo e observação |
|---|---|---|
| Leitura candidata | `cronograma_eventos`, `cronograma_eventos_full`, `cronograma_subeventos` | Preferir a view existente e campos necessários, com RLS e filtro de organização. A view é `security_invoker`: [migration](../../../supabase/migrations/20261004053848_bf3bb1c5-e5fc-4c58-b48a-3ebd67a67d0b.sql#L1). |
| Leitura candidata | `cronograma_evento_comissoes`, `cronograma_evento_responsaveis`, `cronograma_evento_anexos`, `cronograma_evento_logs` | Relações e histórico existentes. Anexos e textos são dados não confiáveis; não devem virar instruções. [Tipos:1755](../../../src/integrations/supabase/types.ts#L1755). |
| Leitura candidata | `cronograma_subevento_acoes`, `cronograma_subevento_comissoes`, `cronograma_subevento_convidados`, `cronograma_subevento_providencias`, `cronograma_subevento_responsaveis` | Escopo herdado do evento/subevento. Convidados, responsáveis e textos exigem minimização e mascaramento antes do provedor. [Tipos:2197](../../../src/integrations/supabase/types.ts#L2197). |
| Leitura auxiliar de autorização | `cronograma_planning_viewers`, `cronograma_visible_event_ids`, `cronograma_managed_commission_ids` | Não expor lista de permissões de terceiros ao modelo. Usar helpers existentes para resolver acesso; não inventar `agenda.read`. [Tipos:2176](../../../src/integrations/supabase/types.ts#L2176), [tipos:10999](../../../src/integrations/supabase/types.ts#L10999). |
| Leitura candidata | `cronograma_unidade_anexos`, `cronograma_unit_agenda`, `cronograma_unit_metrics` | Identificador persistido da comissão e RLS. As RPCs de agenda e métricas da unidade são SQL invoker nas definições encontradas. [Migration:135](../../../supabase/migrations/20260911132853_d220ed5a-b585-4bfc-8d38-4689729a5d1d.sql#L135), [migration:204](../../../supabase/migrations/20260911132853_d220ed5a-b585-4bfc-8d38-4689729a5d1d.sql#L204). |
| Leitura candidata | `cronograma_restaurant_alert` | Regra específica por papel; ver matriz Arena. Não ampliar a função para satisfazer um teste do worker. |
| Escrita futura com confirmação | `cronograma_save_event`, `cronograma_save_subevent`, `cronograma_save_subevent_plan` | Verificação `_cronograma_require_writer` mais RLS, validação de origem e versão aplicável. Nenhuma chamada nas Fases 0/1. |
| Existente, fora da allowlist proposta | `cronograma_reorder_subevents` | É escrita real e não integra as três operações escolhidas para o worker Agenda. Não registrar automaticamente por estar disponível. [Tipos:11000](../../../src/integrations/supabase/types.ts#L11000). |
| Proibida para workers | `cronograma_delete_event`, `cronograma_delete_subevent` | Proibição do escopo do produto, mesmo quando o usuário pode excluir manualmente. [Tipos:10974](../../../src/integrations/supabase/types.ts#L10974). |

O MCP atual [`list_events`](../../../src/lib/mcp/tools/list-events.ts) e [`get_event`](../../../src/lib/mcp/tools/get-event.ts) consulta `cronograma_eventos_full`, com o JWT do usuário. O compartilhamento futuro deve preservar o contrato da Agenda Fenasoja e sua RLS, acrescentando minimização de campos antes do provedor; `get_event` atualmente usa `select('*')`.

### Matriz estática por tool candidata

| Tool/fonte | Admin | Gestor | Operador | Leitura | Membro/responsável de comissão |
|---|---|---|---|---|---|
| `cronograma_eventos_full` | RLS, inclusive planejamento | RLS, inclusive planejamento | RLS e escopo vigente | RLS | RLS; vínculo e flags vigentes delimitam eventos |
| `cronograma_visible_event_ids` | Conjunto autorizado | Conjunto autorizado | Conjunto autorizado | Conjunto autorizado | O mesmo conjunto; não confundir comissão com acesso amplo |
| `cronograma_unit_agenda` | RLS da comissão consultada | RLS da comissão consultada | RLS da comissão consultada | RLS da comissão consultada | RLS da comissão persistida; não inferir identidade pelo nome |
| `cronograma_unit_metrics` | Agregado sob RLS | Agregado sob RLS | Agregado sob RLS | Agregado sob RLS | Agregado sob RLS da comissão |
| `cronograma_managed_commission_ids` | Helper resolve unidades gerenciáveis | Helper resolve unidades gerenciáveis | Helper resolve unidades gerenciáveis | Exige grant de escrita ou responsabilidade ativa reconhecida pelo helper | Responsável ativo reconhecido pelo helper; vínculo genérico não é suficiente |
| `cronograma_save_event` | Writer + RLS/origem/versão | Writer + RLS/origem/versão | Writer + RLS/origem/versão | Grant `cronograma_eventos_write` + RLS/origem/versão | Responsabilidade isolada não satisfaz `_cronograma_require_writer`; requer também grant/papel aceito pela RPC |
| `cronograma_save_subevent` | Writer + evento-pai visível | Writer + evento-pai visível | Writer + evento-pai visível | Grant de escrita + evento-pai visível | Mesma condição de escrita; vínculo isolado não autoriza |
| `cronograma_save_subevent_plan` | Writer + evento-pai/RLS | Writer + evento-pai/RLS | Writer + evento-pai/RLS | Grant de escrita + evento-pai/RLS | Mesma condição de escrita; vínculo isolado não autoriza |
| Exclusões `cronograma_delete_*` | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker |

Evidências das condições:

- O helper de escrita exige `has_capability(auth.uid(), org, 'cronograma_eventos_write')`: [migration:2](../../../supabase/migrations/20260812175755_22190adb-4709-47fd-b3f7-e483201e7cda.sql#L2). A implementação de `has_capability` encontrada herda permissões para admin/gestor/operador: [migration:30](../../../supabase/migrations/20260416170750_eaf9c72f-4022-4a76-9d7f-0e44e36c06d4.sql#L30).
- O hook atual também distingue papel operacional, grant explícito, visão restrita e planejamento: [useCronogramaEventos.ts:757](../../../src/hooks/useCronogramaEventos.ts#L757).
- `cronograma_unit_can_manage` aceita admin/gestor, capability de escrita ou responsável ativo em `commission_responsibles`: [migration:20](../../../supabase/migrations/20260911132853_d220ed5a-b585-4bfc-8d38-4689729a5d1d.sql#L20). Esse helper não substitui o writer check das RPCs de salvamento.
- O conjunto de leitura considera organização ativa, planejamento, escopo e relação com o evento: [0000:56](../../../drizzle/migrations/0000_rls_set_based_map_and_agenda.sql#L56). Políticas de escrita também têm efeito na leitura; a regra aditiva do criador para `INSERT ... RETURNING` está em [0002:1](../../../drizzle/migrations/0002_cronograma_eventos_select_creator_row.sql#L1).

### Assinaturas e divergências

| RPC | Contrato confirmado nos tipos |
|---|---|
| `cronograma_save_event` | `{ payload: Json, expected_lock_version?: number } → Json` |
| `cronograma_save_subevent` | `{ payload: Json, expected_lock_version?: number } → Json` |
| `cronograma_save_subevent_plan` | `{ payload: Json } → Json` |
| `cronograma_unit_agenda` / `cronograma_unit_metrics` | `{ _commission_id: string } → linhas` |
| `cronograma_visible_event_ids` / `cronograma_managed_commission_ids` | Sem argumentos; retornam IDs |

Fonte: [tipos:10999](../../../src/integrations/supabase/types.ts#L10999).

Há divergência entre a definição SQL de criação de `cronograma_unit_agenda` e os tipos: os tipos incluem `location_code`, `lock_version` e `source_key`, ausentes da lista de retorno da migration encontrada. Conferir o contrato implantado antes de depender desses campos: [tipos:11036](../../../src/integrations/supabase/types.ts#L11036), [migration:135](../../../supabase/migrations/20260911132853_d220ed5a-b585-4bfc-8d38-4689729a5d1d.sql#L135).

`cronograma_save_event` exige versão em atualizações e revalida a visibilidade ao repetir uma operação: [migration:470](../../../supabase/migrations/20261006120000_cronograma_restaurant_bridge.sql#L470). O contrato genérico `payload: Json` não autoriza aceitar campos arbitrários vindos do modelo.

### Inteligência de reuniões vinculada à Agenda

Existem `agenda_meeting_sessions`, `agenda_meeting_transcript_segments`, `agenda_meeting_transcript_versions`, `agenda_meeting_transcript_revision_segments`, `agenda_meeting_insights`, `agenda_meeting_action_items`, `agenda_meeting_minutes_versions`, `agenda_meeting_audit_events` e `agenda_meeting_user_consents`: [tipos:17](../../../src/integrations/supabase/types.ts#L17). Não se propõe expor transcrições completas como tool nesta pré-validação.

A análise atual usa OpenAI Responses diretamente: [analysis.ts:531](../../../supabase/functions/_shared/agenda-meeting/analysis.ts#L531), com modelo por `AGENDA_MEETING_ANALYSIS_MODEL`: [analysis.ts:957](../../../supabase/functions/_shared/agenda-meeting/analysis.ts#L957). A captura valida consentimento e participantes informados: [useAgendaMeetingCapture.ts:545](../../../src/features/agenda-meeting-intelligence/hooks/useAgendaMeetingCapture.ts#L545); o controle server-side recusa a ausência de confirmação: [agenda-meeting-control:62](../../../supabase/functions/agenda-meeting-control/index.ts#L62). O worker futuro deve preservar esses limites e conferir também a visibilidade da sessão antes de consultar ações/insights.

## Arena e Restaurante

### Inventário de fontes e operações

| Classificação para workers | Fontes/operações verificadas | Permissão/limite relevante |
|---|---|---|
| Leitura candidata | `venue_check_availability`, `venue_events`, `venue_occupancies`, `venue_spaces`, `venue_space_blocks`, `venue_event_spaces`, `venue_event_resources`, `venue_event_responsibles`, `venue_event_checklist_items`, `venue_event_notes` | `venue_events_access` e visibilidade efetiva do evento quando aplicável. RPC de disponibilidade mascara conflitos restritos. [Tipos:8571](../../../src/integrations/supabase/types.ts#L8571), [disponibilidade:8](../../../supabase/migrations/20260911103138_a6eaed17-6a1d-4dca-8aaf-78378a3fccaf.sql#L8). |
| Leitura candidata com gate próprio | `venue_counterpart_agreements`, `venue_counterpart_ledger`, `venue_counterpart_usage`, `venue_counterpart_balances` | `venue_counterparts_manage` ou `venue_reports_view`, além das restrições específicas aplicáveis. [Policies:794](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L794), [view:1149](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L1149). |
| Fonte existente; exposição mínima | `venue_stakeholders`, `venue_stakeholder_directory` | Preferir diretório seguro; dados de contato não devem ser enviados ao provedor por padrão. Tabela exige `venue_sponsors_manage`: [policy:789](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L789). |
| Fonte existente; gate sensível | `venue_event_documents`, `venue_event_approvals`, `venue_get_audit_history` | Documento sensível exige `venue_documents_sensitive`; auditoria exige `venue_events_audit_view`. Não enviar snapshots brutos ao modelo. [Policy:818](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L818), [auditoria:276](../../../supabase/migrations/20260727214559_4eb4b9bb-7fb5-4781-b848-ee471b976d91.sql#L276). |
| Leitura auxiliar de autorização | `venue_get_permissions`, `venue_has_capability` | Mecanismo do domínio, sem usar a herança genérica de `full_access`. [venue_get_permissions:208](../../../supabase/migrations/20260727214559_4eb4b9bb-7fb5-4781-b848-ee471b976d91.sql#L208). |
| Existentes, fora da tool de negócio | `venue_notification_subscriptions`, `venue_notification_deliveries`, `venue_mutation_receipts` | Preservar notificações e idempotência existentes; não criar tool para enviar mensagens ou manipular receipts. [Tipos:9374](../../../src/integrations/supabase/types.ts#L9374). |
| Escrita futura com confirmação | `venue_save_event_note`, `venue_update_checklist_item`, criação de rascunho por `venue_save_event` | Regras reais por operação abaixo. Não executar nas Fases 0/1. |
| Existente, fora da allowlist proposta | `venue_save_event_agenda` | Escrita adicional existente, não uma leitura nem substituto para as operações escolhidas. [Tipos:12142](../../../src/integrations/supabase/types.ts#L12142). |
| Proibida / não expor ao worker | `venue_delete_event`, `venue_delete_event_note`; aprovar/cancelar via `venue_transition_event` | Excluir, aprovar e cancelar não integram o escopo autorizado dos bots. Manter `venue_transition_event` fora da allowlist evita expor transições proibidas por payload. [Tipos:12020](../../../src/integrations/supabase/types.ts#L12020), [tipos:12170](../../../src/integrations/supabase/types.ts#L12170). |

### Matriz estática por tool candidata

`V-access` = `venue_events_access`; `V-manage` = `venue_events_manage`; `V-ops` = `venue_operations_manage`; `V-create` = `venue_events_create`; `V-reports` = `venue_reports_view`; `V-counterparts` = `venue_counterparts_manage`. São abreviações documentais das capabilities existentes.

| Tool/fonte | Admin | Gestor | Operador | Leitura | Membro/responsável de comissão |
|---|---|---|---|---|---|
| `venue_get_permissions` | Membro ativo; resolve capabilities | Membro ativo; resolve capabilities | Membro ativo; resolve capabilities | Membro ativo; resolve capabilities | Vínculo organizacional válido; comissão não concede capabilities Arena |
| `venue_check_availability` | V-access herdado | V-access herdado | V-access herdado no helper SQL | Grant V-access | Mesmo gate do seu papel/grants; conflito restrito permanece mascarado |
| `venue_events` | V-access + visibilidade | V-access + visibilidade | V-access + visibilidade | Grant V-access + visibilidade | Sem concessão automática pela comissão |
| `venue_occupancies` | V-access + evento visível | V-access + evento visível | V-access + evento visível | Grant V-access + evento visível | Sem concessão automática pela comissão |
| `venue_counterpart_balances` | V-reports/V-counterparts herdados | V-reports herdado | V-reports herdado no helper SQL | Grant V-reports ou V-counterparts | Mesmo gate do papel/grants; comissão não basta |
| `cronograma_restaurant_alert` | Papel aceito; valida intervalo/origem | Papel aceito; valida intervalo/origem | Papel aceito; valida intervalo/origem | Recusa pelo papel, mesmo com grant Arena | Depende do papel org: leitura não passa; comissão não substitui papel |
| `venue_save_event_note` | V-manage ou V-ops + evento visível | V-manage/V-ops herdados + evento visível | V-ops herdado no helper SQL + evento visível | Grant V-manage ou V-ops + evento visível | Mesmo gate, sem privilégio adicional da comissão |
| `venue_update_checklist_item` | V-ops + item/evento válidos | V-ops herdado + item/evento válidos | V-ops herdado no helper SQL + item/evento válidos | Grant V-ops + item/evento válidos | Mesmo gate; V-manage isolado não basta |
| `venue_save_event`, somente criar rascunho | V-create + validações | V-create herdado + validações | V-create herdado no helper SQL + validações | Grant V-create + validações | Mesmo gate; vínculo da comissão não cria permissão |
| Exclusão/aprovação/cancelamento | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker |

Evidências e diferenças do briefing:

- `venue_has_capability` exige membro ativo; admin herda o namespace, gestor e operador herdam listas distintas e grants aceitam a capability específica ou `venue_events_full_access`: [migration:18](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L18).
- O frontend trata `restricted_scope` em operadores e restringe a herança na UI: [CapabilitiesProvider.tsx:93](../../../src/contexts/CapabilitiesProvider.tsx#L93). O helper SQL encontrado não contém essa exceção; é necessário teste integrado desse perfil. Não usar a matriz estática para alegar que a UI e o servidor estão equivalentes.
- Visibilidade de evento restrito considera autor, responsável e capabilities específicas: [venue_can_view_event:634](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L634). RLS de eventos e tabelas relacionadas aplica essa função: [policies:755](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L755).
- `cronograma_restaurant_alert` exige `admin`, `gestor` ou `operador` e mascara título/horário quando não se pode visualizar o evento: [migration:662](../../../supabase/migrations/20261006120000_cronograma_restaurant_bridge.sql#L662). O exemplo de conflito para usuário leitura deve aceitar recusa, sem contornar o gate com outra identidade.
- `venue_save_event_note` permite V-manage **ou V-ops**, não só V-manage: [migration:62](../../../supabase/migrations/20260911101225_b5a3559d-dd0c-4e24-9dc2-224ab8e2d4be.sql#L62). O worker pode impor V-manage adicionalmente se esse for o escopo final aprovado, mas não deve descrevê-lo como requisito único da RPC existente.
- `venue_update_checklist_item` exige **V-ops**, não apenas V-manage: [migration:1191](../../../supabase/migrations/20260727215257_97c52bcb-d741-4523-833f-77b236eddb7b.sql#L1191).
- `venue_save_event` exige **V-create** ao criar; editar começa com V-access e verifica autoria/status: [migration:136](../../../supabase/migrations/20260727214922_f34ac08d-05e4-41e8-ba92-5f270abcb6e1.sql#L136), [migration:262](../../../supabase/migrations/20260727214922_f34ac08d-05e4-41e8-ba92-5f270abcb6e1.sql#L262). O worker futuro deve limitar explicitamente a criação ao rascunho, sem oferecer um payload genérico de edição.

### Assinaturas e idempotência

| RPC | Argumentos existentes | Consequência para implementação futura |
|---|---|---|
| `venue_check_availability` | `_org_id`, `_space_ids`, `_setup_start_at`, `_teardown_end_at`; opcionais `_exclude_event_id`, `_audience`, `_event_start_at`, `_event_end_at`, `_event_type` | Respeitar intervalo de montagem/desmontagem; não confundir com início/fim do evento. |
| `venue_save_event_note` | `p_event_id`, `p_body`, `p_note_id?` | Não há chave idempotente da RPC. Action card isolado não prova efeito único em falha/repetição; resolver antes da Fase 2. |
| `venue_update_checklist_item` | `_org_id`, `_item_id`, `_expected_version`, `_idempotency_key`, `_payload` | Reusar controle de versão e receipt existentes. |
| `venue_save_event` | `_org_id`, `_event_id`, `_expected_version`, `_idempotency_key`, `_payload` | A SQL admite criação com identificador nulo; tipos gerados dizem `string`. Validar o contrato sem esconder discrepância em cast genérico. |
| `cronograma_restaurant_alert` | `_org_id`, `_start_date`, `_end_date`, `_source_event_id?` | A origem opcional precisa ser real e visível; não serve para abrir acesso por comissão. |

Fontes: [tipos:11993](../../../src/integrations/supabase/types.ts#L11993), [tipos:12132](../../../src/integrations/supabase/types.ts#L12132), [tipos:11004](../../../src/integrations/supabase/types.ts#L11004). Os hooks atuais demonstram os contratos efetivamente enviados: [checklist:980](../../../src/hooks/useVenueOperations.ts#L980), [nota:1313](../../../src/hooks/useVenueOperations.ts#L1313).

## Financeiro — worker Caixa

### Inventário de fontes e operações

| Classificação para workers | Fontes/operações verificadas | Limite |
|---|---|---|
| Leitura agregada candidata | `financial_edition_summary` | Exige `financial_access` validado por `financial_require`; organização e edição explícitas. [Migration:745](../../../supabase/migrations/20261006200356_8633880e-2e4d-4354-bc01-53a604dfe92d.sql#L745). |
| Leitura agregada candidata | `financial_budget_execution` | Mesmo gate; manter valores em centavos e significado dos totais existentes. [Migration:982](../../../supabase/migrations/20261006200356_8633880e-2e4d-4354-bc01-53a604dfe92d.sql#L982). |
| Leitura agregada candidata | `financial_expense_comparison` | Mesmo gate; filtros validados no servidor. [Drizzle:351](../../../drizzle/migrations/0004_financial_expenses_2028_stage1.sql#L351). |
| Leitura auxiliar de autorização | `financial_can` | Validar `financial_access` por organização com a identidade do usuário. Não substituir por `hasCapability` genérico. |
| Tabelas existentes; sem tool de leitura detalhada nesta proposta | `financial_budgets`, `financial_budget_lines`, `financial_movements`, `financial_obligations`, `financial_revenues`, `financial_sponsorships`, `financial_scenarios`, `financial_editions`, `financial_audit_events` | Fontes do domínio confirmadas nos [tipos:3359](../../../src/integrations/supabase/types.ts#L3359); usar os agregados aprovados, sem extrair movimentos, contrapartes ou snapshots individuais. |
| Escritas permitidas ao Caixa | Nenhuma | Vale em todas as fases e para todos os papéis. |
| Proibidas para workers | `financial_record_movement`, `financial_reverse_movement`, `financial_transition_expense`, confirmação de pagamento e demais RPCs mutadoras `financial_*` | Permissão manual do usuário não autoriza o bot a executar uma operação financeira. [Tipos:11241](../../../src/integrations/supabase/types.ts#L11241), [tipos:11271](../../../src/integrations/supabase/types.ts#L11271), [tipos:11341](../../../src/integrations/supabase/types.ts#L11341). |

### Matriz estática por tool candidata

| Tool | Admin | Gestor | Operador | Leitura | Membro/responsável de comissão |
|---|---|---|---|---|---|
| `financial_can(org, 'financial_access')` | Verdadeiro se membro ativo admin | Somente grant financeiro aceito | Somente grant financeiro aceito | Somente grant financeiro aceito | Comissão não concede acesso financeiro |
| `financial_edition_summary` | Gate financeiro + edição/org válidas | Grant + edição/org válidas | Grant + edição/org válidas | Grant + edição/org válidas | Mesmo gate; nenhum acesso pela comissão isoladamente |
| `financial_budget_execution` | Gate financeiro + escopo | Grant financeiro + escopo | Grant financeiro + escopo | Grant financeiro + escopo | Mesmo gate do papel/grants |
| `financial_expense_comparison` | Gate financeiro + filtros/escopo | Grant + filtros/escopo | Grant + filtros/escopo | Grant + filtros/escopo | Mesmo gate do papel/grants |
| Toda escrita financeira | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker | Proibido ao worker |

`financial_can` considera membro ativo admin ou grant da capability pedida. Para `financial_access`, também reconhece `financial_edit`, `financial_confirm`, `financial_settle` ou `financial_admin`: [migration:5](../../../supabase/migrations/20261006200356_8633880e-2e4d-4354-bc01-53a604dfe92d.sql#L5). `full_access`, o papel gestor e o papel operador não bastam.

O `hasCapability` genérico retorna verdadeiro para qualquer namespace não `venue_` quando há acesso amplo: [CapabilitiesProvider.tsx:93](../../../src/contexts/CapabilitiesProvider.tsx#L93). Por isso, usar esse método sozinho para Caixa ampliaria o acesso além do gate financeiro. O hook financeiro correto já consulta `financial_can`: [useFinancialExpenseCapabilities.ts:20](../../../src/features/financial-management/operational/useFinancialExpenseCapabilities.ts#L20).

As assinaturas agregadas são `{ _org_id, _edition_id }`, com `_filters?: Json` adicional em `financial_expense_comparison`: [tipos:11135](../../../src/integrations/supabase/types.ts#L11135). Não há necessidade de SQL livre nem leitura direta de lançamentos.

## Testes ainda necessários antes do aceite das Fases 0/1

Nenhum dos testes abaixo foi executado por esta auditoria; são os casos exigidos para transformar a matriz estática em evidência de execução.

| Perfil/cenário | Verificação necessária |
|---|---|
| Admin/gestor/operador/leitura, em duas organizações | JWT do usuário e filtro de organização nunca retornam registros da outra organização. |
| Leitura sem grants | Agenda retorna apenas o permitido pela RLS; Arena e Caixa recusam acesso sem suas permissões; `cronograma_restaurant_alert` recusa pelo papel. |
| Responsável de comissão, com e sem grant de escrita | Consultas limitam os eventos; responsabilidade isolada não deve fazer as RPCs de salvamento ignorarem `_cronograma_require_writer`. |
| Operador com `restricted_scope` | Conferir diferença entre o provedor de capabilities da UI e o helper SQL Arena; bloquear tool no servidor conforme o escopo aprovado. |
| Usuário somente com `venue_events_access` | Disponibilidade respeita máscara de conflitos; não obtém contrapartidas sem V-reports/V-counterparts nem documentos sensíveis sem grant. |
| Usuário somente com `venue_events_manage` | Não presumir autorização para `venue_update_checklist_item`; a RPC exige V-ops. Nenhuma escrita pode ser executada na Fase 1. |
| Usuário com `full_access`, gestor ou operador sem grant financeiro | Caixa recusa, ainda que a checagem genérica de UI diga verdadeiro. |
| Leitura com `financial_access` | As três tools financeiras retornam apenas agregados da organização/edição autorizadas; nenhuma tool financeira mutadora pode ser registrada. |
| Texto em anexo/transcrição/formulário/web contendo instruções | Conteúdo permanece dado; não registra tools, não muda escopo e não dispara escrita. |
| Nome, descrição, responsável ou insight contendo dado pessoal | Minimização/mascaramento antes de logs, provedor e resposta; nome de exibição somente quando necessário. |
| Registro sem acesso ou inexistente | Tool não confirma existência fora do escopo; deep link não pode ampliar acesso. |
| Ferramenta proibida ou escrita na Fase 1 | Registry rejeita exclusão, operação financeira e qualquer handler de mutação; teste deve exercitar falha de registro, não apenas esconder botão. |

Critérios pendentes específicos: conferir o contrato implantado de `cronograma_unit_agenda`, resolver a divergência de permissão do checklist no briefing e demonstrar idempotência segura para notas antes de qualquer Fase 2. Esta pré-validação não aprova implantação, não altera o FCM/Google Calendar e não habilita novas ferramentas MCP.
