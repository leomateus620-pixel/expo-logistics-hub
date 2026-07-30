import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const portalStyles = readFileSync(resolve('src/styles/commission-portal.css'), 'utf8');
const portalPage = readFileSync(resolve('src/pages/commissions/CommissionPortalPage.tsx'), 'utf8');

function hexToRgb(hex: string): [number, number, number] {
  const channels = hex.replace('#', '').match(/.{2}/g);
  if (!channels || channels.length !== 3) throw new Error(`Cor hexadecimal inválida: ${hex}`);
  return channels.map((channel) => Number.parseInt(channel, 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const normalTextPairs = [
  ['texto principal no navy', '#F8FAFC', '#041832'],
  ['texto secundário no card', '#C6D2E0', '#041832'],
  ['texto sutil no agrupador', '#9EB0C5', '#041832'],
  ['destaque dourado', '#FFD35C', '#041832'],
  ['texto do card Gestão Operacional', '#FFF5CF', '#03162F'],
  ['estado permitido', '#A7F3D0', '#08294D'],
  ['estado em estruturação', '#FFE69A', '#08294D'],
  ['estado sem permissão', '#FECACA', '#041832'],
] as const;

const graphicalPairs = [
  ['foco dourado no navy', '#FFD35C', '#041832'],
  ['ícone azul no navy', '#68A5FF', '#041832'],
  ['ícone teal no navy', '#5EEAD4', '#041832'],
  ['ícone âmbar no navy', '#FDE68A', '#08294D'],
  ['ícone red no navy', '#FCA5A5', '#08294D'],
] as const;

describe('acessibilidade visual do hub Fenasoja', () => {
  it.each(normalTextPairs)('%s alcança WCAG AA para texto normal', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicalPairs)('%s alcança contraste não textual de 3:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('preserva movimento reduzido, alto contraste, transparência reduzida e áreas seguras', () => {
    expect(portalStyles).toContain('animation: portal-reveal 250ms both');
    expect(portalStyles).toContain('transition: grid-template-rows 230ms');
    expect(portalStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(portalStyles).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(portalStyles).toContain('@media (forced-colors: active)');
    expect(portalStyles).toContain('env(safe-area-inset-top)');
    expect(portalStyles).toContain('env(safe-area-inset-bottom)');
    expect(portalStyles).toContain('.portal-primary-entry__control:focus-visible');
    expect(portalStyles).toContain('.portal-destination-card:focus-visible');
    expect(portalStyles).toContain('.commission-access-card:focus-visible');
  });

  it('entrega AVIF, WebP e fallback responsivos com payload controlado', () => {
    expect(portalPage).toContain('(max-width: 900px) and (orientation: portrait)');
    expect(portalPage).toContain('type="image/avif"');
    expect(portalPage).toContain('type="image/webp"');

    for (const asset of [
      'public/portal/soybean-atmosphere-2028-landscape.avif',
      'public/portal/soybean-atmosphere-2028-landscape.webp',
      'public/portal/soybean-atmosphere-2028-landscape.jpg',
      'public/portal/soybean-atmosphere-2028-portrait.avif',
      'public/portal/soybean-atmosphere-2028-portrait.webp',
      'public/portal/soybean-atmosphere-2028-portrait.jpg',
    ]) {
      expect(statSync(resolve(asset)).size).toBeLessThan(200_000);
    }
  });
});
