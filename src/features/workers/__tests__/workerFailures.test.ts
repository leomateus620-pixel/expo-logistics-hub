import { describe, expect, it } from 'vitest';
import { workerDataError } from '@/lib/workers/types';
import { publicWorkerError, workerFailureDiagnostic } from '../../../../supabase/functions/_shared/workers/failures';
import { WorkerError } from '../../../../supabase/functions/_shared/workers/contracts';

describe('Falhas de consulta com causa e correlação', () => {
  it.each([
    ['42501', 'forbidden', false], ['42703', 'rpc_incompatible', false], ['PGRST202', 'rpc_incompatible', false],
    ['57014', 'timeout', true], ['08006', 'network_error', true], ['23505', 'sql_error', false],
  ])('classifica %s sem transformar implementação em restrição', (code, expected, retryable) => {
    const failure = workerDataError({ code, message: 'SQL secreto token privado' });
    expect(publicWorkerError(failure)).toMatchObject({ code: expected, retryable });
    expect(JSON.stringify(publicWorkerError(failure))).not.toMatch(/SQL secreto|token privado/);
    expect(workerFailureDiagnostic(failure, 'req-1')).toEqual({ event: 'workers_query_failed', requestId: 'req-1', code: expected, stage: 'query', technicalCode: code });
  });
  it('distingue contrato inválido e cancelamento de uma falha transitória', () => {
    expect(publicWorkerError(new WorkerError('invalid_response_contract'))).toMatchObject({ code: 'invalid_response', retryable: false });
    expect(publicWorkerError(new WorkerError('request_cancelled'))).toMatchObject({ code: 'request_cancelled', retryable: false });
  });
  it('não vaza mensagem, stack ou códigos injetados em diagnóstico restrito', () => {
    const failure = workerDataError({ code: 'evil token:secret', message: 'dados privados' });
    expect(JSON.stringify(workerFailureDiagnostic(failure))).not.toMatch(/secret|privad/);
  });
});
