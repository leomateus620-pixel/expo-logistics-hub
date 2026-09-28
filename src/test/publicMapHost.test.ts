import { describe, expect, it } from 'vitest';
import { isPublicAreaPath, isPublicMapHost, legacyPublicLinkRedirect } from '@/features/commercial-map/public/publicMapHost';
import { publicMapOrigin } from '@/features/commercial-map/public/publicAreaRegistry';

const loc = (hostname: string, pathname: string, search = '', hash = '') => ({ hostname, pathname, search, hash });

describe('domínio dedicado dos links públicos', () => {
  it('reconhece somente mapafenasoja.com como domínio público', () => {
    expect(isPublicMapHost('mapafenasoja.com')).toBe(true);
    expect(isPublicMapHost('www.mapafenasoja.com')).toBe(true);
    expect(isPublicMapHost('fenasojagestao.com')).toBe(false);
  });

  it('gera links oficiais em mapafenasoja.com fora de preview', () => {
    expect(publicMapOrigin('fenasojagestao.com')).toBe('https://mapafenasoja.com');
    expect(publicMapOrigin('www.fenasojagestao.com')).toBe('https://mapafenasoja.com');
  });

  it('redireciona links antigos do domínio interno preservando caminho', () => {
    expect(legacyPublicLinkRedirect(loc('fenasojagestao.com', '/areas/pavilhao-1/tok', '?a=1')))
      .toBe('https://mapafenasoja.com/areas/pavilhao-1/tok?a=1');
    expect(legacyPublicLinkRedirect(loc('www.fenasojagestao.com', '/areas/exporural/tok'))).toContain('mapafenasoja.com/areas/exporural/tok');
    expect(legacyPublicLinkRedirect(loc('fenasojagestao.com', '/mapa-comercial'))).toBeNull();
    expect(legacyPublicLinkRedirect(loc('mapafenasoja.com', '/areas/exporural/tok'))).toBeNull();
    expect(legacyPublicLinkRedirect(loc('localhost', '/areas/exporural/tok'))).toBeNull();
  });

  it('valida o formato de caminho público', () => {
    expect(isPublicAreaPath('/areas/pavilhao-7/abc')).toBe(true);
    expect(isPublicAreaPath('/login/admin')).toBe(false);
  });
});

import { resolveCanonicalRedirect } from '@/features/commercial-map/public/publicMapHost';

describe('endereço canônico de todo o sistema', () => {
  const r = (h: string, p: string, s = '', hash = '') => resolveCanonicalRedirect({ hostname: h, pathname: p, search: s, hash });
  it('aplica a tabela de domínios', () => {
    expect(r('fenasoja-gestao.lovable.app', '/login/admin', '?x=1', '#a')).toBe('https://fenasojagestao.com/login/admin?x=1#a');
    expect(r('www.fenasojagestao.com', '/mapa-comercial')).toBe('https://fenasojagestao.com/mapa-comercial');
    expect(r('fenasojagestao.com', '/areas/exporural/t')).toBe('https://mapafenasoja.com/areas/exporural/t');
    expect(r('fenasoja-gestao.lovable.app', '/areas/pavilhao-1/t')).toBe('https://mapafenasoja.com/areas/pavilhao-1/t');
    expect(r('www.mapafenasoja.com', '/areas/pavilhao-1/t')).toBe('https://mapafenasoja.com/areas/pavilhao-1/t');
    expect(r('mapafenasoja.com', '/areas/pavilhao-1/t')).toBeNull();
    expect(r('fenasojagestao.com', '/')).toBeNull();
  });
  it('preview e localhost não redirecionam', () => {
    expect(r('id-preview--abc.lovable.app', '/')).toBeNull();
    expect(r('localhost', '/areas/exporural/t')).toBeNull();
  });
});
