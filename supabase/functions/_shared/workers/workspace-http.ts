import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveWorkerAccess } from './generated/read-tools.js';
import { isObject, WorkerError } from './contracts.ts';

export const workspaceHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-platform-version, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function publicWorkspaceKey(): string {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (direct?.startsWith('sb_publishable_')) return direct;
  // Legacy anon JWTs remain supported; a service-role/secret key is never accepted.
  if (direct?.split('.').length === 3) {
    try {
      const body: unknown = JSON.parse(atob(direct.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (isObject(body) && body.role === 'anon') return direct;
    } catch { /* Do not disclose configuration or key material. */ }
  }
  try {
    const values: unknown = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (isObject(values)) {
      const key = Object.values(values).find(value => typeof value === 'string' && value.startsWith('sb_publishable_'));
      if (typeof key === 'string') return key;
    }
  } catch { /* Opaque configuration failure. */ }
  throw new WorkerError('backend_not_configured', 503);
}

export async function authenticateWorkspace(req: Request, orgId: string) {
  if (req.signal.aborted) throw new WorkerError('request_cancelled', 499);
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new WorkerError('invalid_request', 415);
  const bearer = req.headers.get('authorization');
  if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer)) throw new WorkerError('forbidden', 401);
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  if (!url) throw new WorkerError('backend_not_configured', 503);
  const client = createClient(url, publicWorkspaceKey(), {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id || data.user.role === 'service_role') throw new WorkerError('forbidden', 401);
  if (req.signal.aborted) throw new WorkerError('request_cancelled', 499);
  try {
    const access = await resolveWorkerAccess(client, data.user.id, orgId);
    const { data: eligible, error: eligibleError } = await client.rpc('ai_workers_can_access', { _org_id: orgId });
    if (eligibleError || eligible !== true) throw new WorkerError('forbidden', 403);
    if (req.signal.aborted) throw new WorkerError('request_cancelled', 499);
    return { client, userId: data.user.id, access };
  } catch (failure) {
    if (failure instanceof WorkerError) throw failure;
    throw new WorkerError('forbidden', 403);
  }
}

/** Phase 2/3 objects not yet in the database: degrade instead of failing with 5xx. */
export function isMissingWorkspaceObject(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', '42883', 'PGRST202', 'PGRST205', '3F000'].includes(error.code ?? '');
}

export function workspaceDatabaseError(error: { code?: string; message?: string }): WorkerError {
  const message = error.message ?? '';
  if (isMissingWorkspaceObject(error)) return new WorkerError('feature_unavailable', 503);
  if (error.code === '42501' || /FORBIDDEN|PERMISSION_DENIED/.test(message)) return new WorkerError('forbidden', 403);
  if (error.code === '54000' || message.includes('RATE_LIMITED')) return new WorkerError('rate_limited', 429);
  if (message.includes('SENSITIVE_TEXT')) return new WorkerError('sensitive_text', 400);
  if (message.includes('MANUAL_REQUIRED')) return new WorkerError('manual_input_required', 400);
  if (message.includes('IDEMPOTENCY_MISMATCH')) return new WorkerError('idempotency_mismatch', 409);
  if (message.includes('EXPIRED')) return new WorkerError('proposal_expired', 409);
  if (message.includes('STALE') || message.includes('SNAPSHOT_CHANGED') || message.includes('VERSION_CONFLICT') || error.code === '40001' || error.code === '55000') return new WorkerError('version_conflict', 409);
  if (error.code === '55P03' || error.code === '40P01' || error.code === '57014') return new WorkerError('resource_busy', 409);
  if (error.code?.startsWith('22') || message.includes('INVALID_REQUEST') || message.includes('NOT_ALLOWED')) return new WorkerError('invalid_request', 400);
  return new WorkerError('storage_unavailable', 503);
}

export async function workspaceRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw workspaceDatabaseError(error);
  return data;
}

export function workspaceResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...workspaceHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const messages: Record<string, string> = {
  forbidden: 'Você não tem acesso a esta operação.', invalid_request: 'Revise os dados da solicitação.',
  invalid_json: 'Revise os dados da solicitação.', request_too_large: 'A solicitação excedeu o tamanho permitido.',
  sensitive_text: 'Remova dados pessoais, segredos e links externos do texto operacional.',
  manual_input_required: 'Preencha os dados privados antes de confirmar.',
  version_conflict: 'A proposta ou o registro mudou. Atualize antes de confirmar.',
  idempotency_mismatch: 'Esta solicitação já foi usada com outros dados.', proposal_expired: 'A proposta expirou.',
  resource_busy: 'O registro está em uso. Tente novamente com a mesma proposta.', rate_limited: 'Limite de solicitações atingido. Aguarde um momento.',
  request_cancelled: 'Solicitação interrompida.', method_not_allowed: 'Método indisponível.',
  storage_unavailable: 'Não foi possível acessar o serviço.', backend_not_configured: 'O serviço ainda não está disponível.',
  feature_unavailable: 'Ações e rotinas da Equipe ainda não estão ativas. A conversa continua funcionando.',
};

export function workspaceError(error: unknown): Response {
  const code = error instanceof WorkerError && error.code in messages ? error.code : 'storage_unavailable';
  const status = error instanceof WorkerError ? Math.max(400, Math.min(error.status, 599)) : 503;
  return workspaceResponse({ error: { code, message: messages[code] } }, status);
}
