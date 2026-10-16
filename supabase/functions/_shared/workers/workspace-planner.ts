import type { SupabaseClient } from '@supabase/supabase-js';
import { executeActionProposal, listActionProposalTools } from './action-tools.ts';
import { isObject, isUuid, type PlannerTool, type WorkerId, type WorkerCitation, WorkerError } from './contracts.ts';
import type { ProposalIntent } from './proposal-policy.ts';
import { routineConfigSchema, type RoutineView } from './workspace-contracts.ts';
import { workspaceRpc } from './workspace-http.ts';

const routineTool: PlannerTool = {
  name: 'propose_routine', readOnly: false, title: 'proposta de rotina',
  description: 'Propõe rotina de consulta in-app com sessão válida. Nunca ativa nem executa. Horário America/Sao_Paulo; dias ISO 1=segunda a 7=domingo. Use somente as três receitas. Consulta agenda/conflitos, vendas abertas pela data de criação ou clima de transportes com dados válidos. Se faltar projeto/comissão, consulte antes; não invente ID. Não envia mensagens externas.',
  inputJsonSchema: { type: 'object', additionalProperties: false, required: ['title','workerId','schedule','recipe','delivery','executionMode'], properties: {
    title: { type: 'string', minLength: 1, maxLength: 100 }, workerId: { type: 'string', enum: ['agenda','arena','mapa','logistica'] },
    schedule: { type: 'object', additionalProperties: false, required: ['timeZone','localTime','weekdays'], properties: {
      timeZone: { type: 'string', enum: ['America/Sao_Paulo'] }, localTime: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
      weekdays: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 }, minItems: 1, maxItems: 7, uniqueItems: true },
    } },
    recipe: { anyOf: [
      { type: 'object', additionalProperties: false, required: ['recipeId','commissionId','dayOffset','includeRestaurantConflicts'], properties: {
        recipeId: { type: 'string', enum: ['agendaBriefing'] }, commissionId: { type: ['string','null'], format: 'uuid' }, dayOffset: { type: 'integer', enum: [0,1] }, includeRestaurantConflicts: { type: 'boolean' },
      } },
      { type: 'object', additionalProperties: false, required: ['recipeId','projectId','minimumAgeDays'], properties: {
        recipeId: { type: 'string', enum: ['openSalesAge'] }, projectId: { type: 'string', format: 'uuid' }, minimumAgeDays: { type: 'integer', minimum: 1, maximum: 365 },
      } },
      { type: 'object', additionalProperties: false, required: ['recipeId'], properties: { recipeId: { type: 'string', enum: ['transportWeather'] } } },
    ] }, delivery: { type: 'string', enum: ['inApp'] }, executionMode: { type: 'string', enum: ['activeSession'] },
  } },
};

/** UI proposal routes and planner share the same closed action registry/RPCs. No confirm tool exists. */
export function workspacePlanner(client: SupabaseClient, orgId: string) {
  return {
    async proposalTools(intent: ProposalIntent, worker: WorkerId): Promise<PlannerTool[]> {
      if (intent === 'routine') return [routineTool]; // Recipe/role/scope is revalidated in the proposal transaction.
      if (intent === 'arena_note' && worker === 'arena') {
        const { data, error } = await client.rpc('venue_get_permissions', { _org_id: orgId });
        if (error || !isObject(data) || data.venue_events_access !== true || data.venue_events_manage !== true) return [];
      } else if ((intent === 'commercial_reserve' || intent === 'commercial_negotiate') && worker === 'mapa') {
        const { data, error } = await client.rpc('map_has_explicit_capability', { _org_id: orgId, _capability: 'map.manage_sales' });
        if (error || data !== true) return [];
      } else return [];
      return listActionProposalTools(worker).filter(tool => tool.kind === intent).map(tool => ({ ...tool, readOnly: false }));
    },
    async propose(name: string, input: unknown, context: { conversationId: string; requestId: string }): Promise<{ kind: 'action' | 'routine'; id: string; citation: WorkerCitation }> {
      if (name === routineTool.name) {
        const parsed = routineConfigSchema.safeParse(input);
        if (!parsed.success) throw new WorkerError('invalid_tool_arguments', 422);
        const result = await workspaceRpc(client, 'ai_workspace_propose_routine', {
          _org_id: orgId, _conversation_id: context.conversationId, _request_id: context.requestId, _config: parsed.data,
        });
        if (!isObject(result) || !isUuid(result.id)) throw new WorkerError('invalid_storage_response', 503);
        const routine = result as unknown as RoutineView;
        return { kind: 'routine', id: routine.id, citation: { label: 'Revisar rotina proposta', url: '/equipe-ia?view=routines', source: 'app' } };
      }
      const action = await executeActionProposal(client, name, input, { ...context, orgId });
      return { kind: 'action', id: action.id, citation: { label: action.target.label, url: action.target.href, source: 'app' } };
    },
    async memory(worker: WorkerId): Promise<string[]> {
      // Memory is optional context: a missing table or read failure must never fail the chat turn.
      try {
        const { data, error } = await client.from('ai_memory').select('content,worker_id,updated_at')
          .eq('org_id', orgId).eq('enabled', true)
          .or(`worker_id.is.null,worker_id.eq.${worker}`)
          .order('updated_at', { ascending: false }).limit(10);
        if (error) { console.warn('workers memory unavailable', error.code ?? 'unknown'); return []; }
        return (data ?? []).map(row => String(row.content).slice(0, 1000));
      } catch { return []; }
    },
  };
}
