import { describe, expect, it } from 'vitest';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';
import { optimizedPortraitUrl } from './optimizedPortrait';

describe('organizational portrait presentation', () => {
  it('preserves the corrected president and vice-president identities', () => {
    expect(optimizedPortraitUrl(getPersonPhoto('Fabiano Soltis'))).toBe('/alvorada/portraits/person-djeison-drey.webp');
    expect(optimizedPortraitUrl(getPersonPhoto('Djeison Drey'))).toBe('/alvorada/portraits/person-fabiano-soltis.webp');
  });

  it('optimizes only registered exact paths and their trusted absolute URLs', () => {
    const source = getPersonPhoto('Felipe Bortoli');
    expect(optimizedPortraitUrl(source)).toBe('/alvorada/portraits/person-felipe-bortoli.webp');
    expect(optimizedPortraitUrl(`https://fenasojagestao.com${source}`)).toBe('/alvorada/portraits/person-felipe-bortoli.webp');
    expect(optimizedPortraitUrl(`https://another.example${source}`)).toBe(`https://another.example${source}`);
    expect(optimizedPortraitUrl(`${source}?updated=1`)).toBe(`${source}?updated=1`);
  });

  it('leaves user uploads, unrelated paths and missing avatars unchanged', () => {
    const uploaded = 'https://storage.example/avatars/person-felipe-bortoli.png';
    expect(optimizedPortraitUrl(uploaded)).toBe(uploaded);
    expect(optimizedPortraitUrl('/other/person-felipe-bortoli.png')).toBe('/other/person-felipe-bortoli.png');
    expect(optimizedPortraitUrl(null)).toBeUndefined();
  });
});
