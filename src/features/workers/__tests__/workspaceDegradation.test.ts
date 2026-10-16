import { describe, expect, it } from 'vitest';
import { isMissingWorkspaceObject, workspaceDatabaseError } from '../../../../supabase/functions/_shared/workers/workspace-http';

describe('Equipe Fenasoja sem tabelas das fases 2/3', () => {
  it('tabela ou função ausente vira feature_unavailable, não erro genérico', () => {
    for (const code of ['42P01', '42883', 'PGRST202', 'PGRST205']) {
      expect(isMissingWorkspaceObject({ code })).toBe(true);
      expect(workspaceDatabaseError({ code }).code).toBe('feature_unavailable');
    }
  });
  it('permissão negada continua 403', () => {
    expect(workspaceDatabaseError({ code: '42501' }).status).toBe(403);
  });
});
