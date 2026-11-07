import { describe, expect, it } from 'vitest';
import { readEcosystemLocation, writeEcosystemLocation } from './ecosystemNavigation';

describe('Ecosystem internal links', () => {
  it('keeps the pathname, unrelated query and hash through the complete memorial flow', () => {
    const url = new URL('https://example.test/portal?campanha=2028#origem');
    for (const target of [
      { view: 'organization' as const }, { view: 'memorial' as const },
      { view: 'memorial' as const, pieceId: 'fenasoja-2022' },
      { view: 'memorial' as const, pieceId: 'fenasoja-2022', document: true },
      { view: 'memorial' as const }, { view: 'organization' as const }, null,
    ]) {
      url.search = writeEcosystemLocation(url.searchParams,target).toString();
      expect(url.pathname).toBe('/portal'); expect(url.hash).toBe('#origem');
      expect(url.searchParams.get('campanha')).toBe('2028');
      expect(readEcosystemLocation(url.searchParams)?.view ?? null).toBe(target?.view ?? null);
    }
    expect(url.searchParams.toString()).toBe('campanha=2028');
  });
  it('only associates the 2020 document with edition 23 in 2022', () => {
    expect(readEcosystemLocation(new URLSearchParams('ecossistema=memorial&edicao=fenasoja-2022&documento=2020'))?.document).toBe(true);
    expect(readEcosystemLocation(new URLSearchParams('ecossistema=memorial&edicao=fenasoja-2024&documento=2020'))?.document).toBe(false);
    expect(readEcosystemLocation(new URLSearchParams('ecossistema=unknown'))).toBeNull();
  });
});
