import { describe, expect, it } from 'vitest';
import { officialMemberLabel, resolveOfficialMembers } from '@/lib/memberIdentity';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';

describe('identidade organizacional oficial', () => {
  it('prioriza o registro oficial e ativo por user_id, não pelo texto do nome', () => {
    const resolved = resolveOfficialMembers([
      { user_id: 'fabiano', nome_exibicao: 'Soltis', is_active: true, is_core_team: false },
      { user_id: 'fabiano', nome_exibicao: 'Fabiano Soltis', is_active: true, is_core_team: true },
      { user_id: 'djeison', nome_exibicao: 'Djeison Drey', is_active: true, is_core_team: true },
    ]);

    expect(officialMemberLabel(resolved.get('fabiano'))).toBe('Fabiano Soltis');
    expect(officialMemberLabel(resolved.get('djeison'))).toBe('Djeison Drey');
  });

  it('resolve as fotos pelo user_id mesmo diante de um nome legado incorreto', () => {
    const fabiano = getPersonPhoto('Soltis', 'b8fd1e36-b46c-4eff-bb75-372b676ce123');
    const djeison = getPersonPhoto('Fabiano Soltis', 'e0ada2e5-4440-4d15-91bd-aa4160247113');
    expect(fabiano).toBeTruthy();
    expect(djeison).toBeTruthy();
    expect(fabiano).not.toBe(djeison);
  });
});
describe('retratos oficiais das comissões', () => {
  it('resolve as novas fotos por nome e por user_id sem colisão entre homônimos', () => {
    const leonardo = getPersonPhoto('Cap. Leonardo Ruy Dambroz');
    expect(leonardo).toBeTruthy();
    expect(getPersonPhoto('Leonardo Chitolina')).toBeNull();
    expect(getPersonPhoto('LEONARDO MATEUS STROSCHEIN')).toBeNull();

    const fernanda = getPersonPhoto('Fernanda Matarucco Meinertz');
    expect(fernanda).toBeTruthy();
    expect(getPersonPhoto('FERNANDA SECKLER EICH')).toBeNull();
    expect(fernanda).not.toBe(leonardo);

    expect(getPersonPhoto('EDUARDO SANTOS')).toBeTruthy();
    expect(getPersonPhoto('Eduardo Kretschmer')).toBeNull();
    expect(getPersonPhoto(null, 'fae623bc-2149-47c9-a59b-1899f406227c')).toBeTruthy();
    expect(getPersonPhoto(null, '8dce325e-91b4-4ed5-ba7d-c52cecac1c29')).toBeTruthy();
  });
});
