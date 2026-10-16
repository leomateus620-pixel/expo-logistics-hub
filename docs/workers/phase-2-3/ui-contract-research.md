# Fases 2 e 3 — proposta de contrato da interface dos Bots

Data: 16/10/2026. Estado: **pesquisa e contrato proposto; não implementado**. Depende da ativação e verificação da base F0+1 pelo Lovable. Este documento complementa [o plano conjunto](./plan.md); não cria endpoints, tabelas, capabilities ou comportamento já disponível. Os nomes de DTOs e operações abaixo são propostas para congelar antes da implementação paralela.

## 1. Base verificada e decisões de integração

- `src/features/workers/types.ts:1` já define os oito IDs e os modelos de mensagem, fonte, conversa, mascote e catálogo. Preservar esses identificadores; a nomenclatura visível permanece **Bots**.
- `src/features/workers/api.ts:9` já usa `orgId`, `requestId`, `conversationId` e JWT do usuário. O SSE atual (`:19`) transporta apenas bot, conversa, progresso, texto, citações, uso, término e erro. Os eventos estruturados deste documento serão adições explícitas, validadas, sem interpretar texto do modelo como comando da UI.
- `src/features/workers/useWorkersChat.ts:34` já isola estado por usuário/organização e aborta carregamentos. Todos os hooks novos precisam seguir a mesma regra, inclusive limpar imediatamente formulários pessoais em troca de sessão/organização.
- A migration `20261016120000_workers_readonly_workspace.sql:20` aceita apenas mensagens `user`/`assistant`; `:37` restringe os tipos de auditoria existentes. Eventos de sistema, cards, propostas e execuções precisam de estruturas novas, sem inserir `system` em `ai_messages` ou inventar valores em seus CHECKs.
- `ai_usage.cost_usd` aceita somente NULL e `telemetry_trust` somente `user_scoped` (`:56–57`). O painel não pode converter falta de custo/completude em zero nem apresentar telemetria como cobrança verificada.
- O registry atual declara `readOnly: true` e `requiresConfirmation: false` em `src/lib/workers/types.ts:44`. A proposta de escrita será um registry separado e fechado; não transformar o dispatcher de leitura em executor genérico.

Regras de fronteira: JSON público usa propriedades **camelCase**; banco e assinaturas RPC existentes mantêm seus nomes originais, convertidos somente no servidor. Literais de domínio existentes, como `arena_note` e `em_andamento`, são preservados. UUIDs, datas, URLs e limites têm validação runtime; um tipo TypeScript sozinho não autoriza nada. Schemas de request e resposta devem rejeitar chaves desconhecidas.

## 2. Tipos comuns e erros

```ts
type Uuid = string; // UUID validado em runtime.
type IsoInstant = string; // ISO 8601 com offset; o servidor devolve UTC.
type LocalDate = string; // YYYY-MM-DD validado, sem inferir fuso do navegador.
type LocalTime = string; // HH:mm em formato 24h.
type WorkerId = 'agenda' | 'arena' | 'mapa' | 'interesse'
  | 'comissao' | 'logistica' | 'caixa' | 'radar';

interface OwnerScope { orgId: Uuid }
// userId é derivado do JWT; nunca recebido como identidade de execução.
interface MutationIdentity extends OwnerScope { requestId: Uuid }
interface SafeTarget { recordId: Uuid; label: string; href: string }
interface SafeSource { title: string; url: string; date?: IsoInstant; kind: 'app' | 'web' }
interface PageView<T> { items: T[]; nextCursor: string | null; serverNow: IsoInstant }

type CommandErrorCode = 'authRequired' | 'forbidden' | 'notFound'
  | 'invalidInput' | 'staleVersion' | 'expired' | 'stateConflict'
  | 'manualInputRequired' | 'operationInProgress' | 'rateLimited'
  | 'unavailable' | 'outcomeUnknown';
interface CommandError {
  code: CommandErrorCode;
  message: string; // Texto seguro, sem SQL, payload, PII ou erro bruto do fornecedor.
  retryAfterSeconds: number | null;
  latestVersion: number | null;
}
type CommandResult<T> =
  | { ok: true; data: T; serverNow: IsoInstant }
  | { ok: false; error: CommandError; serverNow: IsoInstant };
```

`notFound` também pode representar objeto de outro proprietário/organização, sem confirmar sua existência. Uma falha de transporte não é um `failed` de negócio: a UI reconcilia pelo mesmo ID antes de oferecer nova tentativa. URLs passam pela proteção já existente `safeWorkerSourceUrl`; não aceitar deep links arbitrários ou HTML do modelo. Listagens usam cursores opacos e limites fixos no servidor.

