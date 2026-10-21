/** Separate inventory/pricing requests may straddle a committed migration.
 * Refuse that response so React Query retains its last coherent snapshot and
 * retries through the existing bounded transient policy. */
export function assertCommercialSnapshotRevision(before: unknown, after: unknown): void {
  if (typeof before === 'string' && typeof after === 'string' && before !== after) {
    throw Object.assign(new Error('A revisão comercial mudou durante a leitura. Atualizando os dados.'), {
      code: 'COMMERCIAL_SNAPSHOT_CHANGED', status: 503,
    });
  }
}
