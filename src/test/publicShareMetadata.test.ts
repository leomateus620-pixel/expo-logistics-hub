import { beforeEach, describe, expect, it } from 'vitest';
import { applyPublicShareMetadata, publicShareMetadata } from '@/features/commercial-map/public/publicShareMetadata';
import { PUBLIC_MAP_AREAS } from '@/features/commercial-map/public/publicAreaRegistry';

describe('prévia dos links públicos', () => {
  it('tem imagem horizontal específica e nome correto para todas as áreas', () => {
    const images = PUBLIC_MAP_AREAS.map(area => {
      const metadata = publicShareMetadata(area.slug, true);
      expect(metadata.title).toContain(area.name);
      expect(metadata.description).toContain(area.name);
      expect(metadata.image).toMatch(/^https:\/\/mapafenasoja\.com\/__l5e\/assets-v1\//);
      return metadata.image;
    });
    expect(new Set(images).size).toBe(PUBLIC_MAP_AREAS.length);
  });

  it('não publica a identidade de escopo não validado', () => {
    expect(publicShareMetadata('pavilhao-1', false).title).not.toContain('Pavilhão');
    expect(publicShareMetadata('pavilhao-1', false).image).toBeNull();
    expect(publicShareMetadata('inexistente', true).image).toBeNull();
  });

  beforeEach(() => { document.head.innerHTML = '<meta property="og:image" content="old"><meta property="og:image" content="duplicate">'; });
  it('substitui a imagem antiga sem duplicações e limpa a prévia após invalidação', () => {
    applyPublicShareMetadata('pavilhao-1', true, 'https://mapafenasoja.com/areas/pavilhao-1/opaque');
    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain('Pavilhão 1');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toContain('/opaque');
    applyPublicShareMetadata('pavilhao-1', false, 'https://mapafenasoja.com/areas/pavilhao-1/opaque');
    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(0);
    expect(document.querySelectorAll('meta[property="og:url"]')).toHaveLength(0);
    expect(document.title).not.toContain('Pavilhão 1');
  });
});