## 3. ActionView: projeção pública e allowlist fechada

```ts
type ActionKind = 'arena_note' | 'arena_checklist'
  | 'commercial_reserve' | 'commercial_negotiate';
type ActionStatus = 'proposed' | 'confirmed' | 'executed'
  | 'cancelled' | 'expired' | 'failed';
type ChecklistStatus = 'pendente' | 'em_andamento' | 'concluido' | 'dispensado';

interface ActionAvailabilityView {
  kind: ActionKind;
  available: boolean;
  reason: string | null;
}

interface SafeDiffRow {
  field: string; // Chave de apresentação da allowlist, não caminho de JSON executável.
  label: string;
  beforeDisplay: string | null;
  afterDisplay: string | null;
  redacted: boolean;
}
interface ActionPermissions {
  canConfirm: boolean;
  canEdit: boolean;
  canCancel: boolean;
  reason: 'allowed' | 'missingCapability' | 'missingManualInput'
    | 'expired' | 'terminalState' | 'recordChanged' | 'unavailable';
}
interface ActionReceipt {
  receiptId: Uuid;
  executedAt: IsoInstant;
  target: SafeTarget;
  summary: string;
  replayed: boolean;
  undo: null; // Nenhuma inversa segura habilitada para estas quatro ações nesta etapa.
}
interface ActionViewBase {
  id: Uuid;
  orgId: Uuid;
  conversationId: Uuid;
  workerId: WorkerId;
  version: number;
  status: ActionStatus;
  summary: string;
  target: SafeTarget;
  diff: SafeDiffRow[];
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  expiresAt: IsoInstant;
  serverNow: IsoInstant;
  permissions: ActionPermissions;
  receipt: ActionReceipt | null;
  failure: { code: CommandErrorCode; message: string } | null;
}
type CommercialManualField = 'companyName' | 'contactName' | 'documentNumber'
  | 'phone' | 'email' | 'notes' | 'reservationExpiresAt' | 'proposedValueDecimal';
interface ManualInputRequirement {
  field: CommercialManualField;
  required: boolean;
}
type ActionView =
  | (ActionViewBase & {
      kind: 'arena_note'; workerId: 'arena';
      manualInputState: 'notRequired'; manualRequirements: [];
    })
  | (ActionViewBase & {
      kind: 'arena_checklist'; workerId: 'arena';
      manualInputState: 'notRequired'; manualRequirements: [];
    })
  | (ActionViewBase & {
      kind: 'commercial_reserve' | 'commercial_negotiate'; workerId: 'mapa';
      manualInputState: 'required' | 'complete';
      manualRequirements: ManualInputRequirement[]; // Descritores; nunca valores.
    });
```

O DTO público **não contém** `payload`, `rpc`, `rpcArgs`, chave idempotente interna, estado bruto do registro, documento, contato, telefone, e-mail, PIX, dados de comprador/hóspede ou conteúdo de campos manuais. A UI recebe apenas diff e resumo sanitizados. Para dados comerciais pessoais, o diff mostra “Dados preenchidos em formulário protegido”, sem copiar o valor. A autorização final é sempre revalidada no servidor; `permissions` apenas controla a apresentação.

**Atualização da auditoria:** os quatro kinds são a união proposta, não quatro ações já habilitadas. `arena_checklist` fica **indisponível nesta etapa** por efeitos indiretos de notificação; a lista `ActionAvailabilityView[]` devolvida pelo servidor permite explicar isso no catálogo sem oferecer proposta/Confirmar. A disponibilidade inicial de produção se limita a nota nova e ações comerciais cujos efeitos forem comprovadamente permitidos. Capability presente nunca reativa uma ação bloqueada pela auditoria.

`expiresAt` corresponde à versão vigente e é decidido pelo servidor. Proposta: cada edição válida incrementa `version`, gera novo diff/estado esperado e nova janela de 15 minutos, com versões anteriores preservadas em auditoria e invalidadas para confirmação. Cancelar/confirmar usam a versão vigente. Se essa política de renovação mudar, servidor e teste devem mudar juntos; o cliente nunca renova validade sozinho.

