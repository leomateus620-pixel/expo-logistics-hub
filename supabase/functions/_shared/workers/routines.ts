import { isObject, isUuid, redactWorkerText, WorkerError, type ReadResult, type ReadTool, type WorkerId } from './contracts.ts';
import { renderToolEvidence } from './engine.ts';
import { routineConfigSchema, type RoutineConfig, type RoutineLiveResult, type RoutineRunView, type WorkspaceCommand } from './workspace-contracts.ts';

export interface RoutineDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  listTools(worker: WorkerId): Promise<ReadTool[]>;
  executeTool(name: string, input: unknown): Promise<ReadResult>;
  signal?: AbortSignal;
  now?: () => Date;
}
interface Claim { run: RoutineRunView; generation: number; config: RoutineConfig }

function assertActive(deps: RoutineDependencies) {
  if (deps.signal?.aborted) throw new WorkerError('request_cancelled', 499);
}
function config(value: unknown): RoutineConfig {
  const parsed = routineConfigSchema.safeParse(value);
  if (!parsed.success) throw new WorkerError('invalid_request');
  const item = parsed.data;
  if ((item.recipe.recipeId === 'agendaBriefing' && (!['agenda', 'arena'].includes(item.workerId) || (item.workerId === 'arena' && !item.recipe.includeRestaurantConflicts)))
    || (item.recipe.recipeId === 'openSalesAge' && item.workerId !== 'mapa')
    || (item.recipe.recipeId === 'transportWeather' && item.workerId !== 'logistica')) throw new WorkerError('invalid_request');
  return { ...item, title: redactWorkerText(item.title).slice(0, 100), schedule: { ...item.schedule, weekdays: [...item.schedule.weekdays].sort((a, b) => a - b) } };
}
function dateOffset(date: string, offset: number): string {
  const instant = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) throw new WorkerError('invalid_request');
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}
function localDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
function failureCode(error: unknown): 'permissions_changed' | 'cancelled' | 'rate_limited' | 'data_unavailable' {
  const code = isObject(error) ? String(error.code) : '';
  if (['forbidden', 'AUTH_REQUIRED', 'PERMISSION_DENIED', 'NOT_FOUND'].includes(code)) return 'permissions_changed';
  if (code === 'request_cancelled') return 'cancelled';
  if (code === 'rate_limited') return 'rate_limited';
  return 'data_unavailable';
}

export async function validateRoutineTools(value: RoutineConfig, deps: RoutineDependencies) {
  const item = config(value);
  const required: Array<[WorkerId, string]> = item.recipe.recipeId === 'agendaBriefing'
    ? [['agenda', item.recipe.commissionId ? 'commission_agenda' : 'list_events'], ...(item.recipe.includeRestaurantConflicts ? [['arena', 'restaurant_alert'] as [WorkerId, string]] : [])]
    : item.recipe.recipeId === 'openSalesAge' ? [['mapa', 'list_sale_orders']] : [['logistica', 'transport_weather']];
  for (const [worker, name] of required) {
    assertActive(deps);
    const tools = await deps.listTools(worker);
    if (!tools.some(tool => tool.name === name && tool.readOnly === true)) throw new WorkerError('forbidden', 403);
  }
  return item;
}

