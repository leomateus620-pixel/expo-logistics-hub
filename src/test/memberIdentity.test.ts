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
    expect(getPersonPhoto('Leonardo Chitolina')).not.toBe(leonardo);
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

  it('resolve as 8 novas lideranças por nome e por user_id sem colisão', () => {
    const chitolina = getPersonPhoto('Leonardo Chitolina');
    const dambroz = getPersonPhoto('Cap. Leonardo Ruy Dambroz');
    expect(chitolina).toBeTruthy();
    expect(chitolina).not.toBe(dambroz);

    expect(getPersonPhoto('Daniel U. Ribeiro da Silva')).toBeTruthy();
    expect(getPersonPhoto('DANIEL DALLALBA')).toBeNull();
    expect(getPersonPhoto('Rosa Zorzan de Paula')).toBeTruthy();
    expect(getPersonPhoto('VLADIMIR ANTÔNIO MADALOSSO DA ROSA')).toBeNull();
    expect(getPersonPhoto('Marcos Eduardo Servat')).toBeTruthy();
    expect(getPersonPhoto('CARLA FREISLEBEN SERVAT')).toBeNull();
    expect(getPersonPhoto('Josyane Cristina Heck')).toBeTruthy();
    expect(getPersonPhoto('Germano Tessmer Büttow')).toBeTruthy();
    expect(getPersonPhoto('Dário Júnior da Motta Germano')).toBeTruthy();
    expect(getPersonPhoto('Cléo Antonio Rockenbach')).toBeTruthy();

    // Registros legados resolvem pelo user_id
    expect(getPersonPhoto(null, 'd3bd4c52-4ba9-4d64-bf45-3b43206fb9f4')).toBe(
      getPersonPhoto(null, 'b431453a-322c-4f2f-b962-bc5d6f508ec1'),
    );
    expect(getPersonPhoto(null, '7e7b9e5f-d232-4090-a882-ed00d6b604ea')).toBe(
      getPersonPhoto(null, 'f9ed4ab9-0ef3-4ee4-9707-36288dbc828f'),
    );
  });
});
