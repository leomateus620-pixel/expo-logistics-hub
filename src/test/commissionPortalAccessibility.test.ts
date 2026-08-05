import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const portalStyles = readFileSync(resolve('src/styles/commission-portal.css'), 'utf8');
const accessNavigationStyles = readFileSync(resolve('src/styles/portal-access-navigation.css'), 'utf8');
const countdownStyles = readFileSync(resolve('src/styles/official-countdown-digits.css'), 'utf8');
const countdownDigits = readFileSync(resolve('src/components/countdown/OfficialCountdownDigits.tsx'), 'utf8');
const portalPage = readFileSync(resolve('src/pages/commissions/CommissionPortalPage.tsx'), 'utf8');
const portalWordmark = readFileSync(resolve('src/components/portal/FenasojaPortalWordmark.tsx'), 'utf8');
const primaryEntry = readFileSync(resolve('src/components/portal/PortalPrimaryEntry.tsx'), 'utf8');
const destinationCard = readFileSync(resolve('src/components/portal/PortalDestinationCard.tsx'), 'utf8');
const commissionCard = readFileSync(resolve('src/components/commissions/CommissionCard.tsx'), 'utf8');
const portalRegistry = readFileSync(resolve('src/modules/portal/portalRegistry.ts'), 'utf8');

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

function cssRule(selector: string): string {
  const marker = `${selector} {`;
  const start = accessNavigationStyles.indexOf(marker);
  if (start < 0) throw new Error(`Regra CSS não encontrada: ${selector}`);
  const bodyStart = start + marker.length;
  const end = accessNavigationStyles.indexOf('}', bodyStart);
  if (end < 0) throw new Error(`Regra CSS sem fechamento: ${selector}`);
  return accessNavigationStyles.slice(bodyStart, end);
}