/** Deterministic read recipes. The model never runs, chooses tools, or confirms actions here. */
export async function runRoutineRecipe(value: RoutineConfig, referenceDate: string, deps: RoutineDependencies): Promise<{
  evidence: ReadResult[]; tools: string[]; alertKind: 'restaurantConflict' | 'openSalesAge' | 'transportWeather' | null;
  chips: Array<{ label: string; href: string }>;
}> {
  const item = await validateRoutineTools(value, deps);
  dateOffset(referenceDate, 0);
  const tools: string[] = [];
  const execute = async (name: string, input: Record<string, unknown>) => {
    assertActive(deps);
    const result = await deps.executeTool(name, input);
    assertActive(deps);
    renderToolEvidence([result]); // Enforce evidence/citations before any live or stored output.
    tools.push(name);
    return result;
  };
  if (item.recipe.recipeId === 'agendaBriefing') {
    const targetDate = dateOffset(referenceDate, item.recipe.dayOffset);
    let events: ReadResult;
    if (item.recipe.commissionId) {
      const source = await execute('commission_agenda', { commission_id: item.recipe.commissionId, limit: 100 });
      const records = source.records.filter(row => isObject(row) && row.start_date === targetDate);
      events = { ...source, records, total: records.length, summary: `${records.length} evento(s) com início em ${targetDate} na parcela consultada da comissão.${source.truncated ? ' A lista da comissão é parcial; este número não é um total global.' : ''}` };
    } else {
      events = await execute('list_events', { from_date: targetDate, to_date: targetDate, limit: 100 });
      events = { ...events, summary: `Eventos com início em ${targetDate}. ${events.summary}` };
    }
    const evidence = [events];
    const chips = [{ label: `${events.records.length} eventos${events.truncated ? ' na amostra' : ''}`, href: '/cronograma-eventos' }];
    let alertKind: 'restaurantConflict' | null = null;
    if (item.recipe.includeRestaurantConflicts) {
      const source = await execute('restaurant_alert', { from_date: targetDate, to_date: targetDate });
      evidence.push({ ...source, summary: `Alerta geral do Restaurante em ${targetDate}.${item.recipe.commissionId ? ' Esta fonte não relaciona conflitos à comissão por ID; não é uma interseção confirmada com os eventos acima.' : ''} ${source.summary}` });
      chips.push({ label: `${source.records.length} alertas${source.truncated ? ' na amostra' : ''}`, href: '/cronograma-eventos' });
      if (source.records.length) alertKind = 'restaurantConflict';
    }
    return { evidence, tools, alertKind, chips };
  }
  if (item.recipe.recipeId === 'openSalesAge') {
    // PENDING means pending_count>0 in the existing RPC, and already includes partial orders.
    const source = await execute('list_sale_orders', { project_id: item.recipe.projectId, status: 'PENDING', limit: 100 });
    const minimumAgeDays = item.recipe.minimumAgeDays;
    const records = source.records.filter(isObject).flatMap(row => {
      if (row.kind !== 'ORDER' || Number(row.pending_count) <= 0 || typeof row.created_at !== 'string') return [];
      const created = new Date(row.created_at);
      if (!Number.isFinite(created.getTime())) return [];
      const ageDays = Math.floor((Date.parse(`${referenceDate}T12:00:00Z`) - Date.parse(`${localDate(created)}T12:00:00Z`)) / 86400000);
      return ageDays >= minimumAgeDays ? [{ ...row, age_days_since_creation: ageDays }] : [];
    });
    return { evidence: [{ ...source, records, total: records.length, summary: `${records.length} pedido(s) com assinatura pendente há pelo menos ${minimumAgeDays} dias desde a criação${source.truncated ? ' na amostra parcial' : ''}. Isso não indica ausência de atividade nem receita realizada.` }],
      tools, alertKind: records.length ? 'openSalesAge' : null, chips: [{ label: `${records.length} pedidos${source.truncated ? ' na amostra' : ''}`, href: '/mapa-comercial' }] };
  }
  const source = await execute('transport_weather', { limit: 100 });
  const now = (deps.now?.() ?? new Date()).getTime();
  const records = source.records.filter(isObject).filter(row => row.operational_risk_level === 'critico' && typeof row.valid_until === 'string'
    && typeof row.fetched_at === 'string' && Number.isFinite(Date.parse(row.valid_until)) && Date.parse(row.valid_until) > now
    && Number.isFinite(Date.parse(row.fetched_at)) && Date.parse(row.fetched_at) <= now);
  return { evidence: [{ ...source, records, total: records.length, summary: `${records.length} snapshot(s) de clima com risco crítico e validade vigente${source.truncated ? ' na amostra parcial' : ''}. Dados vencidos ou inválidos foram excluídos; o cache não foi atualizado.` }],
    tools, alertKind: records.length ? 'transportWeather' : null, chips: [{ label: `${records.length} alertas válidos${source.truncated ? ' na amostra' : ''}`, href: '/transports' }] };
}

