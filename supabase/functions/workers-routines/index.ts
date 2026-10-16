import { executeWorkerTool, listWorkerTools } from '../_shared/workers/generated/read-tools.js';
import { workspaceCommandSchema } from '../_shared/workers/workspace-contracts.ts';
import { handleWorkspaceCommand } from '../_shared/workers/routines.ts';
import { authenticateWorkspace, workspaceError, workspaceHeaders, workspaceResponse, workspaceRpc } from '../_shared/workers/workspace-http.ts';
import { WorkerError } from '../_shared/workers/contracts.ts';
import { readBoundedJson } from '../_shared/workers/provider.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: workspaceHeaders });
  if (req.method !== 'POST') return workspaceError(new WorkerError('method_not_allowed', 405));
  const abort = new AbortController();
  const cancel = () => abort.abort();
  req.signal.addEventListener('abort', cancel, { once: true });
  if (req.signal.aborted) cancel();
  const timeout = setTimeout(cancel, 45000);
  try {
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new WorkerError('invalid_request', 415);
    const bearer = req.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer)) throw new WorkerError('forbidden', 401);
    const parsed = workspaceCommandSchema.safeParse(await readBoundedJson(req, 16000));
    if (!parsed.success) throw new WorkerError('invalid_request');
    const { client, access } = await authenticateWorkspace(req, parsed.data.orgId);
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    return workspaceResponse(await handleWorkspaceCommand(parsed.data, {
      rpc: (name, args) => workspaceRpc(client, name, args),
      listTools: worker => listWorkerTools(worker, access),
      executeTool: (name, input) => executeWorkerTool(name, input, access),
      signal: abort.signal,
    }));
  } catch (error) { return workspaceError(error); }
  finally { clearTimeout(timeout); req.signal.removeEventListener('abort', cancel); }
});
