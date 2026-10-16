import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { safeWorkerSourceUrl } from './api';
import {
  actionCommandSchema, actionKinds, routineConfigSchema, workspaceCommandSchema,
  type ActionCommand, type ActionView, type WorkspaceCommand, type WorkspaceResponse,
} from './workspace-contracts';

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const safeText = (max: number) => z.string().max(max);
const worker = z.enum(['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar']);
const href = z.string().refine(value => Boolean(safeWorkerSourceUrl(value, 'app')), 'Destino inválido');
const target = z.object({ recordId: uuid, label: safeText(200), href }).strict();
const citation = z.object({ label: safeText(160), url: z.string(), source: z.enum(['app', 'web']), date: z.string().optional() }).strict()
  .refine(value => Boolean(safeWorkerSourceUrl(value.url, value.source)), 'Fonte inválida');
const diff = z.object({ field: safeText(80), label: safeText(160), beforeDisplay: safeText(2200).nullable(), afterDisplay: safeText(2200).nullable(), redacted: z.boolean() }).strict();
const action = z.object({
  id: uuid, orgId: uuid, conversationId: uuid, workerId: worker, kind: z.enum(actionKinds), version: z.number().int().positive(),
  status: z.enum(['proposed', 'confirmed', 'executed', 'cancelled', 'expired', 'failed']), summary: safeText(300), target,
  diff: z.array(diff).max(12), createdAt: instant, updatedAt: instant, expiresAt: instant, serverNow: instant,
  permissions: z.object({ canConfirm: z.boolean(), canEdit: z.boolean(), canCancel: z.boolean(), reason: safeText(100) }).strict(),
  manualInputState: z.enum(['notRequired', 'required', 'complete']),
  receipt: z.object({ receiptId: uuid, executedAt: instant, target, summary: safeText(300), replayed: z.boolean(), undo: z.null() }).strict().nullable(),
  failure: z.object({ code: safeText(100), message: safeText(300) }).strict().nullable(),
}).strict();
const routine = z.object({
  id: uuid, orgId: uuid, conversationId: uuid, version: z.number().int().positive(), config: routineConfigSchema,
  state: z.enum(['proposed', 'active', 'paused', 'disabled', 'cancelled', 'expired']), scheduleLabel: safeText(300),
  nextScheduledAt: instant.nullable(), createdAt: instant, updatedAt: instant, expiresAt: instant.nullable(), serverNow: instant,
  lastRunAt: instant.nullable(), waitingForSession: z.boolean(), canConfirm: z.boolean(), canEdit: z.boolean(), canRunNow: z.boolean(), unavailableReason: safeText(300).nullable(),
}).strict();
const run = z.object({
  id: uuid, routineId: uuid, conversationId: uuid, requestId: uuid, routineVersion: z.number().int().positive(), scheduledFor: instant,
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startedAt: instant.nullable(), finishedAt: instant.nullable(),
  state: z.enum(['running', 'succeeded', 'failed', 'skipped']), catchUp: z.boolean(), failureCode: safeText(100).nullable(),
  resultTrust: z.enum(['user_scoped_reported', 'none']),
}).strict();
const event = z.object({
  id: uuid, conversationId: uuid, createdAt: instant, kind: z.enum(['routineCreated', 'routineChanged', 'routineUndone', 'routineRun', 'memoryChanged']),
  entityId: uuid, version: z.number().int().positive(), label: safeText(300), canUndo: z.boolean(),
}).strict();
const memory = z.object({ id: uuid, orgId: uuid, version: z.number().int().positive(), workerId: worker.nullable(), content: safeText(1000), enabled: z.boolean(), createdAt: instant, updatedAt: instant }).strict();
const alert = z.object({
  id: uuid, workerId: worker, kind: z.enum(['restaurantConflict', 'openSalesAge', 'transportWeather', 'routineFailure']), title: safeText(300), href,
  routineId: uuid, runId: uuid, createdAt: instant, expiresAt: instant, seenAt: instant.nullable(),
}).strict();
const snapshot = z.object({
  serverNow: instant, routines: z.array(routine).max(100), runs: z.array(run).max(100), events: z.array(event).max(200),
  memories: z.array(memory).max(100), alerts: z.array(alert).max(100),
}).strict();
const usage = z.object({
  from: instant, to: instant, serverNow: instant,
  rows: z.array(z.object({ userId: uuid, workerId: worker, requests: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
    incompleteMeasurements: z.number().int().nonnegative(), costUsd: z.null(), costSource: z.literal('notReported'), telemetryTrust: z.literal('user_scoped') }).strict()).max(1000),
}).strict();
const liveResults = z.object({ results: z.array(z.object({ run, content: safeText(24000), citations: z.array(citation).max(30), chips: z.array(z.object({ label: safeText(160), href }).strict()).max(30) }).strict()).max(2), serverNow: instant }).strict();

