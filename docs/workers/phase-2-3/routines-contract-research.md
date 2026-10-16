# Pesquisa de contratos — rotinas, memória, eventos, caixa de entrada e uso

Data: 16/10/2026. Complementa o [plano das Fases 2 e 3](plan.md). **Proposta de arquitetura, sem implementação, migration aplicada ou deploy nesta pesquisa.** Todos os nomes de RPC, tabela e DTO apresentados como novos abaixo são contratos propostos; não são APIs existentes.

## 1. Base verificada e limite de autenticação

- O [registry atual](../../../src/lib/workers/registry.ts#L246) revalida a identidade, associação e capabilities a cada ferramenta. [resolveWorkerAccess](../../../src/lib/workers/access.ts#L7) exige `auth.getUser()`, associação ativa na organização solicitada e rejeita `service_role`.
- A [Edge atual](../../../supabase/functions/workers-orchestrator/index.ts#L65) usa uma única conexão com chave pública e JWT do chamador. O [cliente atual](../../../src/features/workers/api.ts#L89) envia `session.access_token`; a renovação da sessão permanece com o cliente Supabase existente.
- [ai_messages](../../../supabase/migrations/20261016120000_workers_readonly_workspace.sql#L14) aceita somente `user/assistant`. [ai_audit_events](../../../supabase/migrations/20261016120000_workers_readonly_workspace.sql#L31) tem enum de eventos restrito e não deve receber payloads/resultados de negócio. Eventos estruturados novos precisam de estrutura própria.
- [ai_usage](../../../supabase/migrations/20261016120000_workers_readonly_workspace.sql#L43) é `user_scoped`, tem `usage_complete` e permite somente `cost_usd=NULL`. As RPCs de finalização existentes são chamáveis pelo proprietário autenticado; seus contadores não são um ledger financeiro atestado.
- Existe [AES-GCM para OAuth Google](../../../supabase/functions/_shared/googleTokenCrypto.ts#L1) e [renovação de tokens Google](../../../supabase/functions/_shared/googleTokenService.ts#L97). Não são delegação Supabase. O [cron de Google Sync](../../../supabase/migrations/20260722234000_google_calendar_oauth_hardening.sql#L721) usa Vault/credencial interna e não serve como identidade do usuário dos bots.
- Não foi encontrada implementação de delegação Supabase/token exchange/emissão própria de JWT no código inspecionado. Não foram lidos valores de secrets nem verificado seu inventário remoto. Não se conclui ausência de um secret no ambiente apenas por ausência no código.

Modo adotado para o planejamento: `executionMode='authenticated_session'`, conforme orientação de coordenação em 16/10/2026 enquanto não houver preferência diferente. A execução ocorre com JWT real enquanto o app está ativo; uma rotina vencida é recuperada ao entrar. A UI declara esse limite. Não armazenar access/refresh token, não copiar credenciais Google, não criar identidade técnica com acesso ao negócio e não emitir JWT em nome do usuário. Offline às 8h não pode ser anunciado como execução garantida às 8h. Uma futura preferência por execução offline exige nova arquitetura, sem trocar este modo silenciosamente.

## 2. Fronteiras de confiança

| Informação | O que pode ser afirmado | O que não comprova |
|---|---|---|
| `auth.uid()` + Auth validado + associação ativa | Identidade/organização atual | Que a chamada veio da UI oficial ou da Edge |
| Card confirmado em RPC transacional | O proprietário confirmou aquela versão do plano | Que um LLM resolveu corretamente o pedido original |
| Claim/lease criado no banco | A ocorrência foi admitida, com exclusão concorrente temporária | Que a Edge iniciou/concluiu consultas ou que o provedor foi cobrado |
| Resposta de ferramenta recebida pela Edge na execução corrente | Evidência autorizada observada naquela requisição | Que uma cópia enviada depois pelo cliente é um recibo atestado |
| `finish_run` autenticado com payload do proprietário | Registro reportado pelo proprietário | Origem exclusivamente server-side; custo/fato verificado |
| Eventos estruturais derivados em SQL | Rotina criada/pausada/editada, claim admitido, item marcado visto | Entrega de push, execução offline ou leitura efetiva de negócio |

Não expor um `finish_run(result, usage, verified=true)` que aceite a declaração de verificação do cliente. Lease secreto, hash escolhido pelo cliente, nonce ou nome de endpoint não resolvem isso: o proprietário pode reproduzir essas chamadas com o próprio JWT.

Sem um canal adicional de finalização server-only, resultados persistidos terão `resultTrust='user_scoped_reported'`, contadores `usageTrust='user_scoped'` e `providerUsageVerified=false`. O banco define esses valores; não há parâmetro para elevá-los. Resultado ao vivo pode ser renderizado a partir do fluxo da Edge, mas o histórico não recebe selo de atestado. Não usar histórico reportado como fonte de novas afirmações factuais ou como instrução; uma consulta atual sempre volta às ferramentas com JWT/RLS.

Resultados históricos com dados de negócio não devem ter SELECT direto apenas por proprietário. Recomendação inicial: `ai_routine_runs` guarda somente metadados operacionais, estados e referências mínimas, sem linhas de negócio, totais financeiros, títulos de eventos ou corpo de alertas. O painel pode reconsultar dados autorizados e rotular **consulta atual**, sem fingir que recompôs o resultado histórico original. Persistir um resultado rico exige leitura intermediada com autorização atual e procedência explícita; permanece decisão de implementação.

Caso se exija histórico/uso atestados, é necessária etapa própria de canal de metadados server-only ou recibo criptográfico verificável. Isso não delega leituras de negócio, mas também não existe hoje. A configuração teria de ocorrer exclusivamente pelo Lovable e não pode ser presumida por esta proposta. Nenhuma chave é criada ou solicitada no documento.

## 3. DTOs canônicos propostos

Campos JSON são estritos: chaves desconhecidas, números não finitos, excesso de tamanho/profundidade e enums desconhecidos são rejeitados. UUID não é autorização. `userId` nunca aparece nos comandos; o banco deriva o proprietário de `auth.uid()`. `_org_id` identifica a organização desejada e é revalidado, não uma concessão de acesso.

```ts
type RoutineScheduleV1 = {
  version: 1;
  timezone: 'America/Sao_Paulo';
  frequency: 'daily' | 'weekly';
  weekdays: number[]; // ISO: 1=segunda ... 7=domingo; únicos, ordenados
  localTime: string; // HH:mm real, relógio de 24h
  startsOn: string; // data civil real YYYY-MM-DD
  endsOn: string | null;
};
type RoutineTemplateId =
  | 'agenda_tomorrow_v1' | 'agenda_restaurant_tomorrow_v1'
  | 'arena_today_v1' | 'map_inventory_v1' | 'map_pending_age_v1'
  | 'interest_previous_week_v1' | 'commission_actions_v1'
  | 'logistics_today_v1' | 'transport_weather_v1'
  | 'financial_summary_v1' | 'radar_primary_sources_v1';
type RoutineSpecV1 = {
  version: 1;
  workerId: WorkerId;
  templateId: RoutineTemplateId;
  title: string; // 1..100, mascarado
  schedule: RoutineScheduleV1;
  params: Record<string, unknown>; // união fechada por template, descrita abaixo
  executionMode: 'authenticated_session';
  catchUpPolicy: 'same_local_day_latest_only';
};
type RoutineDTO = {
  id: string; orgId: string; conversationId: string;
  version: number; spec: RoutineSpecV1;
  status: 'active' | 'paused' | 'archived';
  nextDueAt: string | null; // UTC ISO, calculado pelo banco
  currentAccess: 'allowed' | 'requires_permissions' | 'unresolved_scope';
  createdAt: string; updatedAt: string;
};
type RoutineRunDTO = {
  id: string; routineId: string; routineVersion: number;
  scheduledFor: string; scheduledLocalDate: string; // imutáveis
  referenceDate: string; timezone: 'America/Sao_Paulo';
  state: 'claimed' | 'reported_success' | 'reported_failure' | 'skipped';
  claimGeneration: number; leaseExpiresAt: string | null;
  startedAt: string | null; finishedAt: string | null;
  executionMode: 'authenticated_session';
  catchUp: boolean;
  reason: 'session_required' | 'permissions_changed' | 'scope_unavailable'
    | 'stale_occurrence' | 'lease_expired' | 'data_unavailable'
    | 'rate_limited' | 'cancelled' | null;
  resultTrust: 'user_scoped_reported' | 'none';
  requestId: string;
};
type MemoryDTO = {
  id: string; orgId: string; version: number;
  kind: 'response_style' | 'preferred_worker' | 'preferred_commission'
    | 'preferred_project' | 'briefing_focus' | 'note';
  workerIds: WorkerId[]; value: Record<string, unknown>;
  state: 'enabled' | 'disabled' | 'archived';
  source: 'user_explicit'; createdAt: string; updatedAt: string;
};
type SystemEventDTO = {
  id: string; conversationId: string; createdAt: string;
  kind: 'routine_created' | 'routine_edited' | 'routine_paused'
    | 'routine_archived' | 'routine_creation_undone' | 'routine_run_claimed'
    | 'routine_run_reported' | 'routine_run_skipped' | 'memory_changed';
  routineId: string | null; runId: string | null; entityVersion: number;
  data: Record<string, unknown>; // enum/horários/versão; sem texto ou URL livres
  trust: 'database_metadata' | 'user_scoped_reported';
};
```

`workerIds` usa os oito IDs técnicos atuais; interface permanece “bots”. Não incluir token, header, nome de relação/RPC, URL de execução, SQL, cron, prompt de sistema, lista de permissões ou preço nos DTOs. O mapeamento de camelCase para argumentos SQL fica em uma fronteira tipada compartilhada.

## 4. Normalização de linguagem natural e templates

Texto não é plano executável. Fluxo: mascarar/minimizar → interpretar uma intenção suportada → resolver referências por ferramentas autorizadas → validar JSON canônico estrito → exibir card com data, fuso, consultas e limite de sessão → confirmar ID/versão. O modelo só sugere um DTO; não escreve banco, escolhe tabela, define capability, confirma card ou fornece “cron pronto”. Datas/horários e calendário são normalizados novamente no servidor/banco.

Exemplo: “todo dia útil às 8h me mostra os eventos de amanhã e conflitos com Restaurante” vira `agenda_restaurant_tomorrow_v1`, `weekdays=[1,2,3,4,5]`, `localTime='08:00'`, `timezone='America/Sao_Paulo'`. A UI confirma que “dias úteis” significa segunda a sexta; não promete exclusão de feriados sem calendário oficial. Texto “às 8” é mostrado como 08:00 antes da confirmação. “De tempos em tempos”, “primeiro dia útil do mês”, “às 8 em qualquer fuso”, destinatário terceiro e ação automática fora do escopo geram esclarecimento/formulário, nunca cron inferido.

Não consultar ou salvar links públicos com token em params/memória. Uma comissão/projeto/edição ambígua deve ser escolhida dentre registros realmente retornados; não inferir UUID pelo nome. Referências resolvidas na criação não concedem acesso futuro. Alterar horário, escopo ou consulta gera nova versão/diff e nova confirmação; nunca altera silenciosamente uma rotina ativa.

| Template proposto | `params` estritos | Ferramentas existentes/limites |
|---|---|---|
| `agenda_tomorrow_v1` | `{}` | `list_events` com dia civil da ocorrência +1 e `limit<=100`. “Eventos” atualmente filtra por `start_date`, não todos os eventos sobrepostos ao intervalo. |
| `agenda_restaurant_tomorrow_v1` | `{}` | `list_events` + `restaurant_alert`, ambos autorizados; não declarar união exata por evento sem IDs/evidência suficientes. O alerta atual retorna título/data, sem ID. |
| `arena_today_v1` | `{}` | `list_venue_events` com limites do dia; não prometer checklist, que não tem ferramenta de leitura registrada nesta base. |
| `map_inventory_v1` | `{projectId: UUID, status?: enum persistido}` | `map_inventory`. Não inventar filtro por pavilhão: o schema atual não o oferece. |
| `map_pending_age_v1` | `{projectId: UUID, minAgeDays: inteiro 1..90}` | `list_sale_orders(status='PENDING')`; filtrar os registros retornados por `created_at`, `kind='ORDER'` e `pending_count>0`. “Em aberto há N dias desde a criação”, não “sem atividade”. |
| `interest_previous_week_v1` | `{}` | `interest_summary` + opcional `public_links_overview`; semana civil anterior, fontes sem tokens. Máximo de 50 áreas já imposto pelo reader. |
| `commission_actions_v1` | `{commissionId: UUID,eventId: UUID,sessionId: UUID}` | `meeting_actions`; escopo persistido e consentimento revalidado. “Todas as reuniões da comissão” não é suportado por essa única consulta. |
| `logistics_today_v1` | `{}` | `list_transports` com limites do dia; `inicio_em` é o filtro atual, não inferir cobertura de todos os transportes em andamento. |
| `transport_weather_v1` | `{}` | `transport_weather`; risco `critico` somente se `valid_until` ainda válido na execução. Sem atualizar cache/chamar `weather-service`. |
| `financial_summary_v1` | `{editionId: UUID}` | `financial_edition_summary`; somente agregados, sempre `financial_can`. Não cria alertas de pagamento nem ação financeira. |
| `radar_primary_sources_v1` | `{topic: 'fenasoja'|'agro'|'clima'}` | Busca configurada existente, uma chamada limitada, domínios primários/citações atuais. Sem query ou domínio arbitrário persistido; indisponível se conector/configuração falhar. |

Estas são propostas de disponibilidade. Os limites reais são evidenciados nos schemas de [Agenda](../../../src/lib/workers/tools/agenda/index.ts), [Arena](../../../src/lib/workers/tools/arena/index.ts), [Mapa](../../../src/lib/workers/tools/mapa/index.ts), [Comissão](../../../src/lib/workers/tools/comissao/index.ts), [Logística](../../../src/lib/workers/tools/logistica/index.ts), [Caixa](../../../src/lib/workers/tools/caixa/index.ts) e [Interesse](../../../src/lib/workers/tools/interesse/index.ts). Os readers atuais [limitam/podem truncar](../../../src/lib/workers/sources.ts#L52); filtrar uma lista parcial não autoriza afirmar total global. Não anunciar templates como habilitados até passar a validação de ponta a ponta.

Uma rotina não guarda uma lista arbitrária de `toolNames/input`. Um catálogo fechado `templateId → worker(s), ferramentas, regras de params e âncora de data` é compartilhado pelo parser/runner; SQL revalida os IDs de template e schemas que armazena. Uma versão de template desconhecida exige reproposta. Novas leituras necessárias são mudanças futuras explícitas, com auditoria e testes; não ampliar consulta/RPC silenciosamente para ajustar o texto.

## 5. Data de referência, recuperação e calendário

Usar o [EVENT_TIME_ZONE](../../../supabase/functions/_shared/eventDateTime.ts#L1) já existente. Banco calcula `scheduledFor` a partir da data civil + HH:mm + IANA, e mantém `scheduledLocalDate/referenceDate` imutáveis; nunca recebe essas âncoras do cliente no claim. Não fixar UTC−3. Validar datas civis reais, horários existentes e limites `startsOn<=endsOn`; caso ambíguo de offset requer regra explícita/testada em vez de executar duas vezes.

- “Amanhã” = `scheduledLocalDate + 1 dia civil`, mesmo se a execução ocorrer às 09h37.
- Semana anterior = segunda 00:00 até segunda 00:00 da semana da ocorrência, no fuso. O reader de Interesse atual usa limite superior inclusivo; documentar/normalizar sua precisão na implementação, sem contar a fronteira em dois períodos por acidente.
- Clima = validade no relógio da execução, não no horário originalmente previsto. Não usar cache que já expirou para declarar risco atual.
- Sem executor autenticado, `nextDueAt<agora` significa “aguardando sessão”; não é prova de que um cron rodou. Não inventar `startedAt` às 8h.
- Recuperar somente a ocorrência mais recente do mesmo dia civil; registrar anteriores vencidas como `skipped/stale_occurrence`. Não enviar uma semana de briefings ao entrar. Ocorrência de ontem não muda de alvo para parecer briefing de hoje.
- Primeiro horário = próxima ocorrência estritamente futura após confirmação. Não criar execução retroativa por padrão. Pausar impede novos claims; retomar começa pela próxima ocorrência futura.

Primeira versão pode calcular pendências na chamada autenticada, sem cron. Se um cron for adicionado, sua função restrita manipula apenas metadados `ai_routines/ai_routine_runs`; não recebe tokens, não lê negócio, não chama provider ou ferramenta. Não alterar jobs FCM/Google existentes.

## 6. RPCs e endpoints novos propostos

Todas as RPCs públicas abaixo: EXECUTE somente `authenticated`, proprietário derivado, associação ativa, schemas estritos, limites no servidor, `search_path` fixo, sem SQL dinâmico. Helpers definer ficam restritos a metadados/checagem de permissões; nenhuma leitura de negócio elevada. As leituras de negócio continuam no registry/cliente JWT, inclusive validação de IDs. Metadados de um ID inacessível nunca são prova de que ele existe. Campos de capabilities enviados pelo cliente são ignorados/rejeitados.

As migrations futuras são aditivas: `ai_routines`, `ai_routine_runs`, `ai_memory`, `ai_system_events` e, se necessário para seen/deduplicação, `ai_inbox_items`. Todas com RLS e owner/org obrigatórios. SELECT próprio usa `user_id=(SELECT auth.uid())` e conjunto de organizações ativas calculado uma vez via `ai_workers_member_org_ids()`. Nenhum INSERT/UPDATE/DELETE direto é concedido ao cliente; comandos passam pelas RPCs estreitas. Não abrir policies de admin para ler conteúdo de terceiros. FK composta em relações próprias, índices `(user_id,org_id,updated_at,id)` para paginação e `(user_id,org_id,next_due_at)` para admissão; nenhuma policy de negócio existente é alterada. Campos de origem opcionais usam CHECK para admitir apenas a combinação de referências prevista pelo enum, sem referência livre a entidade alheia.

| RPC proposta | Argumentos | Retorno/garantias |
|---|---|---|
| `ai_routines_list` | `_org_id uuid, _cursor jsonb=null, _limit int=20` | Página de `RoutineDTO`; só próprias, cursor opaco com desempate ID, máximo 50. Pode mostrar controles para pausar rotina cujo acesso foi revogado, sem revelar dados de negócio antigos. |
| `ai_routines_confirm_create` | `_org_id uuid, _action_id uuid, _expected_action_version int, _request_id uuid` | `{routine,event,replayed}`. Integração proposta com card de metadados `routine.create` em `ai_actions`; lê payload privado já normalizado, não recebe novo spec na confirmação. Valida expiração/card/owner/org/gates e quota; transação única para rotina, evento e receipt. |
| `ai_routines_confirm_edit` | `_org_id uuid, _action_id uuid, _expected_action_version int, _expected_routine_version int, _request_id uuid` | Mesmo envelope; card propõe alteração canônica. CAS impede sobrescrever mudança concorrente; não modifica ocorrência já em execução. |
| `ai_routines_set_state` | `_org_id uuid, _routine_id uuid, _expected_version int, _state text, _request_id uuid` | `paused/active/archived` apenas. Voltar a `active` revalida gates. Pausar/arquivar é permitido ao proprietário ativo mesmo se perdeu a capability do worker. Sem apagar histórico. |
| `ai_routines_undo_creation` | `_org_id uuid, _routine_id uuid, _expected_version int, _request_id uuid` | Arquiva futuras ocorrências e gera evento; só se a versão corresponde à criação ainda não alterada. Não apaga runs nem desfaz negócio; conflito exige revisão, não restauração cega. |
| `ai_routines_claim_due` | `_org_id uuid, _request_id uuid, _limit int=1` | `{claims:[{run,spec,claimGeneration}],skippedCount}`. Banco deriva vencimentos, âncora, lease e owner. Sem `_user_id`, hora, ferramenta, TTL ou data de execução fornecidos pelo cliente. Máximo 2 claims, quotas compartilhadas por usuário. |
| `ai_routines_report_run` | `_org_id uuid, _run_id uuid, _claim_generation int, _request_id uuid, _report jsonb` | Retorna run de procedência `user_scoped_reported`. `_report` permite somente resultado operacional limitado, enum de falha e contadores reportados opcionais; sem `verified`, custo, HTML, URL livre ou linhas de negócio. Rejeita lease/fence/owner/versão incorretos; repetição idêntica devolve receipt. |
| `ai_routine_runs_list` | `_org_id uuid, _routine_id uuid, _cursor jsonb=null, _limit int=20` | Página de metadados, sem corpo de consulta histórica. Não aceita filtro de outro usuário nem lista global de admin. |
| `ai_memory_list` | `_org_id uuid, _worker_id text=null` | Preferências próprias habilitadas/desabilitadas, máximo 100. Sem leitura administrativa de colegas. |
| `ai_memory_save` | `_org_id uuid, _memory_id uuid=null, _expected_version int=null, _request_id uuid, _entry jsonb` | `MemoryDTO`; somente tipos/campos permitidos, `source='user_explicit'` imposto. Criar requer ID/versão nulos; editar exige CAS. Não admite conteúdo externo como memória automática. |
| `ai_memory_set_state` | `_org_id uuid, _memory_id uuid, _expected_version int, _state text, _request_id uuid` | `enabled/disabled/archived`; sem delete físico, idempotência e evento privado. |
| `ai_system_events_list` | `_org_id uuid, _conversation_id uuid, _cursor jsonb=null, _limit int=30` | Eventos próprios e estruturados; FK composta impede conversa de outro owner/org. Não há RPC genérica pública `insert_event(kind,text,payload)` livre. |
| `ai_inbox_list` | `_org_id uuid, _cursor jsonb=null, _limit int=20` | Página unificada de referências próprias a ações pendentes, alertas reportados e estados de rotina. Recalcula estado/expiração da ação original; não cria cópia autoritativa de `proposed`. |
| `ai_inbox_mark_seen` | `_org_id uuid, _item_id uuid, _request_id uuid` | `{id,seenAt,replayed}`; aceita apenas item próprio. Marcar visto não confirma card, cancela rotina nem resolve conflito de negócio. |
| `ai_usage_admin_summary` | `_org_id uuid, _from timestamptz, _to timestamptz, _group_by text, _cursor jsonb=null, _limit int=50` | Agregados próprios da organização, gate **org_role admin ativo** e intervalo máximo 90 dias; `group_by='user'|'worker'|'user_worker'`. Sem conteúdo de mensagens, memória, anexos ou custos inventados. |

Integração HTTP proposta: `workers-routines` com `verify_jwt=true`, comandos estritos `propose_create/propose_edit/execute_due`; memória/inbox podem usar as RPCs tipadas diretamente. `propose_*` usa modelo apenas para candidato a template e card; chamadas de confirmação ficam fora das ferramentas do modelo. `execute_due` recebe apenas `{orgId,requestId}`, faz claims e executa o catálogo determinístico autorizado; não recebe plano, target user, lista de ferramentas ou resultados do browser. Não reutilizar o parser atual que [recusa mutações genericamente](../../../supabase/functions/_shared/workers/contracts.ts) sem distinguir os comandos próprios de metadados das ações de negócio proibidas.

O SSE da execução pode adicionar eventos tipados `routine_run/progress/result/citations/done/error`, com schema estrito no cliente. `done` só aparece após receipt, sem otimismo. Resposta live de ferramenta contém origem/limites conhecidos; a UI nunca transforma `_report` histórico em resultado atestado. Limpar aborts, caches e in-flight ao trocar usuário/org; endpoint usa exclusivamente o cliente JWT, sem auto-refresh server-side.

## 7. Lease, idempotência, limites e falhas

Nova `ai_routine_runs` usa FK composta `(routine_id,org_id,user_id)` e unicidade **`(routine_id,scheduled_for)`**, independentemente da versão. A versão fica como snapshot. Editar a rotina não pode recriar a mesma ocorrência porque a versão mudou; cada geração de claim usa o mesmo run lógico. Receipt idempotente inclui hash do comando canônico: reutilizar request ID com payload diferente gera conflito, não sucesso silencioso.

Proposta inicial de limites, impostos no banco/Edge e ajustáveis apenas por configuração revisada: 10 rotinas ativas por usuário, 2 runs simultâneos por usuário, 2 claims por chamada, 4 consultas por run, 100 registros por consulta, execução de até 45s e lease de 90s. Criação por texto e Radar têm limites próprios de provider/chamadas. Rotinas e chat compartilham orçamento de admissão; não abrir um caminho alternativo ilimitado fora dos limites atuais. Os números são proposta, não limites existentes.

Claim transacional: lock por usuário/rotina com ordem fixa, `FOR UPDATE SKIP LOCKED` quando houver múltiplos candidatos, horário `clock_timestamp()` depois do lock, cálculo de próxima ocorrência e geração de fence. Não confiar no relógio do browser. JWT com sessão renovada no cliente antes da execução; falha 401 não dispara fallback privilegiado. Revalidar Auth/associação e gates antes de cada ferramenta e novamente ao disponibilizar resultado de negócio; identidade/org não podem mudar no meio da execução.

`claimGeneration` é fencing, não segredo. Finalização de geração antiga após retomada é rejeitada. Lease expirado permite retry limitado das leituras no mesmo run, sem duplicar evento/inbox; uma execução anterior deve parar pelo deadline/abort. Unicidade evita duplicação persistida, mas não prova uma única requisição HTTP a um provedor após queda de rede. Para Radar, falha após envio pode ter custo desconhecido; não repetir automaticamente uma requisição paga ambígua e chamar isso de exatamente uma cobrança. Exibir tentativa inconclusiva e permitir nova consulta explícita.

Pausar/Desfazer durante um run impede novas consultas assim que a próxima verificação ocorrer; leitura que já terminou não pode ser “deslida”. Cancelamento preserva claim/auditoria. Sem receipt, não exibir sucesso definitivo. Falha de capability deixa rotina controlável pelo owner e execução bloqueada; não troca para outro worker/ferramenta para contornar a negação.

## 8. Quem pode criar, executar e ver

Consultar perfis públicos dos bots continua independente de permissão. Rotinas são pessoais: nenhum papel cria/executa em nome de outra pessoa, nem admin. Ver/pausar/arquivar metadados próprios exige associação ativa à organização; retomar/criar/executar exige todas as permissões atuais do template. Associação revogada oculta os dados e impede qualquer comando. Admin de uso vê apenas agregados de uso, não rotinas, memória ou inbox alheias.

| Bot/template | Gate de criação/retomada/execução | Escopo adicional |
|---|---|---|
| Agenda | Associação ativa; ferramentas `member` sob RLS | Só eventos realmente visíveis. Template cruzado Restaurante exige também autorização Arena; acesso a Agenda não concede Arena. |
| Arena | `authorizeWorkerPolicy('venue')`, incluindo `venue_get_permissions` | Contrapartidas, se adicionadas, exigem policy `venue_reports`; não inferir acesso por rótulo do papel. |
| Mapa/inventário | `authorizeWorkerPolicy('map')` | Projeto ativo da org + RLS. Gates atuais podem reconhecer privilégios de papéis; não recriar um gate frontend diferente. |
| Mapa/vendas | `authorizeWorkerPolicy('map_sales')` e `map_has_explicit_capability(...,'map.manage_sales')` | Projeto persistido. Contratos, se adicionados, também requerem `map_contracts`. |
| Interesse | `authorizeWorkerPolicy('analytics')` e wrappers existentes | Analytics **e** gate comercial; não basta `map.view`. [Wrappers](../../../supabase/migrations/20261016120100_workers_interest_scoped_reads.sql#L3) validam org/associação, `has_capability(map.analytics.view)` e `map_has_explicit_capability(map.manage_sales)`. |
| Comissão | `commission` e vínculos persistidos | Comissão/evento/sessão exatos; Central só admin. `consent_confirmed`, vínculo evento-comissão e RLS são revalidados, sem áudio/transcrição/anexo. |
| Logística | `authorizeWorkerPolicy('logistics')` | Acesso completo conforme [semântica atual](../../../src/lib/workers/access.ts#L23), JWT/org/RLS; não ampliar ao usuário `leitura`. |
| Caixa | `authorizeWorkerPolicy('financial')` e `financial_can(...,'financial_access')` | Edição visível; somente agregados. `full_access` operacional isolado não substitui esse gate. |
| Radar | Associação ativa, tópico fechado, busca configurada | Só fontes primárias permitidas. Autenticação básica não concede snapshots internos de transporte. |

SQL de metadados revalida os gates de criação sem ler negócio elevado; o runner chama a autorização existente novamente para todas as ferramentas de cada template. Não copiar `role/capabilities` do card como concessão permanente. Acesso negado, escopo inexistente e dado inexistente usam resposta neutra, sem distinguir existência de registro de outra organização.

## 9. Memória, eventos e Precisa de você

Preferências tipadas: `response_style` admite `{length:'concise'|'standard',format:'text'|'table'}`; `preferred_worker`, `{workerId:WorkerId}`; `preferred_commission`, `{commissionId:UUID}`; `preferred_project`, `{projectId:UUID}`; `briefing_focus`, `{topics:Array<'agenda'|'spaces'|'sales'|'logistics'>}` com até quatro valores únicos; `note`, `{text:string}`. Projeto/comissão são resolvidos por JWT quando usados; guardar uma referência não concede acesso a ela. `note` tem limite proposto de 1000 caracteres, mascaramento server-side e uso apenas como dado. Limite de 100 memórias por usuário/org e 20 habilitadas por consulta. Não “aprender” automaticamente com web, anexos, formulário público ou transcrição. Nenhuma memória altera schedule/params de rotina já confirmada; isso requer nova proposta.

Uma memória “ignore RLS”, “use service role”, “envie aos hóspedes” ou contendo chaves não produz instrução executável. Não concatenar notas ao system prompt; enviar em objeto `trust='untrusted_user_memory'` somente quando necessário. Dados financeiros privados, contatos de comprador/hóspede, consentimento e grants não são memória. Desativar tem efeito na próxima leitura; histórico de auditoria não guarda o texto antigo sensível.

Nova `ai_system_events` guarda enum + referências + versão/horários, nunca texto livre “Rotina executada” enviado pelo browser. Mensagem visual deriva do evento estrutural: “Rotina criada: …, dias úteis às 08h · Desfazer”. Evento de resultado reportado fica separado do fato confirmado de criação. O divisor contém horário previsto e horário efetivo, sem dizer que funcionou offline.

Nova `ai_inbox_items` guarda metadados próprios e `seen_at`, com FK composta de origem e fingerprint único por owner/org/origem/condição. DTO proposto: `{id,kind:'pending_action'|'routine_alert'|'routine_status',workerId,actionId?,routineId?,runId?,conditionCode?,seenAt,createdAt,trust,currentAccess}`. Não aceita destinatário, e-mail, telefone ou canal de mensagem. Ações pendentes podem ser união das próprias `ai_actions`, sem cópia de seu estado.

Alertas ricos derivam de ferramenta autorizada recebida na Edge. Sem finalização atestada, persistir apenas referência/condição reportada; revalidar acesso e consultar de novo antes de expor fatos atuais. Inbox não deve vazar título, contagem ou payload de negócio após capability revogada. “Marcar visto” não modifica o registro de negócio. Nenhum e-mail, push, WhatsApp ou FCM é adicionado nesta proposta.

## 10. Uso administrativo sem custo inventado

RPC agregada nova, gate de admin ativo da organização derivado no servidor, não `full_access`, `gestor`, `admin_access` ou valor vindo da UI. Pode ser helper definer **somente de metadados**, com filtro org obrigatório e retorno limitado; não ampliar SELECT de `ai_usage`, nem juntar mensagens/memórias/anexos. Identificar usuário por UUID e, se necessário, nome da `org_members_safe` com permissão validada; não retornar contato.

DTO proposto por grupo:

```ts
type UsageGroupDTO = {
  workerId?: WorkerId; userId?: string;
  admittedTurns: number; admittedRoutineRuns: number; // fatos de admissão no DB
  reportedUsageRows: number;
  reportedInputTokens: number | null; reportedOutputTokens: number | null;
  incompleteUsageRows: number; failedAdmissions: number;
  usageTrust: 'user_scoped'; providerUsageVerified: false;
  estimatedCostUsd: null; actualCostUsd: null; costAvailable: false;
};
```

Admissão não significa consulta/chamada ao LLM realizada. Ausência de linha de uso não significa zero consumo. Não chamar contadores reportados de “tokens faturados”. Em falha, preservar uso parcial e indicar cobertura incompleta; sem evidência, `null`. O banco rejeita custo/flag de atestado em finalização pública. Um custo estimado futuro exige tabela de tarifas versionadas/procedência e rótulo explícito; custo real depende de fonte de cobrança verificável. Não alterar o CHECK atual nem preencher um preço inventado para satisfazer a tela.

## 11. Critérios de teste e decisões pendentes

Testes sintéticos a implementar, não executados por esta pesquisa:

1. Papéis admin/gestor/operador/leitura, comissão com/sem grants, outra pessoa/org, JWT ausente/expirado/service role e revogação no meio do run. Admin não acessa memória/inbox/rotinas de colega; leitura controla a própria rotina bloqueada sem conseguir executá-la.
2. NL com datas reais/inválidas, dias úteis/feriados, ambiguidade de comissão, chave extra, SQL/cron/URL/token/capability injetados, template desconhecido e tentativa de write. Nada disso cria plano executável fora da allowlist.
3. Segunda/sexta/fim de semana, mudança de data local versus UTC, 08h, ocorrência atrasada, janela de recuperação, pausa/retomada e referência imutável de “amanhã”. Fonte de clima expirada não produz alerta crítico atual.
4. Duas conexões Postgres reais disputando claim/confirm/editar/Desfazer; mesma ocorrência/versão alterada gera um run lógico. Fence antigo, request ID com payload diferente e expiração durante lock falham corretamente. PGlite serializado não prova concorrência. A coordenação informou disponibilidade local de binários PG 16.14 em `/tmp/fenasoja-workers-pg/node_modules/@embedded-postgres/darwin-arm64/native/bin` e cliente `pg@8.16.3`; a pesquisa não iniciou cluster nem executou testes.
5. Chamada direta às RPCs autenticadas não eleva `trust`, não informa custo verificado, não insere evento estrutural arbitrário nem dados de outra pessoa. Dados reportados nunca entram no planner como fato ou instrução.
6. Limites independem do browser; repetir Radar após falha ambígua não recebe promessa de cobrança única. Abort/sessão expirada não aciona caminho privilegiado; nenhuma rotina confirma ação de negócio.
7. Memória com prompt injection/PII/segredo é minimizada, editável e desativável. Consentimento de reuniões revalidado; não existem leituras de transcrição/áudio por rotina.
8. Inbox deduplicada, seen idempotente, card expirado sai de pendentes e usuário sem capability não recebe payload/Confirmar. Admin de uso recebe só agregados com procedência/cobertura e custo nulo.
9. Regressão FCM/Google/Agenda/public map e nenhuma recarga global, alteração de geometria/câmera, policy de negócio ou token global de estilo.

Decisões restantes antes de implementar: se resultados ricos históricos precisam ser atestados (e qual canal adicional autorizado); templates realmente habilitados frente às limitações atuais; quotas finais. O modo autenticado/catch-up está adotado como premissa declarada, sem promessa offline. Não apresentar checklist automático, todos os eventos sobrepostos ou custo real como capacidades entregues sem implementação e evidência específicas.
