import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const portalStyles = readFileSync(resolve('src/styles/commission-portal.css'), 'utf8');
const accessNavigationStyles = readFileSync(resolve('src/styles/portal-access-navigation.css'), 'utf8');
const countdownStyles = readFileSync(resolve('src/styles/official-countdown-digits.css'), 'utf8');
const countdownDigits = readFileSync(resolve('src/components/countdown/OfficialCountdownDigits.tsx'), 'utf8');
const portalPage = readFileSync(resolve('src/pages/commissions/CommissionPortalPage.tsx'), 'utf8');
const portalWordmark = readFileSync(resolve('src/components/portal/FenasojaPortalWordmark.tsx'), 'utf8');
const primaryEntry = readFileSync(resolve('src/components/portal/PortalPrimaryEntry.tsx'), 'utf8');

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
  ['texto do card Gestão Operacional', '#FFF7D9', '#03142B'],
  ['estado permitido', '#A7F3D0', '#08294D'],
  ['estado em estruturação', '#FFE69A', '#08294D'],
  ['estado sem permissão', '#FECACA', '#041832'],
  ['título refinado no navy', '#FFFDF8', '#061D3D'],
  ['descrição principal refinada', '#C8D5E3', '#061D3D'],
  ['descrição de destino', '#C1D0DF', '#0A315B'],
  ['descrição de comissão', '#B8C8D8', '#061D3D'],
] as const;

const graphicalPairs = [
  ['foco dourado no navy', '#FFD35C', '#041832'],
  ['ícone azul no navy', '#68A5FF', '#041832'],
  ['ícone teal no navy', '#5EEAD4', '#041832'],
  ['ícone âmbar no navy', '#FDE68A', '#08294D'],
  ['ícone red no navy', '#FCA5A5', '#08294D'],
  ['identidade Agenda', '#F7CA52', '#061D3D'],
  ['identidade Mapa Comercial', '#4F91FF', '#041832'],
  ['identidade Comissões', '#39D8C4', '#041832'],
  ['identidade Financeiro', '#EDB84A', '#041832'],
  ['foco do access hub', '#FFE07A', '#041832'],
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
    expect(portalStyles).toContain('.portal-soybean__root-halo');
    expect(portalStyles).toContain('animation: portal-root-grow 900ms');
    expect(portalStyles).not.toContain('portal-root-node-breathe');
    expect(portalStyles).not.toContain('portal-root-scene-reveal');
    expect(portalWordmark).not.toMatch(/animateMotion|useReducedMotionPreference/);
  });

  it('mantém a camada premium escopada, sem transições genéricas ou hover em dispositivos touch', () => {
    expect(portalPage).toContain("import '@/styles/commission-portal.css';");
    expect(portalPage).toContain("import '@/styles/portal-access-navigation.css';");
    expect(accessNavigationStyles).toContain('--access-radius-parent');
    expect(accessNavigationStyles).toContain('--access-shadow-raised');
    expect(accessNavigationStyles).toContain('@media (hover: hover) and (pointer: fine)');
    expect(accessNavigationStyles).toContain('@media (prefers-contrast: more)');
    expect(accessNavigationStyles).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(accessNavigationStyles).toContain('@media (forced-colors: active)');
    expect(accessNavigationStyles).toContain('.portal-primary-entry__control:active');
    expect(accessNavigationStyles).toContain('outline-offset: -4px');
    expect(portalStyles).not.toMatch(/^\.portal-primary-entry__control:hover/m);
    expect(portalStyles).not.toMatch(/^\.portal-destination-card\[href\]:hover/m);
    expect(portalStyles).not.toMatch(/^\.commission-access-card\[href\]:hover/m);
    expect(accessNavigationStyles).not.toContain('transition: all');
  });

  it('preserva ordem visível no mobile e continuidade acessível da expansão', () => {
    expect(accessNavigationStyles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.portal-primary-entry__index \{[\s\S]*?display: flex/,
    );
    expect(primaryEntry).toContain('aria-expanded={expanded}');
    expect(primaryEntry).toContain('aria-controls={panelId}');
    expect(primaryEntry).toContain('aria-hidden={!expanded}');
    expect(primaryEntry).toContain("inert: ''");
    expect(portalPage).toContain('useLayoutEffect');
    expect(portalPage).toContain('window.requestAnimationFrame(stabilizeControl)');
    expect(portalPage).toContain("window.scrollBy({ top: offset, left: 0, behavior: 'auto' })");
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

  it('mantém o hero limpo com cinco raízes vetoriais e sem narrativa ilustrativa', () => {
    expect(portalWordmark.match(/^\s+'M560 8/gm)).toHaveLength(5);
    expect(portalWordmark).toContain('data-root-layer="halo"');
    expect(portalWordmark).toContain('data-root-layer="core"');
    expect(portalWordmark).toContain('portal-root-taper-mask');
    expect(portalWordmark).not.toMatch(/data-root-scene|data-root-between|data-root-zone-boundary/);
    expect(portalWordmark).not.toMatch(/data-root-illustrations|data-world-soybean|animateMotion/);
    expect(portalWordmark).not.toMatch(/<img|<text|\.webp|portal-story/);
    expect(portalWordmark).not.toMatch(/framer-motion|@react-spring|gsap/);
  });

  it('integra uma única contagem responsiva sem duplicar marca ou timer', () => {
    expect(portalPage).toContain("import { FenasojaPortalHero }");
    expect(portalPage).not.toContain('FenasojaCountdownHero');
    expect(portalStyles).toContain('.portal-official-countdown');
    expect(portalStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(portalStyles).toContain('min-height: 44px');
    expect(portalStyles).toContain('@media (min-width: 901px) and (max-height: 780px)');
    expect(countdownStyles).toContain('font-variant-numeric: tabular-nums lining-nums');
    expect(countdownDigits).toContain('aria-live="off"');
  });
});
