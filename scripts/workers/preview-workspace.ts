/** Synthetic localhost-only fixture. It proves UI behavior, never production RLS or provider output. */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ActionCommand, ActionView, MemoryView, RoutineView, WorkspaceCommand, WorkspaceSnapshot } from '../../src/features/workers/workspace-contracts';

const orgId = '10000000-0000-4000-8000-000000000001';
const conversationId = '40000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000001';
const lotId = '30000000-0000-4000-8000-000000000001';
const recipeProjectId = '50000000-0000-4000-8000-000000000001';
type HistoryRow = Record<string, unknown>;
interface Fixture { userId: string; readOnly: boolean; actions: ActionView[]; snapshot: WorkspaceSnapshot; messages: HistoryRow[]; conversations: HistoryRow[]; timeoutOnce: boolean }
const sessions = new Map<string, Fixture>();
const cookie = (request: IncomingMessage) => /(?:^|;\s*)workersQaWorkspace=([a-f0-9-]+)/.exec(request.headers.cookie ?? '')?.[1];
const instant = (offset = 0) => new Date(Date.now() + offset).toISOString();
const ago = (minutes: number) => instant(-minutes * 60000);

function seed(readOnly: boolean, timeoutOnce: boolean): Fixture {
  const userId = `00000000-0000-4000-8000-${readOnly ? '000000000004' : '000000000001'}`;
  const makeAction = (kind: ActionView['kind'], offset: number): ActionView => ({
    id: randomUUID(), orgId, conversationId, workerId: kind === 'arena_note' ? 'arena' : 'mapa', kind, version: 1, status: 'proposed',
    summary: kind === 'arena_note' ? 'Adicionar nota no encontro de comissões' : kind === 'commercial_reserve' ? 'Reservar o espaço 42 · Pavilhão 13' : 'Iniciar negociação · Espaço 43',
    target: kind === 'arena_note' ? { recordId: eventId, label: 'Encontro de comissões · Arena', href: `/eventos-restaurante-arena/restaurante/agenda?evento=${eventId}&aba=historico` } : { recordId: lotId, label: 'Pavilhão 13 · Espaço comercial', href: `/mapa-comercial?lote=${lotId}` },
    diff: kind === 'arena_note' ? [{ field: 'body', label: 'Nova nota', beforeDisplay: null, afterDisplay: 'Confirmar som às 18h com a equipe responsável.', redacted: false }] : [{ field: 'status', label: 'Situação do espaço', beforeDisplay: 'Disponível', afterDisplay: kind === 'commercial_reserve' ? 'Reservado' : 'Em negociação', redacted: false }, { field: 'manualData', label: 'Dados comerciais', beforeDisplay: null, afterDisplay: 'Preencha no formulário protegido', redacted: true }],
    createdAt: ago(offset), updatedAt: ago(offset), expiresAt: instant(900000), serverNow: instant(),
    permissions: { canConfirm: !readOnly && kind === 'arena_note', canEdit: !readOnly, canCancel: !readOnly, reason: readOnly ? 'missingCapability' : kind === 'arena_note' ? 'allowed' : 'manualInputRequired' },
    manualInputState: kind === 'arena_note' ? 'notRequired' : 'required', receipt: null, failure: null,
  });
  const makeRoutine = (title: string, state: RoutineView['state'], workerId: 'agenda' | 'mapa' | 'logistica'): RoutineView => ({
    id: randomUUID(), orgId, conversationId, version: 1, config: { title, workerId, schedule: { timeZone: 'America/Sao_Paulo', localTime: '08:00', weekdays: [1,2,3,4,5] },
      recipe: workerId === 'agenda' ? { recipeId: 'agendaBriefing', commissionId: null, dayOffset: 1, includeRestaurantConflicts: true } : workerId === 'mapa' ? { recipeId: 'openSalesAge', projectId: recipeProjectId, minimumAgeDays: 7 } : { recipeId: 'transportWeather' }, delivery: 'inApp', executionMode: 'activeSession' },
    state, scheduleLabel: 'Dias úteis às 08:00', nextScheduledAt: instant(86400000), createdAt: ago(9), updatedAt: ago(9), expiresAt: state === 'proposed' ? instant(900000) : null, serverNow: instant(), lastRunAt: state === 'active' ? ago(7) : null, waitingForSession: true, canConfirm: !readOnly && state === 'proposed', canEdit: !readOnly, canRunNow: false, unavailableReason: null,
  });
  const routines = [makeRoutine('Briefing de amanhã', 'active', 'agenda'), makeRoutine('Vendas em acompanhamento', 'proposed', 'mapa'), makeRoutine('Clima dos transportes', 'paused', 'logistica')];
  const introRequestId = randomUUID(); const requestId = randomUUID(); const runId = randomUUID();
  const sources = [{ label: '14 eventos · Agenda de teste', url: '/cronograma-eventos', source: 'app' }, { label: '2 conflitos · Restaurante de teste', url: '/eventos-restaurante-arena', source: 'app' }];
  const snapshot: WorkspaceSnapshot = { serverNow: instant(), routines,
    runs: [{ id: runId, routineId: routines[0].id, conversationId, requestId, routineVersion: 1, scheduledFor: ago(10), referenceDate: '2026-10-17', startedAt: ago(8), finishedAt: ago(7), state: 'succeeded', catchUp: true, failureCode: null, resultTrust: 'user_scoped_reported' }],
    events: [{ id: randomUUID(), conversationId, createdAt: ago(9), kind: 'routineCreated', entityId: routines[0].id, version: 1, label: 'Rotina criada: Briefing de amanhã, dias úteis às 8h', canUndo: true }],
    memories: [{ id: randomUUID(), orgId, version: 1, workerId: null, content: 'Prefiro resumos curtos, com links para conferir os registros.', enabled: true, createdAt: ago(12), updatedAt: ago(12) }, { id: randomUUID(), orgId, version: 1, workerId: 'mapa', content: 'Organizar a leitura comercial por pavilhão.', enabled: false, createdAt: ago(12), updatedAt: ago(12) }],
    alerts: [{ id: randomUUID(), workerId: 'arena', kind: 'restaurantConflict', title: 'Confira 2 conflitos entre a Agenda e o Restaurante.', href: '/cronograma-eventos', routineId: routines[0].id, runId, createdAt: ago(7), expiresAt: instant(86400000), seenAt: null }],
  };
  const messages: HistoryRow[] = [
    { id: randomUUID(), request_id: introRequestId, role: 'user', content: 'Me ajude a preparar a operação e os briefings da feira.', worker_id: 'arena', created_at: ago(14) },
    { id: randomUUID(), request_id: introRequestId, role: 'assistant', content: 'Separei as propostas para você revisar. Nenhuma alteração foi executada. Os campos comerciais são preenchidos somente no formulário protegido.', worker_id: 'arena', created_at: ago(13), citations: [{ label: 'Eventos da Arena', url: '/eventos-restaurante-arena', source: 'app' }] },
    { id: randomUUID(), request_id: requestId, role: 'user', content: 'Execução de rotina — contexto de sistema', worker_id: 'agenda', created_at: ago(8) },
    { id: randomUUID(), request_id: requestId, role: 'assistant', content: 'Na agenda sintética, encontrei 14 eventos para amanhã e 2 conflitos com o Restaurante. Confira os registros para preparar os próximos passos.', worker_id: 'agenda', created_at: ago(7), citations: sources },
  ].map((row, index) => ({ message_seq: index + 1, org_id: orgId, user_id: userId, conversation_id: conversationId, citations: [], state: 'complete', ...row }));
  const actions = [makeAction('arena_note', 6), makeAction('commercial_reserve', 5), makeAction('commercial_negotiate', 4)];
  actions.push({ ...makeAction('arena_note', 3), id: randomUUID(), summary: 'Proposta anterior de nota', status: 'expired', expiresAt: ago(2), permissions: { canConfirm: false, canEdit: false, canCancel: false, reason: 'expired' } });
  return { userId, readOnly, timeoutOnce, actions, snapshot, messages, conversations: [{ id: conversationId, title: 'Operação da feira · revisão local', user_id: userId, org_id: orgId, worker_id: 'arena', updated_at: ago(1) }] };
}
function json(response: ServerResponse, value: unknown, status = 200) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function body(request: IncomingMessage): Promise<unknown> { let value = ''; for await (const chunk of request) { value += String(chunk); if (value.length > 32000) throw new Error('Fixture bound'); } return JSON.parse(value); }
function fail(response: ServerResponse, code: string, message: string, status = 409) { json(response, { error: { code, message } }, status); }
function touch(action: ActionView) { action.serverNow = instant(); if (action.status === 'proposed' && Date.parse(action.expiresAt) <= Date.now()) { action.status = 'expired'; action.permissions = { canConfirm: false, canEdit: false, canCancel: false, reason: 'expired' }; } return action; }

