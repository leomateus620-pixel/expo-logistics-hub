import type { SupabaseClient } from '@supabase/supabase-js';
import { actionCommandSchema, actionInputSchema, type ActionCommand, type ActionView } from './workspace-contracts.ts';
import { WorkerError, type WorkerId } from './contracts.ts';
import { workspaceRpc } from './workspace-http.ts';

/** Only proposals are planner tools. Confirm/edit/manual/cancel are explicit UI requests. */
export const actionProposalTools = [
  { name: 'propose_arena_note', workerId: 'arena', kind: 'arena_note', readOnly: false, proposalOnly: true, requiresConfirmation: true,
    requiredCapabilities: ['venue_events_access','venue_events_manage'],
    description: 'Propõe uma NOVA nota operacional no evento, sem dados pessoais. Não executa. O usuário revisa e confirma em outra requisição.',
    inputJsonSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['arena_note'] }, eventId: { type: 'string', format: 'uuid' }, body: { type: 'string', minLength: 2, maxLength: 2000 } }, required: ['kind','eventId','body'], additionalProperties: false } },
  { name: 'propose_commercial_reservation', workerId: 'mapa', kind: 'commercial_reserve', readOnly: false, proposalOnly: true, requiresConfirmation: true,
    requiredCapabilities: ['map.view','map.manage_sales'],
    description: 'Propõe reserva de um lote AVAILABLE sem operação ativa. Não coleta dados de contato no chat nem executa; formulário privado e confirmação do usuário são necessários.',
    inputJsonSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['commercial_reserve'] }, lotId: { type: 'string', format: 'uuid' } }, required: ['kind','lotId'], additionalProperties: false } },
  { name: 'propose_commercial_negotiation', workerId: 'mapa', kind: 'commercial_negotiate', readOnly: false, proposalOnly: true, requiresConfirmation: true,
    requiredCapabilities: ['map.view','map.manage_sales'],
    description: 'Propõe iniciar negociação de lote AVAILABLE, sem cancelar operação anterior. Não recebe preço nem dados pessoais. Formulário privado e confirmação são necessários.',
    inputJsonSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['commercial_negotiate'] }, lotId: { type: 'string', format: 'uuid' } }, required: ['kind','lotId'], additionalProperties: false } },
] as const;

export function listActionProposalTools(workerId: WorkerId) {
  return actionProposalTools.filter(tool => tool.workerId === workerId);
}

export async function executeActionCommand(client: SupabaseClient, value: unknown): Promise<ActionView | ActionView[]> {
  const parsed = actionCommandSchema.safeParse(value);
  if (!parsed.success) throw new WorkerError('invalid_request');
  const command: ActionCommand = parsed.data;
  const common = { _org_id: command.orgId };
  let result: unknown;
  switch (command.command) {
    case 'list': result = await workspaceRpc(client, 'ai_workers_list_actions', { ...common, _conversation_id: command.conversationId ?? null }); break;
    case 'get': result = await workspaceRpc(client, 'ai_workers_get_action', { ...common, _action_id: command.actionId }); break;
    case 'propose': result = await workspaceRpc(client, 'ai_workers_propose_action', { ...common, _conversation_id: command.conversationId, _request_id: command.requestId, _input: command.input }); break;
    case 'edit': result = await workspaceRpc(client, 'ai_workers_edit_action', { ...common, _action_id: command.actionId, _expected_revision: command.expectedVersion, _request_id: command.requestId, _input: command.input }); break;
    case 'manual': result = await workspaceRpc(client, 'ai_workers_manual_action', { ...common, _action_id: command.actionId, _expected_revision: command.expectedVersion, _request_id: command.requestId, _manual_input: command.manualInput }); break;
    case 'confirm': result = await workspaceRpc(client, 'ai_workers_confirm_action', { ...common, _action_id: command.actionId, _expected_revision: command.expectedVersion }); break;
    case 'cancel': result = await workspaceRpc(client, 'ai_workers_cancel_action', { ...common, _action_id: command.actionId, _expected_revision: command.expectedVersion }); break;
  }
  if ((command.command === 'list' && !Array.isArray(result)) || (command.command !== 'list' && (!result || typeof result !== 'object' || Array.isArray(result)))) throw new WorkerError('storage_unavailable', 503);
  return result as ActionView | ActionView[];
}

export async function executeActionProposal(client: SupabaseClient, name: string, input: unknown,
  context: { orgId: string; conversationId: string; requestId: string }): Promise<ActionView> {
  const tool = actionProposalTools.find(candidate => candidate.name === name);
  const parsed = actionInputSchema.safeParse(input);
  if (!tool || !parsed.success || parsed.data.kind !== tool.kind) throw new WorkerError('invalid_request');
  return await executeActionCommand(client, { command: 'propose', ...context, input: parsed.data }) as ActionView;
}