| Kind | RPC de negócio já existente | Capability real | Restrição desta etapa |
|---|---|---|---|
| `arena_note` | `venue_save_event_note` | `venue_events_manage` | Apenas nota nova; não enviar `p_note_id`. |
| `arena_checklist` | `venue_update_checklist_item` | `venue_operations_manage` | **Indisponível:** atualiza evento pai, acionando reconciliação de notificações; sem proposta/Confirmar. |
| `commercial_reserve` | `reserve_commercial_lot` | `map.manage_sales` | Lote `AVAILABLE`, nenhuma operação ativa; dados manuais privados. |
| `commercial_negotiate` | `start_commercial_negotiation` | `map.manage_sales` | Mesmo guard; valor proposto não altera preço oficial nem registra venda/receita. |

Evidência: assinaturas em `src/integrations/supabase/types.ts:11770`, `:11874`, `:12150`, `:12186`. A RPC de checklist na migration `20260727215257_97c52bcb-d741-4523-833f-77b236eddb7b.sql:1187–1189` transforma campos omitidos em NULL e `:1232–1236` os sobrescreve. Por isso não é seguro enviar somente `{status}`: o dispatcher precisa preservar explicitamente nota/responsável/prazo que não estiverem sendo alterados, com leitura e lock sob a mesma autorização. Mudança concorrente exige novo diff, sem limpar campos silenciosamente.

Além disso, o checklist atualiza `venue_events` (`:1243–1245`), e `trg_venue_event_notifications` é AFTER INSERT OR UPDATE sem filtro de colunas (`20261004063922_ba42bb80-24b1-4d9b-ab75-0c82cb7d3824.sql:421–423`). A função sempre chama `venue_notification_reconcile_event` (`:322`), podendo reconciliar Google/notificações de terceiros. Preservar campos/versão não resolve esse efeito: o kind continua bloqueado. Não desativar gatilho ou canal existente para permitir a ação.

As RPCs comerciais na migration `20260805012455_1844f1ca-ea09-4776-96f3-3d04eaf64ca6.sql:70` e `:100` cancelam operações anteriores implicitamente. O guard deve ser atômico com a execução, não uma consulta anterior feita pela UI. Até a auditoria confirmar ausência de efeitos proibidos, o servidor devolve `unavailable` e nenhum botão Confirmar é exibido.

## 4. Propor, editar, preencher manualmente e confirmar

```ts
type ActionProposalInput =
  | { kind: 'arena_note'; eventId: Uuid; body: string }
  | { kind: 'arena_checklist'; eventId: Uuid; itemId: Uuid;
      status: ChecklistStatus; note: string | null }
  | { kind: 'commercial_reserve'; lotId: Uuid }
  | { kind: 'commercial_negotiate'; lotId: Uuid };
interface ProposeActionRequest extends MutationIdentity {
  conversationId: Uuid;
  input: ActionProposalInput;
}
interface ActionVersionRequest extends MutationIdentity {
  actionId: Uuid;
  expectedVersion: number;
}
type EditActionRequest = ActionVersionRequest & { input: ActionProposalInput };
type ConfirmActionRequest = ActionVersionRequest; // Nenhum payload, PII ou confirmação textual.
type CancelActionRequest = ActionVersionRequest;
type GetActionRequest = OwnerScope & { actionId: Uuid };

// SOMENTE formulário HTTPS autenticado → endpoint privado; nunca tool/modelo/chat/SSE.
type CommercialManualInput =
  | { kind: 'commercial_reserve'; companyName: string; contactName: string;
      documentNumber: string | null; phone: string | null; email: string | null;
      notes: string | null; reservationExpiresAt: IsoInstant }
  | { kind: 'commercial_negotiate'; companyName: string; contactName: string | null;
      documentNumber: string | null; notes: string | null;
      proposedValueDecimal: string | null };
type SaveActionManualInputRequest = ActionVersionRequest & { manualInput: CommercialManualInput };
```

`body`/`note` também passam por validação e mascaramento; PII não deve chegar ao modelo nem ser espelhada no card. `notes` comerciais, mesmo opcionais, pertencem integralmente ao caminho manual privado. O modelo só propõe kind e lote, sem campos de pessoa. Campos realmente obrigatórios são devolvidos por `manualRequirements` após validar o contrato vigente da RPC: não inventar obrigatoriedade de documento/telefone quando a função aceita ausência.

`proposedValueDecimal` é decimal canônico em reais, sem separador de milhar, validado no servidor e convertido para o parâmetro numeric existente; string evita arredondamento na edição. Seu preenchimento permanece manual. A UI deve deixar clara a diferença entre **validade do card** e **prazo da reserva** (`reservationExpiresAt`). O prazo da reserva também usa America/Sao_Paulo na apresentação e é convertido no servidor para instante válido.

