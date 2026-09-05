import registeredPortraits from './portraitManifest.json';
import fabianoSourceFile from '@/assets/person-fabiano-soltis.jpg';
import djeisonSourceFile from '@/assets/person-djeison-drey.jpg';

const portraits: Record<string, string> = {
  ...registeredPortraits,
  // Mapping by exact original URL preserves personPhotos.ts's intentionally swapped identity imports.
  [fabianoSourceFile]: '/alvorada/portraits/person-fabiano-soltis.webp',
  [djeisonSourceFile]: '/alvorada/portraits/person-djeison-drey.webp',
};

/** Optimize known bundled photos at presentation only; never reinterpret names or user uploads. */
export function optimizedPortraitUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (portraits[url]) return portraits[url];
  // Registered assets also arrive as absolute URLs in some data sources.
  try {
    const absolute = new URL(url);
    if (absolute.origin === 'https://fenasojagestao.com' && !absolute.search && !absolute.hash) {
      return portraits[absolute.pathname] ?? url;
    }
  } catch {
    // Unknown relative paths remain untouched.
  }
  return url;
}
