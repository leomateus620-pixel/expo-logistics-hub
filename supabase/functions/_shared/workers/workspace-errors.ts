/** Phase 2/3 objects not yet in the database: degrade instead of failing with 5xx. */
export function isMissingWorkspaceObject(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42P01', '42883', 'PGRST202', 'PGRST205', '3F000'].includes(error.code ?? '');
}
