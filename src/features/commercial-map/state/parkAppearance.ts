import { createContext, useContext } from 'react';

export const PARK_APPEARANCES = {
  'warm-natural': 'Natural quente',
  classic: 'Clássico',
} as const;
export type ParkAppearance = keyof typeof PARK_APPEARANCES;

export const PARK_QUALITY_CHOICES = {
  auto: 'Automática',
  fluidity: 'Fluidez',
  detail: 'Detalhe',
} as const;
export type ParkQualityPreference = keyof typeof PARK_QUALITY_CHOICES;

// A shared component used outside the management scene keeps its original materials.
export const ParkAppearanceContext = createContext<ParkAppearance>('classic');
export const useParkAppearance = () => useContext(ParkAppearanceContext);

export function readParkPreferences() {
  let appearance: ParkAppearance = 'warm-natural';
  let qualityPreference: ParkQualityPreference = 'auto';
  try {
    const storedAppearance = window.localStorage.getItem('commercial-map:appearance');
    const storedQuality = window.localStorage.getItem('commercial-map:quality');
    if (storedAppearance === 'classic') appearance = storedAppearance;
    if (storedQuality === 'fluidity' || storedQuality === 'detail') qualityPreference = storedQuality;
  } catch { /* Private browsing or server rendering uses in-memory defaults. */ }
  return { appearance, qualityPreference };
}

export function persistParkPreference(key: 'appearance' | 'quality', value: ParkAppearance | ParkQualityPreference) {
  try {
    window.localStorage.setItem(`commercial-map:${key}`, value);
  } catch { /* The current session can still switch profiles. */ }
}
