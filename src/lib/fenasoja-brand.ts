export const FENASOJA_EDITION = 2028 as const;
export const FENASOJA_PRODUCT_NAME = `Fenasoja ${FENASOJA_EDITION}` as const;

/**
 * Presentation-only edition alias for persisted organization labels.
 * It never mutates stored records, identifiers, dates or historical sources.
 */
export function presentFenasojaProductName(value?: string | null): string {
  if (!value) return FENASOJA_PRODUCT_NAME;
  return value.replace(/\bFenasoja\s+2026\b/gi, FENASOJA_PRODUCT_NAME);
}

/** Exact reference anchors for non-CSS surfaces such as PDFs, charts and 3D materials. */
export const FENASOJA_2028_COLORS = {
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

export const FENASOJA_2028_CHART_COLORS = [
  FENASOJA_2028_COLORS.indigo,
  FENASOJA_2028_COLORS.orange,
  FENASOJA_2028_COLORS.green,
  FENASOJA_2028_COLORS.gold,
  FENASOJA_2028_COLORS.blue,
  FENASOJA_2028_COLORS.mutedIndigo,
] as const;

export type RgbTuple = [number, number, number];

/** jsPDF/autotable compatible RGB values derived from the same anchors. */
export const FENASOJA_2028_RGB: Record<
  'indigo' | 'navy' | 'orange' | 'gold' | 'cream' | 'softWhite' | 'mutedIndigo',
  RgbTuple
> = {
  indigo: [18, 29, 133],
  navy: [3, 24, 52],
  orange: [242, 117, 26],
  gold: [249, 193, 33],
  cream: [245, 230, 205],
  softWhite: [249, 250, 251],
  mutedIndigo: [83, 77, 144],
};
