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
  ['texto principal no navy', '#F8FAFC', '#061D3D'],
  ['texto secundário no card', '#C6D2E0', '#082241'],
  ['texto sutil no agrupador', '#AEBDD0', '#041832'],
  ['texto escuro na ação laranja', '#071A34', '#FF8A24'],
  ['nome da frente ativa', '#082541', '#F2F5F1'],
  ['metadado da frente ativa', '#53697F', '#F2F5F1'],
  ['estado ativo', '#07533E', '#D9F8EC'],
  ['estado em estruturação', '#684000', '#FFF0BD'],
  ['estado restrito', '#861D25', '#FFE4E6'],
  ['aviso sensível', '#7D2028', '#FFE8E9'],
] as const;

const graphicalPairs = [
  ['foco dourado no navy', '#FFD35C', '#061D3D'],
  ['foco navy no card claro', '#082541', '#FFFDF7'],
  ['ícone amber no card escuro', '#FCD34D', '#102946'],
  ['ícone lime no card escuro', '#BEF264', '#102946'],
  ['ícone cyan no card escuro', '#67E8F9', '#102946'],
  ['ícone rose no card escuro', '#FDA4AF', '#102946'],
  ['ícone sky no card escuro', '#7DD3FC', '#102946'],
  ['ícone red no card escuro', '#FCA5A5', '#102946'],
  ['ícone teal no card escuro', '#5EEAD4', '#102946'],
  ['ícone gold no card escuro', '#FDE047', '#102946'],
] as const;

describe('acessibilidade visual do portal de comissões', () => {
  it.each(normalTextPairs)('%s alcança WCAG AA para texto normal', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicalPairs)('%s alcança contraste não textual de 3:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('preserva movimento reduzido, alto contraste, transparência reduzida e áreas seguras', () => {
    expect(portalStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(portalStyles).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(portalStyles).toContain('@media (forced-colors: active)');
    expect(portalStyles).toContain('env(safe-area-inset-top)');
    expect(portalStyles).toContain('env(safe-area-inset-bottom)');
    expect(portalStyles).toContain('.commission-access-card__toggle:focus-visible');
  });

  it('entrega somente o recorte fotográfico adequado e mantém os assets leves', () => {
    expect(portalPage).toContain('(max-width: 900px) and (orientation: portrait)');

    for (const asset of [
      'public/portal/soybean-atmosphere-landscape.jpg',
      'public/portal/soybean-atmosphere-portrait.jpg',
    ]) {
      expect(statSync(resolve(asset)).size).toBeLessThan(200_000);
    }
  });
});
