import { describe, expect, it } from 'vitest';
import { isMissingWorkspaceObject } from '../../../../supabase/functions/_shared/workers/workspace-errors';

describe('Equipe Fenasoja sem tabelas das fases 2/3', () => {
  it('tabela ou função ausente é reconhecida como recurso indisponível', () => {
    for (const code of ['42P01', '42883', 'PGRST202', 'PGRST205']) expect(isMissingWorkspaceObject({ code })).toBe(true);
  });
  it('permissão negada não é confundida com recurso ausente', () => {
    expect(isMissingWorkspaceObject({ code: '42501' })).toBe(false);
  });
});
