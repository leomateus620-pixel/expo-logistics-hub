/** Local, intact campaign artwork. Provenance and consultation masters live in docs/portal-history. */
export interface FenasojaHistoryArt {
  readonly id: string;
  readonly year: number;
  readonly alt: string;
  readonly src: string;
  readonly srcSet: string;
  readonly width: 320;
  readonly height: 240;
}

const campaign = (year: number): FenasojaHistoryArt => ({
  id: `fenasoja-${year}`,
  year,
  alt: `Arte de campanha da FENASOJA ${year}`,
  src: `/portal/history/fenasoja-${year}-320x240.webp`,
  srcSet: `/portal/history/fenasoja-${year}-320x240.webp 320w, /portal/history/fenasoja-${year}-640x480.webp 640w`,
  width: 320,
  height: 240,
});

export const FENASOJA_HISTORY_ARTS: readonly FenasojaHistoryArt[] = Object.freeze(
  [2014, 2016, 2018, 2024].map(campaign),
);

export const FENASOJA_MOBILE_HISTORY_YEARS = [2016, 2024] as const;

/** Zero lateral capacity uses the same pair in the reserved second row. */
export function selectHistoryArtworks(artworksPerSide: number): readonly FenasojaHistoryArt[] {
  return artworksPerSide >= 2
    ? FENASOJA_HISTORY_ARTS
    : FENASOJA_HISTORY_ARTS.filter((art) => FENASOJA_MOBILE_HISTORY_YEARS.some((year) => year === art.year));
}
