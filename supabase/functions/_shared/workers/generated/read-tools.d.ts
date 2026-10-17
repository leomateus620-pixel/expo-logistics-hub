// AUTO-GENERATED from canonical TypeScript declarations. Do not edit.
// Source inputs + generator SHA256: a0c81ce1a09eb5a3aa2a0152cad8690b2da493d4c9e72886374a04aeb35acf9d
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

/** Re-check identity with Auth, then fetch only the caller's active membership/grants. */
export declare function resolveWorkerAccess(client: SupabaseClient, userId: string, orgId: string): Promise<WorkerAccessContext>;

export declare function listWorkerTools(workerId: WorkerId, context: WorkerAccessContext): Promise<WorkerToolDefinition[]>;

export declare function executeWorkerTool(name: string, input: unknown, context: WorkerAccessContext): Promise<ToolResult>;
