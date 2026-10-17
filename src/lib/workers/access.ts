import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkerToolError, workerDataError, type AccessPolicy, type WorkerAccessContext, type WorkerRole } from './types.ts';
import { workerAuthFailureCode } from './auth-failure.ts';

const roles: readonly string[] = ['admin', 'gestor', 'operador', 'leitura'];

/** Re-check identity with Auth, then fetch only the caller's active membership/grants. */
export async function resolveWorkerAccess(client: SupabaseClient, userId: string, orgId: string): Promise<WorkerAccessContext> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) {
    const cause = workerAuthFailureCode(authError);
    const technicalCode = /^[A-Z0-9_]{1,40}$/i.test(authError.code ?? '') ? authError.code : undefined;
    throw new WorkerToolError(cause === 'network_error' ? 'NETWORK_ERROR' : cause === 'timeout' ? 'TIMEOUT'
      : cause === 'forbidden' ? 'AUTH_REQUIRED' : 'DATA_UNAVAILABLE', 'Não foi possível verificar a sessão.', { stage: 'authentication', technicalCode });
  }
  if (!auth?.user || auth.user.id !== userId || auth.user.role === 'service_role') {
    throw new WorkerToolError('AUTH_REQUIRED', 'Sessão de usuário necessária.');
  }
  const { data: member, error: memberError } = await client.from('org_members')
    .select('role,org_id,user_id').eq('user_id', userId).eq('org_id', orgId).eq('is_active', true).maybeSingle();
  if (memberError) throw workerDataError(memberError, 'authorization');
  if (!member || member.org_id !== orgId || member.user_id !== userId || !roles.includes(member.role)) {
    throw new WorkerToolError('PERMISSION_DENIED', 'Organização sem vínculo ativo.');
  }
  const { data: grants, error: grantsError } = await client.from('user_capabilities')
    .select('capability').eq('user_id', userId).eq('org_id', orgId);
  if (grantsError) throw workerDataError(grantsError, 'authorization');
  return { userId, orgId, role: member.role as WorkerRole, capabilities: new Set((grants ?? []).map((item) => item.capability)), supabase: client };
}

export function hasWorkerPolicy(policy: AccessPolicy, ctx: Pick<WorkerAccessContext, 'role' | 'capabilities'>): boolean {
  const caps = ctx.capabilities;
  const elevated = ctx.role === 'admin' || ctx.role === 'gestor';
  const operator = ctx.role === 'operador' && !caps.has('restricted_scope');
  const full = elevated || operator || caps.has('full_access');
  const map = (cap: string) => elevated || caps.has(cap) || caps.has('map.admin') || caps.has('full_access');
  switch (policy) {
    case 'member': return true;
    case 'commission': return true; // Handler additionally limits to the caller's persisted commission IDs.
    case 'map': return operator || map('map.view');
    case 'map_sales': return map('map.manage_sales');
    case 'map_contracts': return map('map.manage_sales') && map('map.manage_contracts');
    case 'analytics': return (full || caps.has('map.analytics.view')) && map('map.manage_sales');
    case 'venue': return full || caps.has('venue_events_access') || caps.has('venue_events_full_access');
    case 'venue_reports': return full || caps.has('venue_counterparts_manage') || caps.has('venue_reports_view') || caps.has('venue_events_full_access');
    case 'financial': return ctx.role === 'admin' || ['financial_access', 'financial_edit', 'financial_confirm', 'financial_settle', 'financial_admin'].some((cap) => caps.has(cap));
    case 'logistics': return full;
  }
}

export async function authorizeWorkerPolicy(policy: AccessPolicy, ctx: WorkerAccessContext): Promise<boolean> {
  if (!hasWorkerPolicy(policy, ctx)) return false;
  if (policy === 'financial') {
    const { data, error } = await ctx.supabase.rpc('financial_can', { _org_id: ctx.orgId, _capability: 'financial_access' });
    if (error) throw workerDataError(error, 'authorization');
    return data === true;
  }
  if (policy === 'venue' || policy === 'venue_reports') {
    const { data, error } = await ctx.supabase.rpc('venue_get_permissions', { _org_id: ctx.orgId });
    if (error) throw workerDataError(error, 'authorization');
    if (!data || typeof data !== 'object') return false;
    const permissions = data as Record<string, boolean>;
    return permissions.venue_events_access === true && (policy !== 'venue_reports' || permissions.venue_reports_view === true || permissions.venue_counterparts_manage === true);
  }
  if (policy === 'map_sales' || policy === 'map_contracts' || policy === 'analytics') {
    const { data, error } = await ctx.supabase.rpc('map_has_explicit_capability', { _org_id: ctx.orgId, _capability: 'map.manage_sales' });
    if (error) throw workerDataError(error, 'authorization');
    if (data !== true) return false;
    if (policy === 'map_contracts') {
      const result = await ctx.supabase.rpc('map_has_explicit_capability', { _org_id: ctx.orgId, _capability: 'map.manage_contracts' });
      if (result.error) throw workerDataError(result.error, 'authorization');
      return result.data === true;
    }
  }
  return true;
}