Fluxo comercial: card proposto sem dados → “Completar dados” → formulário explícito informa que o conteúdo vai somente ao sistema Fenasoja → salvar dados regenera versão/diff no servidor → revisar card mascarado → **Confirmar**. Salvar o formulário não executa a ação. Reabrir recebe descritores de campos já preenchidos, não valores privados; em uma edição comercial, o formulário manda uma substituição completa validada, sem recuperar PII do histórico.

O payload executável canônico é privado ao servidor e vinculado a proprietário/organização/card/versão. Não incluí-lo em SELECT público, SSE, logs, tracing, analytics, URL, armazenamento do navegador ou erros. O formulário é estado efêmero em memória e é limpo ao fechar, salvar, perder sessão ou trocar organização. Respostas do endpoint manual têm o mesmo `ActionView` público, sem ecoar request. O servidor não envia esse input ao provedor em nenhuma etapa.

Propor/editar/preencher retornam `CommandResult<ActionView>`. Confirmar retorna o card com receipt persistido; repetir ID/versão já executados devolve o mesmo efeito/receipt, marcado como replay. Uma chave idempotente aleatória persistida por card/versão é responsabilidade do servidor, sem novo valor a cada clique. `requestId` deduplica a requisição de interface, sem substituir a trava de execução.

O estado `confirmed` representa confirmação recebida no servidor, não sucesso; a UI exibe “Conferindo e executando…”. Timeout de rede exibe “Verificando resultado…” e consulta o mesmo card. Confirmar e Cancelar concorrentes têm um único vencedor transacional; o outro recebe estado atual. Não duplicar a proposta ou liberar confirmação por texto no chat.

## 5. Rotinas: proposta própria, execução com sessão e Desfazer

Rotina não é um quinto `ActionKind`: tem proposta própria para configurar leituras futuras. Nenhuma rotina confirma cards de negócio. A execução proposta neste estágio depende de sessão ativa; a UI deve dizer **“Executa enquanto você usa o app; ao entrar, recupera ocorrências pendentes dentro do limite”**. Não usar “sempre às 8h” enquanto não existir delegação offline aprovada e implementada.

```ts
interface RoutineSchedule {
  timeZone: 'America/Sao_Paulo';
  localTime: LocalTime;
  weekdays: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>; // ISO: segunda=1, domingo=7; sem repetição.
}
// IDs NOVOS de receitas propostas; não são tools/RPCs existentes.
type RoutineRecipe =
  | { recipeId: 'agendaBriefing'; commissionId: Uuid | null;
      dayOffset: 0 | 1; includeRestaurantConflicts: boolean }
  | { recipeId: 'openSalesAge'; projectId: Uuid; minimumAgeDays: number }
  | { recipeId: 'transportWeather'; maximumSnapshotAgeMinutes: number };
interface RoutineConfig {
  title: string;
  workerId: WorkerId;
  schedule: RoutineSchedule;
  recipe: RoutineRecipe;
  delivery: 'inApp';
  executionMode: 'activeSession';
}
interface RoutineProposalView extends OwnerScope {
  id: Uuid;
  conversationId: Uuid;
  version: number;
  status: 'proposed' | 'confirmed' | 'cancelled' | 'expired';
  config: RoutineConfig;
  scheduleLabel: string;
  nextScheduledAt: IsoInstant;
  expiresAt: IsoInstant;
  serverNow: IsoInstant;
  canConfirm: boolean;
  unavailableReason: string | null;
}
interface RoutineView extends OwnerScope {
  id: Uuid;
  version: number;
  config: RoutineConfig;
  state: 'active' | 'paused' | 'disabled';
  scheduleLabel: string;
  nextScheduledAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  lastRunAt: IsoInstant | null;
  waitingForSession: boolean;
  canEdit: boolean;
  canRunNow: boolean;
  canUndoCreation: boolean;
}
interface RoutineRunView {
  id: Uuid;
  routineId: Uuid;
  occurrenceKey: string;
  trigger: 'scheduledActiveSession' | 'scheduledCatchUp' | 'manual';
  scheduledAt: IsoInstant | null; // NULL para execução manual.
  startedAt: IsoInstant | null;
  finishedAt: IsoInstant | null;
  anchorDate: LocalDate; // Calculada no servidor em America/Sao_Paulo.
  status: 'queued' | 'running' | 'completed' | 'failed'
    | 'skipped' | 'authorizationRequired';
  summary: string | null;
  sources: SafeSource[];
  chips: Array<{ label: string; href: string }>;
  incomplete: boolean;
  error: CommandError | null;
}
interface ProposeRoutineRequest extends MutationIdentity {
  conversationId: Uuid;
  config: RoutineConfig;
}
interface RoutineProposalVersionRequest extends MutationIdentity {
  proposalId: Uuid; expectedVersion: number;
}
type EditRoutineProposalRequest = RoutineProposalVersionRequest & { config: RoutineConfig };
interface RoutineVersionRequest extends MutationIdentity { routineId: Uuid; expectedVersion: number }
type ChangeRoutineStateRequest = RoutineVersionRequest & { state: 'active' | 'paused' | 'disabled' };
type RunRoutineNowRequest = RoutineVersionRequest;
type UndoRoutineCreationRequest = RoutineVersionRequest;
```

