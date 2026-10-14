import type { FenasojaHistoryArt } from './artCatalog';

/** Only the chosen pair/quartet is fetched. Failure never gates portal access. */
export async function prepareGalleryAssets(arts: readonly FenasojaHistoryArt[], signal: AbortSignal) {
  const prepared = await Promise.all(arts.map((art) => new Promise<FenasojaHistoryArt | null>((resolve) => {
    if (signal.aborted) { resolve(null); return; }
    const image = new Image();
    let settled = false;
    const finish = (valid: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (!valid) { image.removeAttribute('src'); image.removeAttribute('srcset'); }
      resolve(valid && !signal.aborted ? art : null);
    };
    const abort = () => { finish(false); image.removeAttribute('src'); image.removeAttribute('srcset'); };
    const timeout = window.setTimeout(() => finish(false), 6000);
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().then(() => finish(true), () => finish(false));
      } else finish(image.naturalWidth > 0);
    };
    image.onerror = () => finish(false);
    signal.addEventListener('abort', abort, { once: true });
    image.decoding = 'async';
    image.sizes = '108px';
    image.srcset = art.srcSet;
    image.src = art.src;
  })));
  return prepared.filter((art): art is FenasojaHistoryArt => art !== null);
}
