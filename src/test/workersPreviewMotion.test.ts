import { afterEach, describe, expect, it, vi } from 'vitest';
import { configurePreviewMotion } from '../../scripts/workers/preview-motion';

afterEach(() => {
  delete document.documentElement.dataset.workersPreviewMotion;
  document.querySelectorAll('style[data-workers-preview-motion]').forEach(style => style.remove());
});

function surface(hostname = '127.0.0.1') {
  const matchMedia = vi.fn((query: string): MediaQueryList => ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }));
  return { location: { hostname }, document, matchMedia };
}

describe('isolamento da preferência de movimento da prévia', () => {
  it('preserva a preferência real sem a opção explícita', () => {
    const target = surface(); const original = target.matchMedia;
    expect(configurePreviewMotion(target, new URLSearchParams('theme=dark'))).toBe('system');
    expect(target.matchMedia).toBe(original);
    expect(target.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    expect(document.querySelector('style[data-workers-preview-motion]')).toBeNull();
  });
  it('simula somente reduced motion e restringe o CSS aos pontos ativos da fixture', () => {
    const target = surface(); const original = target.matchMedia;
    expect(configurePreviewMotion(target, new URLSearchParams('motion=full'))).toBe('full');
    expect(target.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(target.matchMedia('(min-width: 1024px)').matches).toBe(true);
    expect(original).toHaveBeenCalledExactlyOnceWith('(min-width: 1024px)');
    expect(document.documentElement).toHaveAttribute('data-workers-preview-motion', 'full');
    const css = document.querySelector('style[data-workers-preview-motion]')?.textContent;
    expect(css).toContain('html[data-workers-preview-motion="full"]');
    expect(css).toContain(':has(.worker-mascot[data-active="true"])');
    expect(css).toContain('worker-response-dot 1.5s');
    expect(css).not.toContain('transition:');
  });
  it('recusa a simulação fora de loopback sem alterar o ambiente', () => {
    const target = surface('example.com'); const original = target.matchMedia;
    expect(() => configurePreviewMotion(target, new URLSearchParams('motion=full'))).toThrow('Motion fixture requires loopback.');
    expect(target.matchMedia).toBe(original);
    expect(document.querySelector('style[data-workers-preview-motion]')).toBeNull();
  });
});
