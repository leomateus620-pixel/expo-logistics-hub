import { describe, expect, it } from 'vitest';
import {
  FENASOJA_2028_CHART_COLORS,
  FENASOJA_2028_COLORS,
  FENASOJA_2028_RGB,
  FENASOJA_EDITION,
  FENASOJA_PRODUCT_NAME,
  presentFenasojaProductName,
} from '@/lib/fenasoja-brand';

const EXPECTED_COLORS = {
  indigo: '#121D85',
  navy: '#031834',
  nearBlackNavy: '#040203',
  orange: '#F2751A',
  darkOrange: '#E67E09',
  gold: '#F9C121',
  lightGold: '#FAD954',
  cream: '#F5E6CD',
  softWhite: '#F9FAFB',
  blue: '#1A6CCB',
  green: '#089D7E',
  mutedIndigo: '#534D90',
} as const;

type BrandColorName = keyof typeof EXPECTED_COLORS;

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const channels = normalized.match(/.{2}/g);

  if (!channels || channels.length !== 3) {
    throw new Error(`Cor hexadecimal inválida: ${hex}`);
  }

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

describe('tokens da identidade Fenasoja 2028', () => {
  it('mantém edição, nome do produto e âncoras hexadecimais canônicas', () => {
    expect(FENASOJA_EDITION).toBe(2028);
    expect(FENASOJA_PRODUCT_NAME).toBe('Fenasoja 2028');
    expect(FENASOJA_2028_COLORS).toEqual(EXPECTED_COLORS);
  });

  it('apresenta o nome persistido da edição anterior sem alterar outros rótulos', () => {
    expect(presentFenasojaProductName('Fenasoja 2026')).toBe('Fenasoja 2028');
    expect(presentFenasojaProductName('Organização Regional')).toBe('Organização Regional');
    expect(presentFenasojaProductName(null)).toBe('Fenasoja 2028');
  });

  it('deriva os valores RGB de exportação das mesmas âncoras', () => {
    const rgbColorNames = [
      'indigo',
      'navy',
      'orange',
      'gold',
      'cream',
      'softWhite',
      'mutedIndigo',
    ] as const;

    for (const colorName of rgbColorNames) {
      expect(FENASOJA_2028_RGB[colorName]).toEqual(hexToRgb(EXPECTED_COLORS[colorName]));
    }
  });

  it('mantém a ordem semântica da paleta de gráficos', () => {
    expect(FENASOJA_2028_CHART_COLORS).toEqual([
      EXPECTED_COLORS.indigo,
      EXPECTED_COLORS.orange,
      EXPECTED_COLORS.green,
      EXPECTED_COLORS.gold,
      EXPECTED_COLORS.blue,
      EXPECTED_COLORS.mutedIndigo,
    ]);
    expect(new Set(FENASOJA_2028_CHART_COLORS).size).toBe(FENASOJA_2028_CHART_COLORS.length);
  });
});

const normalTextPairs: Array<{
  label: string;
  foreground: BrandColorName;
  background: BrandColorName;
}> = [
  { label: 'texto navy em superfície soft white', foreground: 'navy', background: 'softWhite' },
  { label: 'texto soft white em superfície indigo', foreground: 'softWhite', background: 'indigo' },
  { label: 'texto navy na ação orange', foreground: 'navy', background: 'orange' },
  { label: 'texto navy em aviso gold', foreground: 'navy', background: 'gold' },
  { label: 'texto navy em superfície cream', foreground: 'navy', background: 'cream' },
  {
    label: 'texto soft white em superfície muted indigo',
    foreground: 'softWhite',
    background: 'mutedIndigo',
  },
  { label: 'texto soft white em superfície blue', foreground: 'softWhite', background: 'blue' },
  { label: 'texto navy em estado green', foreground: 'navy', background: 'green' },
];

describe('contraste WCAG da identidade Fenasoja 2028', () => {
  it.each(normalTextPairs)('$label atinge AA para texto normal', ({ foreground, background }) => {
    const ratio = contrastRatio(
      FENASOJA_2028_COLORS[foreground],
      FENASOJA_2028_COLORS[background],
    );

    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