As receitas devem compilar para tools readonly já verificadas: `list_events`/`commission_agenda` + `restaurant_alert`; `list_sale_orders` com datas comprovadas; `transport_weather` lendo snapshots. As novas receitas e seus parâmetros exigem teste e validação do dispatcher antes de serem anunciados como disponíveis. Não receber SQL, cron arbitrário, expressão livre, tool name ou argumentos JSON do modelo. `openSalesAge` usa criação persistida, nunca “última atividade” inferida; se o retorno autorizado não contiver essa data, a receita permanece indisponível até existir leitura agregada segura explicitamente auditada. Fonte insuficiente/antiga produz execução parcial ou indisponível com explicação, não alerta inventado.

A UI pode construir o texto natural, mas o servidor interpreta/valida a configuração e devolve a proposta estruturada. “Dias úteis” corresponde a `[1,2,3,4,5]`; sem promessa de feriados locais não cadastrados. Escopo deve ser de entidades persistidas e permitido no JWT. `workerId` precisa corresponder à receita e todas as suas permissões. Texto de anexos/web não pode configurar nem confirmar rotina.

Confirmar proposta retorna rotina e evento estruturado. `Desfazer` desativa apenas ocorrências futuras, preservando a rotina e execuções; não reverte resultados anteriores. Corridas com uma execução já iniciada são apresentadas honestamente: desativada não significa que uma leitura concluída deixou de existir. Em recuperação, o divisor mostra horário agendado e horário efetivo; “amanhã” usa `anchorDate` da ocorrência, não a data em que a pessoa abriu o app. Lease/deduplicação e limite de catch-up ficam no servidor. Não persistir JWT/refresh token no cliente ou banco de rotinas.

## 6. Memória editável, alertas próprios e timeline

```ts
interface MemoryEntryView extends OwnerScope {
  id: Uuid;
  version: number;
  workerId: WorkerId | null;
  category: 'preference' | 'workContext';
  content: string; // Texto sanitizado; sem documento, contato, PIX ou dados de terceiros.
  state: 'active' | 'inactive';
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}
interface CreateMemoryRequest extends MutationIdentity {
  workerId: WorkerId | null; category: 'preference' | 'workContext'; content: string;
}
interface UpdateMemoryRequest extends MutationIdentity {
  memoryId: Uuid; expectedVersion: number; content: string; state: 'active' | 'inactive';
}
interface WorkerAlertView extends OwnerScope {
  id: Uuid;
  workerId: WorkerId;
  kind: 'restaurantConflict' | 'openSaleAge' | 'transportWeather';
  title: string;
  summary: string;
  severity: 'info' | 'attention' | 'critical';
  sources: SafeSource[];
  target: SafeTarget | null;
  observedAt: IsoInstant;
  seenAt: IsoInstant | null;
  expiresAt: IsoInstant | null;
}
interface NeedsYouView {
  pendingActionCount: number;
  unreadAlertCount: number;
  actions: ActionView[];
  alerts: WorkerAlertView[];
  nextCursor: string | null;
  serverNow: IsoInstant;
}
type SystemEventView = {
  id: Uuid; conversationId: Uuid; createdAt: IsoInstant;
} & (
  | { kind: 'routineCreated'; routineId: Uuid; title: string; scheduleLabel: string;
      undo: { routineId: Uuid; expectedVersion: number } | null }
  | { kind: 'routineDisabled'; routineId: Uuid; title: string }
  | { kind: 'actionCancelled'; actionId: Uuid; title: string }
  | { kind: 'memorySaved'; memoryId: Uuid; title: string }
);
type TimelineEntry =
  | { type: 'message'; id: Uuid; createdAt: IsoInstant; message: WorkerChatMessage }
  | { type: 'action'; id: Uuid; createdAt: IsoInstant; action: ActionView }
  | { type: 'routineProposal'; id: Uuid; createdAt: IsoInstant; proposal: RoutineProposalView }
  | { type: 'routineRun'; id: Uuid; createdAt: IsoInstant; run: RoutineRunView }
  | { type: 'system'; id: Uuid; createdAt: IsoInstant; event: SystemEventView };
```

