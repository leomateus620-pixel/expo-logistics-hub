import { z } from 'zod';
import { uuid, limit, workerJsonSchema } from '../schema.ts';
import type { AccessPolicy, WorkerId, WorkerToolDefinition } from '../types.ts';

const required: Record<AccessPolicy, readonly string[]> = {
  member: [], commission: [], map: ['map.view'], map_sales: ['map.manage_sales'], map_contracts: ['map.manage_sales','map.manage_contracts'],
  analytics: ['map.analytics.view','map.manage_sales'], venue: ['venue_events_access'], venue_reports: ['venue_events_access'],
  financial: ['financial_access'], logistics: ['full_access'],
};
export const input = (shape: z.ZodRawShape = {}) => z.object(shape).strict();
export const project = () => ({ project_id: uuid(), limit: limit() });
export const commission = () => ({ commission_id: uuid(), limit: limit() });
export const financial = () => input({ edition_id: uuid() });
export function tool(name: string, worker: WorkerId, title: string, description: string, inputSchema: z.AnyZodObject, policy: AccessPolicy, deepLink: string, sources: readonly string[]): WorkerToolDefinition {
  return Object.freeze({ name, worker, title, description, inputSchema, inputJsonSchema: workerJsonSchema(inputSchema), readOnly: true, requiresConfirmation: false,
    capability: Object.freeze({ policy, required: required[policy], ...(policy === 'venue_reports' ? { anyOf: ['venue_reports_view','venue_counterparts_manage'] } : {}), membershipRequired: true, scope: 'JWT do usuário + organização ativa + RLS + escopo persistido do registro' }), deepLink, sources: Object.freeze([...sources]) });
}
