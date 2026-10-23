// AUTO-GENERATED from canonical TypeScript declarations. Do not edit.
// Source inputs + generator SHA256: 9697c621f7a9ae1af22cac5daaa0d7313f791b5a133d9a1ed2de7358312c6383
import type { SupabaseClient } from '@supabase/supabase-js';

import type { z } from 'zod';

import type { CommercialReportSnapshot } from "../commercial-report.ts";

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
    /** Server-only evidence for immutable capture; never sent to the planner or chat. */
    commercialSnapshot?: CommercialReportSnapshot;
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