`WorkerChatMessage` é o tipo já existente. IDs de timeline são estáveis e ordenados no servidor por `(createdAt,id)`; atualização de card substitui a mesma entrada, sem duplicá-la em cada chunk. A proposta adiciona eventos SSE `action`, `routineProposal`, `routineRun` e `system`, cada um carregando seu DTO validado. Isso não altera a possibilidade de terminar um stream com `done`, e um DTO inválido não habilita controles.

Memória só é salva por ato explícito do usuário. Sugestão do bot abre revisão, sem gravação automática; qualquer conteúdo externo continua dado não confiável. Texto de memória não pode fornecer permissão, secret, instrução de ferramenta nem confirmação. Desativar usa versionamento, sem apagar histórico. Nada de “esquecer” que apenas oculta um item enquanto continua sendo enviado ao modelo: entradas inativas devem ser excluídas da composição de contexto.

Alertas e contagens são do próprio usuário/organização, jamais de terceiros. Paginação não limita indevidamente a contagem: o servidor devolve totais autorizados independentes da primeira página. `seenAt` usa comando autenticado idempotente; alertas sem dado/fonte válido não são criados. Esta etapa usa somente `inApp`, sem e-mail, WhatsApp ou alteração dos canais FCM/Google. Futura notificação ao próprio usuário exige contrato separado e os mecanismos existentes.

## 7. Uso administrativo, custos e limites desconhecidos

```ts
interface UnknownMetric {
  state: 'unknown';
  value: null;
  reason: 'notConfigured' | 'notAvailable' | 'noAttestedLedger' | 'incompleteTelemetry';
}
interface KnownCountMetric { state: 'known'; value: number; complete: boolean }
interface UsageCost {
  state: 'unknown'; amount: null; currency: null; reason: 'noAttestedLedger';
}
interface UsageRowView {
  userId: Uuid;
  userLabel: string; // Nome seguro autorizado, nunca e-mail/documento.
  workerId: WorkerId;
  requests: KnownCountMetric;
  inputTokens: KnownCountMetric | UnknownMetric;
  outputTokens: KnownCountMetric | UnknownMetric;
  cost: UsageCost;
  configuredRequestLimit: KnownCountMetric | UnknownMetric;
  configuredCostLimit: UnknownMetric;
  provenance: 'userScopedTelemetry';
}
interface UsageReportView extends OwnerScope {
  from: IsoInstant;
  to: IsoInstant;
  timeZone: 'America/Sao_Paulo';
  rows: UsageRowView[];
  nextCursor: string | null;
  generatedAt: IsoInstant;
  complete: boolean;
  warnings: Array<'partialTelemetry' | 'costUnavailable' | 'limitsNotConfigured'>;
}
interface GetUsageReportRequest extends OwnerScope {
  from: IsoInstant; to: IsoInstant; cursor: string | null;
}
```

O contrato desta etapa deliberadamente não aceita custo conhecido: ainda não existe ledger verificado. Mostrar “Não informado”, sem símbolo de moeda ou percentual de orçamento inventado. Um contador realmente completo com zero pode mostrar `0`; soma parcial precisa mostrar “Parcial”. Não calcular restante/percentual com limite desconhecido. Os limites operacionais de turno existentes não equivalem a um orçamento financeiro configurado, nem devem ser apresentados como plano pago.

`/admin/workers/uso` é rota **nova proposta** no plano. Tanto acesso quanto agregação devem exigir admin da organização no servidor; esconder menu por capability genérica não basta. Nenhuma leitura de conversas, memória ou payload privado de outro usuário e nenhuma ampliação da policy de SELECT de `ai_usage`. A futura origem agregadora aditiva precisa ser auditada para não promover telemetria controlável pelo cliente a faturamento verificado.

## 8. Superfície de UI e sequência para trabalho paralelo

Proposta de interface de serviço tipada (não são nomes de RPCs existentes): `proposeAction`, `getAction`, `editAction`, `saveActionManualInput`, `confirmAction`, `cancelAction`; `proposeRoutine`, `editRoutineProposal`, `confirmRoutineProposal`, `cancelRoutineProposal`, `listRoutines`, `setRoutineState`, `runRoutineNow`, `undoRoutineCreation`, `listRoutineRuns`; `listMemory`, `createMemory`, `updateMemory`; `getNeedsYou`, `markAlertSeen`; `getUsageReport`. Cada operação recebe escopo explícito e retorna DTO público através de `CommandResult`/`PageView`. Não expor um método `executeRpc(name,args)`.

