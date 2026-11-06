import { describe, expect, it } from 'vitest';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';

describe('Soja Store portraits', () => {
  it('resolves Carla by user id', () => {
    expect(getPersonPhoto(null, 'f0520c35-6ce5-470d-b7ce-d8bc62c45d2f')).toContain('person-carla-servat');
  });
  it.each([
    ['Carla Freisleben Servat', 'carla-servat'],
    ['Paola Johann Külzer', 'paola-kulzer'],
    ['Andressa Kunzler', 'andressa-kunzler'],
    ['Diovanna Lorenzato', 'diovana-lorenzato'],
    ['Fernanda Reis Rauber', 'fernanda-reis-rauber'],
    ['Alessandra Schaefer', 'alessandra-schaefer'],
    ['Tatiane Raquel Meinhart', 'tatiane-raquel-meinhart'],
    ['Lucas Tolazzi', 'lucas-tolazzi'],
  ])('resolves %s by name', (name, file) => {
    expect(getPersonPhoto(name)).toContain(`person-${file}`);
  });
});
