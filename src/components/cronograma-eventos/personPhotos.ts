import fabianoSoltis from '@/assets/fabiano-soltis.png.asset.json';
import djeisonDrey from '@/assets/djeison-drey.png.asset.json';

/**
 * Only these two members have an official portrait. Everyone else keeps the
 * existing initials / generic icon treatment.
 */
const PERSON_PHOTOS: Record<string, string> = {
  'fabiano soltis': fabianoSoltis.url,
  'djeison drey': djeisonDrey.url,
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the portrait URL for a person name, or null when there is none. */
export function getPersonPhoto(name?: string | null): string | null {
  if (!name) return null;
  const normalized = normalize(name);
  for (const [key, url] of Object.entries(PERSON_PHOTOS)) {
    if (normalized === key || normalized.includes(key)) return url;
  }
  return null;
}