```ts
interface ListRequest extends OwnerScope { cursor: string | null }
interface ListRoutineRunsRequest extends ListRequest { routineId: Uuid }
interface MarkAlertSeenRequest extends MutationIdentity { alertId: Uuid }
interface RoutineConfirmationView { routine: RoutineView; event: SystemEventView }
interface RoutineUndoView { routine: RoutineView; event: SystemEventView }
type Response<T> = Promise<CommandResult<T>>;
interface WorkersWorkspaceService {
  getActionAvailability(input: OwnerScope): Response<ActionAvailabilityView[]>;
  proposeAction(input: ProposeActionRequest): Response<ActionView>;
  getAction(input: GetActionRequest): Response<ActionView>;
  editAction(input: EditActionRequest): Response<ActionView>;
  saveActionManualInput(input: SaveActionManualInputRequest): Response<ActionView>;
  confirmAction(input: ConfirmActionRequest): Response<ActionView>;
  cancelAction(input: CancelActionRequest): Response<ActionView>;
  proposeRoutine(input: ProposeRoutineRequest): Response<RoutineProposalView>;
  editRoutineProposal(input: EditRoutineProposalRequest): Response<RoutineProposalView>;
  confirmRoutineProposal(input: RoutineProposalVersionRequest): Response<RoutineConfirmationView>;
  cancelRoutineProposal(input: RoutineProposalVersionRequest): Response<RoutineProposalView>;
  listRoutines(input: ListRequest): Response<PageView<RoutineView>>;
  setRoutineState(input: ChangeRoutineStateRequest): Response<RoutineView>;
  runRoutineNow(input: RunRoutineNowRequest): Response<RoutineRunView>;
  undoRoutineCreation(input: UndoRoutineCreationRequest): Response<RoutineUndoView>;
  listRoutineRuns(input: ListRoutineRunsRequest): Response<PageView<RoutineRunView>>;
  listMemory(input: ListRequest): Response<PageView<MemoryEntryView>>;
  createMemory(input: CreateMemoryRequest): Response<MemoryEntryView>;
  updateMemory(input: UpdateMemoryRequest): Response<MemoryEntryView>;
  getNeedsYou(input: ListRequest): Response<NeedsYouView>;
  markAlertSeen(input: MarkAlertSeenRequest): Response<WorkerAlertView>;
  getUsageReport(input: GetUsageReportRequest): Response<UsageReportView>;
}
```

Os métodos recebem `AbortSignal` por opção de transporte separada, nunca no JSON. `requestId` em `runRoutineNow` identifica uma única ocorrência manual; repetir essa requisição reconcilia a mesma execução. UUID/organização do cliente não substituem proprietário derivado do JWT. Em métodos paginados, o limite é controlado pelo servidor.

O transporte previsto para ações é a Edge **nova** `workers-actions` já proposta no plano; nomes/roteamento de transporte de rotinas/memória/uso ainda serão congelados com o backend antes de criar chamadas. Não assumir endpoints ou RPCs novos como disponíveis. Sessão/JWT/organização são validados em toda requisição e caches usam usuário+organização+ID+versão. A UI habilita a funcionalidade apenas quando o backend confirma sua disponibilidade, sem fallback de gravação direta.

| Ordem | Responsabilidade backend/integração | Responsabilidade UI após ativação |
|---|---|---|
| 1 | Verificar F0+1, schemas DTO, erros e transporte; congelar exports compartilhados. | Preparar estados puros com os DTOs congelados; preservar tela existente até conexão real. |
| 2 | Ações: proposta/diff, metadados privados, locks, versão, receipt e guard comercial. | ActionCard, ActionDiff, ActionEditorSheet, ActionExpiry e formulário comercial efêmero. |
| 3 | Proposta/confirmar rotina, execução com JWT ativo, deduplicação/leases, histórico e Desfazer. | Aba Rotinas ativa, proposta no chat, SystemEvent e RunDivider, próxima execução e recuperação explícitas. |
| 4 | Memória versionada, alertas próprios e agregação administrativa restrita. | MemorySheet, Precisa de você e painel administrativo com custos/limites desconhecidos. |
| 5 | Testes SQL por papel, concorrência real, integração e regressões. | Estados, teclado, mobile/desktop, axe, screenshots e perf, usando fixtures identificadas. |

