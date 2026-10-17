import { isObject, WorkerError } from './contracts.ts';

// Bundled copy of src/lib/workers/auth-failure.ts (edge bundles only include supabase/functions); kept identical by src/test/workersAuthFailureCopy.test.ts.
export { workerAuthFailureCode } from './auth-failure.ts';

/** Settle immediately on cancellation even when a reader does not honor abort.
 * Its eventual rejection remains observed; no late result escapes this race. */
export function raceWorkerSignal<T>(operation: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  const interrupted = () => signal.reason instanceof WorkerError ? signal.reason : new WorkerError('request_cancelled', 499);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(interrupted()); return; }
    let settled = false;
    const settle = (success: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (success) resolve(value as T); else reject(value);
    };
    const onAbort = () => settle(false, interrupted());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw interrupted();
      return operation();
    }).then(value => settle(true, value), error => settle(false, error));
  });
}

/** Failure persistence gets its own short budget after the main signal expires. */
export async function boundedWorkerCleanup<T>(operation: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 3000): Promise<T> {
  const cleanup = new AbortController();
  const timer = setTimeout(() => cleanup.abort(new WorkerError('timeout', 504, { stage: 'failure_cleanup' })), timeoutMs);
  try { return await raceWorkerSignal(() => operation(cleanup.signal), cleanup.signal); }
  finally { clearTimeout(timer); }
}

const registryCodes: Record<string, string> = {
  AUTH_REQUIRED: 'forbidden', PERMISSION_DENIED: 'forbidden', TOOL_NOT_ALLOWED: 'tool_not_allowed',
  INVALID_INPUT: 'invalid_tool_arguments', NOT_FOUND: 'not_found', DATA_UNAVAILABLE: 'query_failed',
  RPC_INCOMPATIBLE: 'rpc_incompatible', SQL_ERROR: 'sql_error', TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error', INVALID_RESPONSE: 'invalid_response',
};
const messages: Record<string, string> = {
  forbidden: 'Seu usuário não tem acesso a esta consulta.',
  network_error: 'A conexão falhou. Confira sua internet e tente novamente.',
  timeout: 'A consulta demorou além do esperado. Tente novamente.',
  rpc_incompatible: 'Esta consulta precisa de uma atualização do sistema. Consulte o módulo enquanto ela é corrigida.',
  sql_error: 'O sistema encontrou uma falha ao consultar os dados. Consulte o módulo enquanto ela é corrigida.',
  invalid_response: 'O resultado não pôde ser validado. Consulte os dados no módulo.',
  ambiguous_identity: 'Encontrei mais de uma identidade. Escolha a pessoa ou comissão para continuar.',
  query_failed: 'Não consegui concluir esta consulta. Consulte o módulo ou tente novamente mais tarde.',
  request_failed: 'Não consegui concluir esta consulta. Consulte o módulo ou tente novamente mais tarde.',
  request_cancelled: 'Consulta interrompida.',
  not_found: 'Nenhum resultado foi encontrado no recorte autorizado. Confira os filtros.',
  invalid_tool_arguments: 'Não consegui identificar os filtros ou o registro. Detalhe seu pedido.',
  invalid_request: 'Confira a mensagem e tente novamente.',
  request_in_progress: 'Este pedido já está em andamento ou falhou. Consulte o histórico.',
  rate_limited: 'Você atingiu o limite temporário de consultas. Aguarde antes de tentar novamente.',
  provider_rate_limited: 'A IA atingiu o limite temporário. Tente novamente mais tarde.',
  provider_not_configured: 'A consulta está temporariamente indisponível. Tente novamente mais tarde.',
  provider_credits_required: 'A consulta está temporariamente indisponível. Tente novamente mais tarde.',
  web_search_not_configured: 'A pesquisa pública está temporariamente indisponível. Consulte o portal oficial da Fenasoja.',
  institutional_source_unavailable: 'Não consegui verificar a publicação institucional agora. Consulte o portal oficial da Fenasoja.',
};

export function publicWorkerError(error: unknown): { code: string; message: string; retryable: boolean } {
  let code = error instanceof WorkerError ? error.code
    : isObject(error) && typeof error.code === 'string' ? registryCodes[error.code] ?? 'request_failed'
    : error instanceof TypeError && /fetch failed|failed to fetch|network/i.test(error.message) ? 'network_error' : 'request_failed';
  if (['invalid_response_contract', 'invalid_tool_result', 'invalid_storage_response', 'invalid_citations', 'result_too_large', 'missing_evidence', 'incomplete_aggregate', 'scope_mismatch'].includes(code)) code = 'invalid_response';
  if (code === 'data_unavailable' || code === 'storage_unavailable') code = 'query_failed';
  if (!messages[code]) code = 'request_failed';
  return { code, message: messages[code], retryable: ['network_error', 'timeout', 'query_failed', 'request_failed', 'provider_rate_limited', 'rate_limited'].includes(code) };
}

/** Restricted diagnostic: no error message/stack, SQL, filters, token or user content. */
export function workerFailureDiagnostic(error: unknown, requestId?: string) {
  const diagnostic = isObject(error) && isObject(error.diagnostic) ? error.diagnostic : {};
  const safeCode = typeof diagnostic.technicalCode === 'string' && /^[A-Z0-9_]{1,40}$/i.test(diagnostic.technicalCode) ? diagnostic.technicalCode : undefined;
  const code = publicWorkerError(error).code;
  return { event: 'workers_query_failed', requestId,
    code,
    stage: typeof diagnostic.stage === 'string' && /^[a-z_]{1,40}$/.test(diagnostic.stage) ? diagnostic.stage
      : code === 'invalid_response' ? 'validation' : code === 'forbidden' ? 'authorization' : 'orchestration',
    technicalCode: safeCode };
}