function parseClaim(value: unknown): Claim {
  if (!isObject(value) || !isObject(value.run) || !isUuid(value.run.id) || !isUuid(value.run.requestId) || !isUuid(value.run.conversationId)
    || typeof value.run.referenceDate !== 'string' || value.run.state !== 'running' || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) throw new WorkerError('storage_unavailable', 503);
  dateOffset(value.run.referenceDate, 0);
  return { run: value.run as unknown as RoutineRunView, generation: Number(value.generation), config: config(value.config) };
}

export async function executeDueRoutines(orgId: string, requestId: string, deps: RoutineDependencies) {
  assertActive(deps);
  const admitted = await deps.rpc('ai_workspace_claim_due', { _org_id: orgId, _request_id: requestId });
  if (!isObject(admitted) || !Array.isArray(admitted.claims) || admitted.claims.length > 2 || typeof admitted.serverNow !== 'string') throw new WorkerError('storage_unavailable', 503);
  const results: RoutineLiveResult[] = [];
  for (const candidate of admitted.claims) {
    const claim = parseClaim(candidate);
    const guard = async () => {
      assertActive(deps);
      await deps.rpc('ai_workspace_validate_run', { _org_id: orgId, _run_id: claim.run.id, _generation: claim.generation });
      assertActive(deps);
    };
    try {
      await guard();
      const computed = await runRoutineRecipe(claim.config, claim.run.referenceDate, { ...deps,
        executeTool: async (name, input) => { await guard(); return deps.executeTool(name, input); } });
      const evidence = renderToolEvidence(computed.evidence);
      await guard();
      const run = await deps.rpc('ai_workspace_complete_run', { _org_id: orgId, _run_id: claim.run.id, _generation: claim.generation,
        _content: evidence.content, _citations: evidence.citations, _tool_names: computed.tools, _alert_kind: computed.alertKind });
      results.push({ run: run as RoutineRunView, ...evidence, chips: computed.chips });
    } catch (error) {
      const run = await deps.rpc('ai_workspace_finish_run', { _org_id: orgId, _run_id: claim.run.id, _generation: claim.generation,
        _success: false, _failure_code: failureCode(error), _alert_kind: null });
      results.push({ run: run as RoutineRunView, content: 'Não foi possível concluir esta ocorrência com sua sessão e permissões atuais. O registro de tentativa foi preservado.', citations: [], chips: [] });
    }
  }
  return { results, serverNow: admitted.serverNow };
}

export async function handleWorkspaceCommand(command: WorkspaceCommand, deps: RoutineDependencies): Promise<unknown> {
  assertActive(deps);
  const org = { _org_id: command.orgId };
  switch (command.command) {
    case 'snapshot': return deps.rpc('ai_workspace_snapshot', { ...org, _conversation_id: command.conversationId ?? null });
    case 'proposeRoutine': {
      const item = await validateRoutineTools(command.config, deps);
      return deps.rpc('ai_workspace_propose_routine', { ...org, _conversation_id: command.conversationId, _request_id: command.requestId, _config: item });
    }
    case 'confirmRoutine': return deps.rpc('ai_workspace_confirm_routine', { ...org, _routine_id: command.routineId, _expected_version: command.expectedVersion });
    case 'setRoutineState': return deps.rpc('ai_workspace_set_routine_state', { ...org, _routine_id: command.routineId, _expected_version: command.expectedVersion, _state: command.state });
    case 'undoRoutine': return deps.rpc('ai_workspace_undo_routine', { ...org, _routine_id: command.routineId, _expected_version: command.expectedVersion });
    case 'executeDue': return executeDueRoutines(command.orgId, command.requestId, deps);
    case 'saveMemory': return deps.rpc('ai_workspace_save_memory', { ...org, _request_id: command.requestId, _memory_id: command.memoryId ?? null, _expected_version: command.expectedVersion ?? null,
      _worker_id: command.workerId, _content: redactWorkerText(command.content), _enabled: command.enabled });
    case 'markAlertSeen': return deps.rpc('ai_workspace_mark_alert_seen', { ...org, _alert_id: command.alertId });
    case 'usage': return deps.rpc('ai_workspace_usage', { ...org, _from: command.from, _to: command.to });
  }
}
