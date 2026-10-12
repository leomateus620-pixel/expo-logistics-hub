import { describe, expect, it } from 'vitest';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';
import { optimizedPortraitUrl } from '@/features/alvorada/organizational/optimizedPortrait';
import { buildOrganizationalGraph } from '@/features/alvorada/organizational';

describe('retratos originais de Diana e Roberto', () => {
  const people = [
    { id: 'd2966417-dc6b-405d-813d-682a780c33c5', name: 'Diana Schmidt Nedel', suffix: 'person-diana-schmidt-nedel.png' },
    { id: 'e639a24f-e68d-48ab-a76e-1763b966b3ed', name: 'Roberto Adriano Racho', suffix: 'person-roberto-racho.jpeg' },
  ];

  it.each(people)('resolve $name por identidade e mantém o original no Ecossistema', ({ id, name, suffix }) => {
    const photo = getPersonPhoto(null, id);
    expect(photo).toContain(suffix);
    expect(getPersonPhoto(name)).toBe(photo);
    expect(getPersonPhoto('Nome legado', id)).toBe(photo);
    expect(optimizedPortraitUrl(photo)).toBe(photo);
    const graph = buildOrganizationalGraph({ members: [], units: [{
      id: 'existing-unit', name: 'Comissão existente', slug: 'existing', type: 'comissao',
      displayOrder: 1, isOfficial: true, isLegacy: false,
      responsibles: [{ id: 'existing-link', displayName: name, userId: id,
        responsibleType: 'pessoa', relationshipRole: 'principal', isPrimary: true }],
    }] });
    expect(graph.people[`person:user:${id}`]?.avatarUrl).toBe(photo);
  });

  it('reconhece Roberto Racho sem confundir pessoas de nome semelhante', () => {
    expect(getPersonPhoto('Roberto Racho')).toBe(getPersonPhoto('Roberto Adriano Racho'));
    expect(getPersonPhoto('Roberto Racho')).not.toBe(getPersonPhoto('Roberto Steffen'));
    expect(getPersonPhoto('Roberto Racho')).not.toBe(getPersonPhoto('Milton Racho'));
    expect(getPersonPhoto('Diana Schmidt Nedel')).not.toBe(getPersonPhoto('Paulo Miguel Nedel'));
    expect(getPersonPhoto('Diana')).toBeNull();
    expect(getPersonPhoto('Roberto')).toBeNull();
  });
});