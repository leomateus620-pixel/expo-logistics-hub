import { z } from 'zod';
import type { WorkerId, WorkerCitation } from './contracts.ts';

/** Shared wire contract. Business writes never accept a caller-supplied receipt or RPC. */
const id = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
export const actionKinds = ['arena_note', 'commercial_reserve', 'commercial_negotiate'] as const;
export type ActionKind = typeof actionKinds[number];
export type ActionStatus = 'proposed' | 'confirmed' | 'executed' | 'cancelled' | 'expired' | 'failed';
export const actionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('arena_note'), eventId: id, body: text(2000).min(2) }).strict(),
  z.object({ kind: z.literal('commercial_reserve'), lotId: id }).strict(),
  z.object({ kind: z.literal('commercial_negotiate'), lotId: id }).strict(),
]);
export type ActionProposalInput = z.infer<typeof actionInputSchema>;
// Private form path only: never expose these values as a planner tool, SSE, diff or log.
export const actionManualInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('commercial_reserve'), companyName: text(160), contactName: text(160),
    reservationExpiresAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ kind: z.literal('commercial_negotiate'), companyName: text(160), contactName: z.string().trim().max(160).nullable() }).strict(),
]);
export type CommercialManualInput = z.infer<typeof actionManualInputSchema>;
export interface SafeTarget { recordId: string; label: string; href: string }
export interface SafeDiffRow { field: string; label: string; beforeDisplay: string | null; afterDisplay: string | null; redacted: boolean }
export interface ActionReceipt {
  receiptId: string; executedAt: string; target: SafeTarget; summary: string; replayed: boolean; undo: null;
}
export interface ActionView {
  id: string; orgId: string; conversationId: string; workerId: WorkerId; kind: ActionKind;
  version: number; status: ActionStatus; summary: string; target: SafeTarget; diff: SafeDiffRow[];
  createdAt: string; updatedAt: string; expiresAt: string; serverNow: string;
  permissions: { canConfirm: boolean; canEdit: boolean; canCancel: boolean; reason: string };
  manualInputState: 'notRequired' | 'required' | 'complete';
  receipt: ActionReceipt | null; failure: { code: string; message: string } | null;
}
export const actionCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('list'), orgId: id, conversationId: id.optional() }).strict(),
  z.object({ command: z.literal('get'), orgId: id, actionId: id }).strict(),
  z.object({ command: z.literal('propose'), orgId: id, conversationId: id, requestId: id, input: actionInputSchema }).strict(),
  z.object({ command: z.literal('edit'), orgId: id, actionId: id, expectedVersion: z.number().int().positive(), requestId: id, input: actionInputSchema }).strict(),
  z.object({ command: z.literal('manual'), orgId: id, actionId: id, expectedVersion: z.number().int().positive(), requestId: id, manualInput: actionManualInputSchema }).strict(),
  z.object({ command: z.literal('confirm'), orgId: id, actionId: id, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ command: z.literal('cancel'), orgId: id, actionId: id, expectedVersion: z.number().int().positive() }).strict(),
]);
export type ActionCommand = z.infer<typeof actionCommandSchema>;