function cssHexProperty(selector: string, property: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cssRule(selector).match(new RegExp(`${escapedProperty}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Propriedade ${property} não encontrada em ${selector}`);
  return match[1].toUpperCase();
}

function cssRgbAlphaProperty(selector: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cssRule(selector).match(
    new RegExp(`${escapedProperty}:\\s*rgb\\((\\d+)\\s+(\\d+)\\s+(\\d+)\\s*\\/\\s*(\\d+)%\\)`, 'i'),
  );
  if (!match) throw new Error(`Cor RGB alpha ${property} não encontrada em ${selector}`);
  return {
    channels: [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number],
    alpha: Number(match[4]) / 100,
  };
}

function compositeHex(
  foreground: [number, number, number],
  background: string,
  alpha: number,
): string {
  const backgroundChannels = hexToRgb(background);
  return `#${foreground.map((channel, index) => (
    Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  )).join('')}`.toUpperCase();
}

const primaryPalettes = [
  ['Agenda', ".portal-primary-entry[data-tone='agenda']"],
  ['Mapa Comercial', ".portal-primary-entry[data-tone='map']"],
  ['Comissões', ".portal-primary-entry[data-tone='commissions']"],
  ['Financeiro', ".portal-primary-entry[data-tone='finance']"],
] as const;

const descriptionColor = cssHexProperty('.fenasoja-portal', '--access-description');

const normalTextPairs: Array<readonly [string, string, string]> = primaryPalettes.flatMap(
  ([label, selector]) => {
    const surface = cssHexProperty(selector, '--entry-surface-start');
    return [
      [`título de ${label}`, cssHexProperty(selector, '--entry-title'), surface] as const,
      [`descrição de ${label}`, descriptionColor, surface] as const,
    ];
  },
);

normalTextPairs.push(
  [
    'estado sem permissão',
    cssHexProperty('.fenasoja-portal', '--access-denied'),
    cssHexProperty(".portal-primary-entry[data-tone='finance']", '--entry-surface-start'),
  ],
  [
    'descrição de destino',
    cssHexProperty('.fenasoja-portal', '--access-destination-description'),
    cssHexProperty('.fenasoja-portal', '--access-destination-surface'),
  ],
);

const graphicalPairs: Array<readonly [string, string, string]> = primaryPalettes.map(
  ([label, selector]) => [
    `identidade ${label}`,
    cssHexProperty(selector, '--entry-accent'),
    cssHexProperty(selector, '--entry-surface-start'),
  ],
);

graphicalPairs.push([
  'foco do access hub',
  cssHexProperty('.fenasoja-portal', '--access-focus'),
  cssHexProperty(".portal-primary-entry[data-tone='map']", '--entry-surface-start'),
]);

const portalBackdropMatch = portalStyles.match(/--portal-navy-950:\s*(#[0-9a-f]{6})/i);
if (!portalBackdropMatch) throw new Error('Fundo base do portal não encontrado.');
const portalBackdrop = portalBackdropMatch[1].toUpperCase();

const borderPairs: Array<readonly [string, string, string]> = primaryPalettes.map(
  ([label, selector]) => {
    const border = cssRgbAlphaProperty(selector, '--entry-border');
    return [
      `borda de ${label}`,
      compositeHex(border.channels, portalBackdrop, border.alpha),
      portalBackdrop,
    ];
  },
);

describe('acessibilidade visual do hub Fenasoja', () => {
  it.each(normalTextPairs)('%s alcança WCAG AA para texto normal', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicalPairs)('%s alcança contraste não textual de 3:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(borderPairs)('%s mantém limite gráfico de 3:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('preserva movimento reduzido, alto contraste, transparência reduzida e áreas seguras', () => {
    expect(portalStyles).toContain('animation: portal-reveal 250ms both');
    expect(accessNavigationStyles).toContain('transition: grid-template-rows 215ms');
    expect(portalStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(portalStyles).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(portalStyles).toContain('@media (forced-colors: active)');
    expect(portalStyles).toContain('env(safe-area-inset-top)');
    expect(portalStyles).toContain('env(safe-area-inset-bottom)');
    expect(accessNavigationStyles).toContain('.portal-primary-entry__control:focus-visible');
    expect(accessNavigationStyles).toContain('.portal-destination-card:focus-visible');
    expect(accessNavigationStyles).toContain('.commission-access-card:focus-visible');
    expect(portalStyles).not.toContain('.portal-soybean__roots');
    expect(portalStyles).not.toContain('portal-root-grow');
    expect(portalStyles).not.toContain('.portal-identity__card');
    expect(portalStyles).not.toContain('portal-identity-card-arrive');
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
    expect(accessNavigationStyles).toContain(
      '.portal-primary-entry__control:not(.portal-primary-entry__control--static):active',
    );
    expect(accessNavigationStyles).toContain('.portal-primary-entry__control--static:hover');
    expect(accessNavigationStyles).toContain('outline-offset: -4px');
    expect(accessNavigationStyles).toContain('min-height: 44px');
    expect(portalStyles).not.toMatch(/^\.portal-primary-entry__control:hover/m);
    expect(portalStyles).not.toMatch(/^\.portal-destination-card\[href\]:hover/m);
    expect(portalStyles).not.toMatch(/^\.commission-access-card\[href\]:hover/m);
    expect(accessNavigationStyles).not.toContain('transition: all');
  });

  it('preserva hierarquia mobile e continuidade acessível da expansão', () => {
    expect(accessNavigationStyles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.portal-primary-entry__index,[\s\S]*?display: none/,
    );
    expect(accessNavigationStyles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.portal-agenda-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(accessNavigationStyles).toMatch(
      /@media \(max-width: 960px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(primaryEntry).toContain('aria-expanded={expanded}');
    expect(primaryEntry).toContain('aria-controls={panelId}');
    expect(primaryEntry).toContain('aria-hidden={!expanded}');
    expect(primaryEntry).toContain("inert: ''");
    expect(portalPage).toContain('useLayoutEffect');
    expect(portalPage).toContain('window.requestAnimationFrame(stabilizeControl)');
    expect(portalPage).toContain("window.scrollBy({ top: offset, left: 0, behavior: 'auto' })");
  });

  it('usa identidades de superfície completas e remove metadados redundantes', () => {
    for (const token of [
      '--entry-surface-start: #2d3b45',
      '--entry-surface-start: #214563',
      '--entry-surface-start: #20444b',
      '--entry-surface-start: #403b38',
    ]) {
      expect(accessNavigationStyles).toContain(token);
    }

    expect(accessNavigationStyles).not.toContain('inset: 10px auto 10px 0');
    expect(accessNavigationStyles).not.toContain('width: 3px');
    expect(accessNavigationStyles).not.toContain('transition: all');

    const presentationSource = [
      portalPage,
      primaryEntry,
      destinationCard,
      commissionCard,
      portalRegistry,
    ].join('\n');

    for (const redundantLabel of [
      'Acesso direto',
      'Acesso liberado',
      'Acesso protegido',
      'Explorar agenda',
      'Agenda aberta',
      'Comissões abertas',
      'Status do módulo e acesso do seu perfil.',
      'Destino 01',
    ]) {
      expect(presentationSource).not.toContain(redundantLabel);
    }

    expect(primaryEntry).toContain('aria-expanded={expanded}');
    expect(primaryEntry).toContain('aria-disabled="true"');
    expect(primaryEntry).toContain('role="group"');
    expect(portalPage).toContain('aria-live="polite"');
    expect(portalPage).toContain('role="status"');
    expect(destinationCard).not.toContain("aria-live={access.state === 'loading'");
    expect(commissionCard).not.toContain("aria-live={access.state === 'loading'");
    expect(destinationCard).toContain('aria-disabled="true"');
    expect(commissionCard).toContain('aria-disabled="true"');
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

  it('mantém a soja como foco sem raízes, badge ou narrativa ilustrativa', () => {
    expect(portalWordmark).not.toMatch(/portal-root|data-portal-root|portal-soybean__roots/);
    expect(portalWordmark).not.toMatch(/portal-identity__card|Gestão Operacional/);
    expect(portalWordmark).not.toMatch(/data-root-scene|data-root-between|data-root-zone-boundary/);
    expect(portalWordmark).not.toMatch(/data-root-illustrations|data-world-soybean|animateMotion/);
    expect(portalWordmark).not.toMatch(/<img|<text|\.webp|portal-story/);
    expect(portalWordmark).not.toMatch(/framer-motion|@react-spring|gsap/);
  });

  it('integra uma única contagem responsiva sem duplicar marca ou timer', () => {
    expect(portalPage).toContain("import { FenasojaPortalHero }");
    expect(portalPage).not.toContain('FenasojaCountdownHero');
    expect(portalStyles).toContain('.portal-official-countdown');
    expect(portalStyles).toContain('grid-template-columns: minmax(0, 1.08fr) minmax(380px, 0.92fr)');
    expect(portalStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(portalStyles).toContain('min-height: 44px');
    expect(portalStyles).toContain('min-height: 52px');
    expect(portalStyles).toContain('@media (min-width: 901px) and (max-height: 780px)');
    expect(countdownStyles).toContain('font-variant-numeric: tabular-nums lining-nums');
    expect(countdownDigits).toContain('aria-live="off"');
  });
});
