import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

export type WorkerId = 'agenda' | 'arena' | 'mapa' | 'interesse' | 'comissao' | 'logistica' | 'caixa' | 'radar';
export type WorkerRole = 'admin' | 'gestor' | 'operador' | 'leitura';
export interface WorkerAccessContext {
  userId: string;
  orgId: string;
  role: WorkerRole;
  capabilities: ReadonlySet<string>;
  /** Must be a publishable-key client carrying the verified user's JWT. */
  supabase: SupabaseClient;
}
export interface ToolCitation {
  label: string;
  url: string;
  source: 'app' | 'web';
  date?: string;
}
export interface ToolResult {
  summary: string;
  records: Array<Record<string, unknown>>;
  citations: ToolCitation[];
  total?: number;
  truncated?: boolean;
}
export type AccessPolicy = 'member' | 'commission' | 'map' | 'map_sales' | 'map_contracts' | 'analytics' | 'venue' | 'venue_reports' | 'financial' | 'logistics';
export interface WorkerToolDefinition {
  name: string;
  worker: WorkerId;
  title: string;
  description: string;
  inputSchema: z.AnyZodObject;
  inputJsonSchema: Record<string, unknown>;
  readOnly: true;
  requiresConfirmation: false;
  capability: {
    policy: AccessPolicy;
    required: readonly string[];
    anyOf?: readonly string[];
    membershipRequired: true;
    scope: string;
  };
  deepLink: string;
  sources: readonly string[];
}
export class WorkerToolError extends Error {
  constructor(public readonly code: 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'TOOL_NOT_ALLOWED' | 'INVALID_INPUT' | 'DATA_UNAVAILABLE' | 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'WorkerToolError';
  }
}