const errorMessages: Record<string, string> = {
  forbidden: 'Seu acesso atual não permite esta operação.', auth_required: 'Sua sessão expirou. Entre novamente.',
  invalid_request: 'Revise os campos antes de continuar.', stale_version: 'O registro mudou. Revise uma nova proposta.',
  expired: 'Esta proposta expirou. Solicite uma nova.', state_conflict: 'A situação mudou. Atualize os dados antes de continuar.',
  request_in_progress: 'Esta operação está sendo processada. Aguarde e atualize o resultado.', rate_limited: 'Muitas operações em pouco tempo. Aguarde um momento.',
  sensitive_input: 'Use uma nota operacional sem documentos, contatos, PIX ou segredos.',
  unavailable: 'Esta ação ainda não está disponível para os bots.',
  version_conflict: 'A proposta ou o registro mudou. Atualize os dados antes de confirmar.',
  resource_busy: 'O registro está em uso. Aguarde e atualize a mesma proposta.',
  sensitive_text: 'Remova documentos, contatos, PIX, segredos e links externos do texto operacional.',
  manual_input_required: 'Preencha os dados privados antes de revisar e confirmar.',
  proposal_expired: 'A proposta expirou. Solicite uma nova.',
  idempotency_mismatch: 'Este pedido já foi usado com outros dados. Atualize a proposta.',
};
export class WorkerWorkspaceError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(errorMessages[code] ?? 'Não foi possível concluir. Atualize o resultado antes de tentar novamente.');
  }
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new WorkerWorkspaceError('invalid_response', 502);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = []; let length = 0;
  const stop = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const next = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (next.done) break;
      length += next.value.length;
      if (length > 512_000) throw new WorkerWorkspaceError('invalid_response', 502);
      parts.push(next.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new WorkerWorkspaceError('invalid_response', 502); }
  } finally { signal?.removeEventListener('abort', stop); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

async function post(name: 'workers-actions' | 'workers-routines', command: unknown, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const { data, error } = await supabase.auth.getSession();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error || !data.session) throw new WorkerWorkspaceError('auth_required', 401);
  const url = import.meta.env.VITE_SUPABASE_URL; const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new WorkerWorkspaceError('unavailable', 503);
  const response = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const value = await readJson(response, signal);
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string() }).passthrough() }).safeParse(value);
    const fallback = response.status === 401 ? 'auth_required' : response.status === 403 ? 'forbidden' : response.status === 429 ? 'rate_limited' : response.status === 404 ? 'unavailable' : 'request_failed';
    throw new WorkerWorkspaceError(parsed.success ? parsed.data.error.code : fallback, response.status);
  }
  return value;
}

export async function callWorkerAction(command: ActionCommand, signal?: AbortSignal): Promise<ActionView | ActionView[]> {
  const request = actionCommandSchema.parse(command);
  const value = await post('workers-actions', request, signal);
  const result = (request.command === 'list' ? z.array(action).max(100) : action).safeParse(value);
  if (!result.success) throw new WorkerWorkspaceError('invalid_response', 502);
  const rows = Array.isArray(result.data) ? result.data : [result.data];
  if (rows.some(row => row.orgId !== request.orgId || ('conversationId' in request && request.conversationId && row.conversationId !== request.conversationId)
    || ('actionId' in request && row.id !== request.actionId))) throw new WorkerWorkspaceError('invalid_response', 502);
  return result.data as ActionView | ActionView[];
}

export async function callWorkerWorkspace(command: WorkspaceCommand, signal?: AbortSignal): Promise<WorkspaceResponse> {
  const request = workspaceCommandSchema.parse(command);
  const value = await post('workers-routines', request, signal);
  const schema = request.command === 'snapshot' ? snapshot : request.command === 'usage' ? usage
    : request.command === 'saveMemory' ? memory : request.command === 'markAlertSeen' ? z.object({ seen: z.literal(true) }).strict()
    : request.command === 'executeDue' ? liveResults : routine;
  const result = schema.safeParse(value);
  if (!result.success) throw new WorkerWorkspaceError('invalid_response', 502);
  const checkScope = (row: { orgId: string }) => row.orgId === request.orgId;
  if ('orgId' in result.data && !checkScope(result.data as { orgId: string })) throw new WorkerWorkspaceError('invalid_response', 502);
  if (request.command === 'snapshot') {
    const data = result.data as z.infer<typeof snapshot>;
    if (data.routines.some(row => !checkScope(row as { orgId: string })) || data.memories.some(row => !checkScope(row as { orgId: string }))
      || (request.conversationId && [...data.runs, ...data.events, ...data.routines].some(row => row.conversationId !== request.conversationId))) throw new WorkerWorkspaceError('invalid_response', 502);
  }
  return result.data as WorkspaceResponse;
}