Arquivos de UI propostos, todos novos dentro de `src/features/workers/`: `actions/{ActionCard,ActionDiff,ActionEditorSheet,ActionExpiry,useWorkerActions}`, `routines/{RoutinesPanel,RoutineCard,RoutineDetailsSheet,RoutineRun,useWorkerRoutines}`, `memory/{MemorySheet,MemoryEntryCard,useWorkerMemory}`, `inbox/{NeedsYouPanel,WorkerAlertCard,useWorkerInbox}`, `usage/WorkersUsagePage` e componentes `SystemEvent`/`RunDivider`. Extensões do shell/composer ficam no domínio UI; `api.ts`, `useWorkersChat.ts`, `database.ts`, contracts compartilhados, App/launcher e backend têm integração coordenada pelo root para evitar conflitos de arquivo.

## 9. Estados e testes necessários para congelar o contrato

- Card: proposta, formulário obrigatório, permissão ausente/carregando, edição, diff regenerando, confirmação pendente, expiração, versão desatualizada, execução, cancelamento, falha e resultado incerto de rede. Confirmar some sem autorização; servidor continua recusando requests fabricados. “Desfazer” de negócio permanece ausente quando `receipt.undo` é NULL.
- Countdown usa relógio compartilhado com offset de `serverNow` e avanço monotônico; só o pequeno componente muda por segundo. Reconciliar ao voltar à aba; o relógio local nunca autoriza execução. `aria-live` anuncia marcos/expiração, não cada segundo. Toast nunca anuncia sucesso sem receipt.
- Testes de contrato: quatro kinds propostos somente, com checklist bloqueado no servidor independentemente de capability; rejeitar payload/RPC/PII em `ActionView`; requests de confirmação rejeitam input extra; DTOs camelCase; respostas redigidas e URLs seguras; SSE desconhecido/inválido não cria botão; schemas permitem custo/limite desconhecido e distinguem zero.
- Ações: Confirmar duas vezes/duas abas, corrida Confirmar×Cancelar, edição×Confirmar e expiração após lock; mesmo receipt; rollback sem efeito parcial; lote que deixa de ser AVAILABLE; recusa de checklist sem acionar RPC/Google/push. Preservação de prazo/responsável é requisito de eventual habilitação futura, não aceite de disponibilidade atual. Testes UI não substituem concorrência em Postgres real.
- Privacidade: nenhum campo manual em requests ao modelo, conteúdo do chat, SSE, logs, erros, analytics ou storage; limpar drafts ao fechar/trocar usuário/org; nenhuma PII da ação em histórico/DeepLink; requests fabricados de outro proprietário falham.
- Rotina: texto→proposta→confirmação→evento→Desfazer, executar manualmente, dias úteis às 08h no fuso, recuperação com scheduledAt distinto de execução, anchorDate estável, duplicação/lease, sessão expirada, capability revogada, fonte antiga, leitura parcial e nenhuma confirmação automática de negócio.
- Memória: edição/desativação versionada, conflito entre abas, somente proprietário/org, conteúdo inativo fora do contexto; injeção não altera ferramentas/permissões. Alertas: dedup, visto, vazio, erro, expiração e contagem autorizada.
- Admin: admin de uma organização versus admin de outra, gestor/operador/leitura/comissão; custo e limites NULL aparecem como desconhecidos, dado parcial explicitado, sem campos de conversa/memória/PII de terceiros.
- QA visual: 390×844, 1280×800, claro/escuro, overflow 360px, card pendente/expirado/sem permissão/conflito, formulário comercial, rotinas/histórico, memória, uso desconhecido e Precisa de você; teclado completo, foco restaurado no sheet, axe AA e alvos 44px. Preservar marca/ícone Bots, Motion lazy, CSS `.workers-scope`/`--worker-*`, até 12 mascotes, listeners compartilhados e pausa fora da tela/aba oculta. Repetir 60fps/CLS com evidência identificada; fixtures locais não provam fornecedor real nem dispositivo móvel físico.

**Próximo passo:** root confirma ativação e revisa os contratos com o backend. Só então promover estes tipos propostos a código compartilhado e conectar os componentes. Nenhuma Fase 2 ou 3 foi implementada por este documento.

Validação documental: os sete blocos TypeScript foram reunidos em módulo virtual e verificados com TypeScript strict/noEmit, sem diagnósticos; `WorkerChatMessage` foi representado por uma interface mínima compatível para resolver a referência ao tipo existente. Nenhum arquivo TypeScript foi gerado. `git diff --check` sem erros. Não houve lint/testes/build de aplicação, pois esta entrega altera somente a proposta em Markdown.