export async function handleWorkspacePreview(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (url.searchParams.get('scenario') === 'workspace' && (url.pathname.startsWith('/equipe-ia') || url.pathname.startsWith('/admin/workers/'))) {
    const sessionId = randomUUID(); sessions.set(sessionId, seed(url.searchParams.get('profile') === 'leitura', url.searchParams.get('failure') === 'confirmTimeout'));
    response.setHeader('Set-Cookie', `workersQaWorkspace=${sessionId}; Path=/; SameSite=Lax; HttpOnly`);
    return false;
  }
  const session = sessions.get(cookie(request) ?? '');
  if (!session) {
    // Preserve the original empty-chat/catalogue harness without synthesizing business facts.
    if (request.method !== 'POST' || !['/functions/v1/workers-actions', '/functions/v1/workers-routines'].includes(url.pathname)) return false;
    try {
      const command = await body(request) as ActionCommand | WorkspaceCommand;
      if (command.command === 'list') json(response, []);
      else if (command.command === 'snapshot') json(response, { serverNow: instant(), routines: [], runs: [], events: [], memories: [], alerts: [] });
      else if (command.command === 'executeDue') json(response, { serverNow: instant(), results: [] });
      else if (command.command === 'usage') json(response, { from: command.from, to: command.to, serverNow: instant(), rows: [] });
      else fail(response, 'unavailable', 'Abra o cenário de revisão para verificar esta operação.', 404);
    } catch { fail(response, 'invalid_request', 'Não foi possível ler a requisição local.', 400); }
    return true;
  }
  if (url.pathname.startsWith('/__workers-qa/history/')) {
    const rows = url.pathname.endsWith('/ai_messages') ? session.messages : session.conversations;
    json(response, { data: rows.filter(row => ['user_id','org_id','conversation_id','state'].every(key => !url.searchParams.has(key) || row[key] === url.searchParams.get(key))).slice().reverse(), error: null }); return true;
  }
  if (!['/functions/v1/workers-actions', '/functions/v1/workers-routines'].includes(url.pathname)) return false;
  if (request.method !== 'POST') { fail(response, 'METHOD_NOT_ALLOWED', 'Use o fluxo da prévia local.', 405); return true; }
  try {
    const input = await body(request) as ActionCommand | WorkspaceCommand;
    if (input.orgId !== orgId) { fail(response, 'PERMISSION_DENIED', 'Organização não disponível na prévia.', 403); return true; }
    if (url.pathname.endsWith('/workers-actions')) {
      const command = input as ActionCommand;
      if (command.command === 'list') { json(response, session.actions.filter(action => !command.conversationId || action.conversationId === command.conversationId).map(touch)); return true; }
      const action = 'actionId' in command ? session.actions.find(item => item.id === command.actionId) : undefined;
      if (!action) { fail(response, 'NOT_FOUND', 'Proposta não encontrada.', 404); return true; }
      touch(action);
      if (command.command === 'get') { json(response, action); return true; }
      if (session.readOnly) { fail(response, 'PERMISSION_DENIED', 'Sua conta não pode confirmar esta alteração.', 403); return true; }
      if (action.status === 'executed' && command.command === 'confirm') { json(response, { ...action, receipt: { ...action.receipt, replayed: true } }); return true; }
      if ('expectedVersion' in command && command.expectedVersion !== action.version) { fail(response, 'VERSION_CONFLICT', 'A proposta mudou. Confira a versão atual.'); return true; }
      if (action.status !== 'proposed') { fail(response, 'ACTION_EXPIRED', 'Esta proposta não está mais disponível.'); return true; }
      if (command.command === 'edit' && command.input.kind === 'arena_note') { action.diff[0].afterDisplay = command.input.body; action.version += 1; action.updatedAt = instant(); }
      if (command.command === 'manual') {
        // Intentionally do not persist, print or echo any private form value, even in the fixture.
        action.manualInputState = 'complete'; action.permissions.canConfirm = true; action.permissions.reason = 'allowed'; action.version += 1;
        action.diff = action.diff.map(row => row.field === 'manualData' ? { ...row, afterDisplay: 'Dados preenchidos em formulário protegido' } : row); action.updatedAt = instant();
      }
      if (command.command === 'cancel') { action.status = 'cancelled'; action.permissions = { canConfirm: false, canEdit: false, canCancel: false, reason: 'terminalState' }; }
      if (command.command === 'confirm') {
        if (action.manualInputState === 'required') { fail(response, 'MANUAL_INPUT_REQUIRED', 'Complete os dados no formulário protegido.'); return true; }
        action.status = 'executed'; action.permissions = { canConfirm: false, canEdit: false, canCancel: false, reason: 'terminalState' };
        action.receipt = { receiptId: randomUUID(), executedAt: instant(), target: action.target, summary: 'Alteração concluída na prévia local.', replayed: false, undo: null };
        if (session.timeoutOnce) { session.timeoutOnce = false; fail(response, 'TEMPORARILY_UNAVAILABLE', 'A resposta demorou. Confira o resultado.', 503); return true; }
      }
      action.serverNow = instant(); json(response, action); return true;
    }
    if (url.pathname.endsWith('/workers-routines')) {
      const command = input as WorkspaceCommand; const snapshot = session.snapshot; snapshot.serverNow = instant();
      if (command.command === 'snapshot') { json(response, snapshot); return true; }
      if (command.command === 'usage') {
        if (session.readOnly) { fail(response, 'PERMISSION_DENIED', 'Acesso administrativo necessário.', 403); return true; }
        json(response, { from: command.from, to: command.to, serverNow: instant(), rows: [{ userId: session.userId, workerId: 'agenda', requests: 8, inputTokens: 8420, outputTokens: 2130, incompleteMeasurements: 1, costUsd: null, costSource: 'notReported', telemetryTrust: 'user_scoped' }, { userId: session.userId, workerId: 'arena', requests: 3, inputTokens: 2100, outputTokens: 650, incompleteMeasurements: 0, costUsd: null, costSource: 'notReported', telemetryTrust: 'user_scoped' }] }); return true;
      }
      if (command.command === 'executeDue') { json(response, { results: [], serverNow: instant() }); return true; }
      if (command.command === 'markAlertSeen') { const alert = snapshot.alerts.find(item => item.id === command.alertId); if (alert) alert.seenAt = instant(); json(response, { seen: true }); return true; }
      if (command.command === 'saveMemory') {
        const current = command.memoryId ? snapshot.memories.find(item => item.id === command.memoryId) : undefined;
        if (current && current.version !== command.expectedVersion) { fail(response, 'VERSION_CONFLICT', 'A preferência mudou. Confira a versão atual.'); return true; }
        const memory: MemoryView = { id: current?.id ?? randomUUID(), orgId, version: (current?.version ?? 0) + 1, workerId: command.workerId, content: command.content, enabled: command.enabled, createdAt: current?.createdAt ?? instant(), updatedAt: instant() };
        snapshot.memories = [memory, ...snapshot.memories.filter(item => item.id !== memory.id)]; json(response, memory); return true;
      }
      const routine = 'routineId' in command ? snapshot.routines.find(item => item.id === command.routineId) : undefined;
      if (!routine) { fail(response, 'NOT_FOUND', 'Rotina não encontrada.', 404); return true; }
      if ('expectedVersion' in command && command.expectedVersion !== routine.version) { fail(response, 'VERSION_CONFLICT', 'A rotina mudou. Confira a versão atual.'); return true; }
      if (command.command === 'confirmRoutine') routine.state = 'active';
      if (command.command === 'setRoutineState') routine.state = command.state;
      if (command.command === 'undoRoutine') routine.state = 'disabled';
      routine.version += 1; routine.updatedAt = instant(); routine.serverNow = instant(); routine.canConfirm = false; routine.canEdit = !session.readOnly && routine.state !== 'disabled';
      if (routine.state === 'active') snapshot.events.push({ id: randomUUID(), conversationId, createdAt: instant(), kind: 'routineCreated', entityId: routine.id, version: routine.version, label: `Rotina criada: ${routine.config.title}, ${routine.scheduleLabel}`, canUndo: true });
      if (command.command === 'undoRoutine') snapshot.events.push({ id: randomUUID(), conversationId, createdAt: instant(), kind: 'routineUndone', entityId: routine.id, version: routine.version, label: `Rotina desativada: ${routine.config.title}`, canUndo: false });
      json(response, routine); return true;
    }
    return false;
  } catch { fail(response, 'INVALID_INPUT', 'Não foi possível processar o cenário local.', 400); return true; }
}