export const routineRecipeSchema = z.discriminatedUnion('recipeId', [
  z.object({ recipeId: z.literal('agendaBriefing'), commissionId: id.nullable(), dayOffset: z.union([z.literal(0), z.literal(1)]), includeRestaurantConflicts: z.boolean() }).strict(),
  z.object({ recipeId: z.literal('openSalesAge'), projectId: id, minimumAgeDays: z.number().int().min(1).max(365) }).strict(),
  z.object({ recipeId: z.literal('transportWeather') }).strict(),
]);
export const routineConfigSchema = z.object({
  title: text(100), workerId: z.enum(['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar']),
  schedule: z.object({ timeZone: z.literal('America/Sao_Paulo'), localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(values => new Set(values).size === values.length) }).strict(),
  recipe: routineRecipeSchema, delivery: z.literal('inApp'), executionMode: z.literal('activeSession'),
}).strict();
export type RoutineConfig = z.infer<typeof routineConfigSchema>;
export interface RoutineView {
  id: string; orgId: string; conversationId: string; version: number; config: RoutineConfig;
  state: 'proposed' | 'active' | 'paused' | 'disabled' | 'cancelled' | 'expired';
  scheduleLabel: string; nextScheduledAt: string | null; createdAt: string; updatedAt: string;
  expiresAt: string | null; serverNow: string; lastRunAt: string | null; waitingForSession: boolean;
  canConfirm: boolean; canEdit: boolean; canRunNow: boolean; unavailableReason: string | null;
}
export interface RoutineRunView {
  id: string; routineId: string; conversationId: string; requestId: string; routineVersion: number;
  scheduledFor: string; referenceDate: string; startedAt: string | null; finishedAt: string | null;
  state: 'running' | 'succeeded' | 'failed' | 'skipped'; catchUp: boolean;
  failureCode: string | null; resultTrust: 'user_scoped_reported' | 'none';
}
export interface RoutineLiveResult {
  run: RoutineRunView; content: string; citations: WorkerCitation[];
  chips: Array<{ label: string; href: string }>;
}
export interface SystemEventView {
  id: string; conversationId: string; createdAt: string;
  kind: 'routineCreated' | 'routineChanged' | 'routineUndone' | 'routineRun' | 'memoryChanged';
  entityId: string; version: number; label: string; canUndo: boolean;
}
export interface MemoryView {
  id: string; orgId: string; version: number; workerId: WorkerId | null;
  content: string; enabled: boolean; createdAt: string; updatedAt: string;
}
export interface WorkerAlertView {
  id: string; workerId: WorkerId; kind: 'restaurantConflict' | 'openSalesAge' | 'transportWeather' | 'routineFailure';
  title: string; href: string; routineId: string; runId: string;
  createdAt: string; expiresAt: string; seenAt: string | null;
}
export interface WorkspaceSnapshot {
  serverNow: string; routines: RoutineView[]; runs: RoutineRunView[]; events: SystemEventView[];
  memories: MemoryView[]; alerts: WorkerAlertView[];
}
export interface UsageSummary {
  from: string; to: string; serverNow: string;
  rows: Array<{ userId: string; workerId: WorkerId; requests: number; inputTokens: number; outputTokens: number;
    incompleteMeasurements: number; costUsd: null; costSource: 'notReported'; telemetryTrust: 'user_scoped' }>;
}
export const workspaceCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('snapshot'), orgId: id, conversationId: id.optional() }).strict(),
  z.object({ command: z.literal('proposeRoutine'), orgId: id, conversationId: id, requestId: id, config: routineConfigSchema }).strict(),
  z.object({ command: z.literal('confirmRoutine'), orgId: id, routineId: id, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ command: z.literal('setRoutineState'), orgId: id, routineId: id, expectedVersion: z.number().int().positive(), state: z.enum(['active', 'paused', 'disabled']) }).strict(),
  z.object({ command: z.literal('undoRoutine'), orgId: id, routineId: id, expectedVersion: z.number().int().positive() }).strict(),
  z.object({ command: z.literal('executeDue'), orgId: id, requestId: id }).strict(),
  z.object({ command: z.literal('saveMemory'), orgId: id, requestId: id, memoryId: id.optional(), expectedVersion: z.number().int().positive().optional(),
    workerId: z.enum(['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar']).nullable(), content: text(1000), enabled: z.boolean() }).strict(),
  z.object({ command: z.literal('markAlertSeen'), orgId: id, alertId: id }).strict(),
  z.object({ command: z.literal('usage'), orgId: id, from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).strict(),
]);
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;
export type WorkspaceResponse = WorkspaceSnapshot | RoutineView | MemoryView | UsageSummary | { results: RoutineLiveResult[]; serverNow: string } | { seen: true };
