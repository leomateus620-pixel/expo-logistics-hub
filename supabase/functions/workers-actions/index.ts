import { actionCommandSchema } from '../_shared/workers/workspace-contracts.ts';
import { executeActionCommand } from '../_shared/workers/action-tools.ts';
import { WorkerError } from '../_shared/workers/contracts.ts';
import { readBoundedJson } from '../_shared/workers/provider.ts';
import { authenticateWorkspace, workspaceError, workspaceHeaders, workspaceResponse } from '../_shared/workers/workspace-http.ts';

export async function handleWorkersActions(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: workspaceHeaders });
  try {
    if (req.method !== 'POST') throw new WorkerError('method_not_allowed', 405);
    if (req.signal.aborted) throw new WorkerError('request_cancelled', 499);
    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new WorkerError('invalid_request', 415);
    const bearer = req.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer)) throw new WorkerError('forbidden', 401);
    const parsed = actionCommandSchema.safeParse(await readBoundedJson(req, 16000));
    if (!parsed.success) throw new WorkerError('invalid_request');
    const { client } = await authenticateWorkspace(req, parsed.data.orgId);
    if (req.signal.aborted) throw new WorkerError('request_cancelled', 499);
    return workspaceResponse(await executeActionCommand(client, parsed.data));
  } catch (error) { return workspaceError(error); }
}

if (import.meta.main) Deno.serve(handleWorkersActions);
