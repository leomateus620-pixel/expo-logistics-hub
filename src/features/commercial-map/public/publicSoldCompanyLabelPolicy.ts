const FULL_CAP_HEIGHT = 8.8;
const FULL_CAP_HYSTERESIS = .5;
const COMPACT_CAP_HEIGHT = 7;

export function usesCompactPublicCompanyLabels(width: number, height: number) {
  return width > 0 && width <= 430 && height > width;
}

export function isReadablePublicCompanyCaption(capHeight: number, variant: 'full' | 'compact', wasFullVisible = false) {
  return capHeight + 1e-6 >= (variant === 'compact'
    ? COMPACT_CAP_HEIGHT
    : FULL_CAP_HEIGHT - (wasFullVisible ? FULL_CAP_HYSTERESIS : 0));
}

const Segmenter = (Intl as typeof Intl & {
  Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment(text: string): Iterable<{ segment: string }> };
}).Segmenter;
const graphemeSegmenter = Segmenter ? new Segmenter('pt-BR', { granularity: 'grapheme' }) : null;
function graphemes(text: string) {
  return graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(text), part => part.segment)
    : text.match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
}

/** Retain a recognizable word or registered mark before reducing to a
 * grapheme prefix. A three-letter fragment is too ambiguous for the map. */
export function compactCompanyCaptionAbbreviations(name: string) {
  const characters = graphemes(name);
  if (characters.length <= 5) return [];
  const words = name.trim().split(/\s+/u);
  const first = words[0];
  const last = words.at(-1) ?? '';
  const firstLength = graphemes(first).length;
  const variants: string[] = [];
  if (words.length > 1 && /^(?:\p{L}\.){2,3}$/u.test(last)) {
    variants.push(`${graphemes(first).slice(0, 3).join('')}… ${last}`);
  }
  if (words.length > 1 && (firstLength >= 5 || /^(?:\p{L}\.){2,3}$/u.test(first))) variants.push(`${first}…`);
  for (const length of [8, 5]) {
    const prefix = characters.slice(0, length);
    if (characters.length > length && prefix.filter(character => /\S/u.test(character)).length >= 5) {
      variants.push(`${prefix.join('').trimEnd()}…`);
    }
  }
  return [...new Set(variants)];
}
