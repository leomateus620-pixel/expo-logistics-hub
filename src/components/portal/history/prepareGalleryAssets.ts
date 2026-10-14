import type { FenasojaHistoryArt } from './artCatalog';

export interface GalleryAssetsSnapshot { ready: readonly string[]; failed: readonly string[] }
export interface GalleryAssetPreparer {
  request(ids: readonly string[]): void;
  setSizes(sizes: string): void;
  fail(id: string): void;
  dispose(): void;
}

/** Visible copies plus incoming editions. Positive motion means the next edition is to the left. */
export function getGalleryAssetWindow(ids: readonly string[], positionUnits: number, width: number, step: number, lookAhead = 3) {
  if (!ids.length || step <= 0) return [];
  const index = Math.floor(positionUnits);
  const normalize = (value: number) => ((value % ids.length) + ids.length) % ids.length;
  const result = new Set<string>();
  for (let behind = 0; behind <= Math.ceil(width / step); behind++) result.add(ids[normalize(index - behind)]);
  for (let ahead = 1; ahead <= lookAhead; ahead++) result.add(ids[normalize(index + ahead)]);
  return [...result];
}

/** Three decode jobs at most. Transformed offscreen images are prepared explicitly, never via lazy loading. */
export function createGalleryAssetPreparer({ arts, sizes: initialSizes, onChange, timeoutMs = 15_000 }: {
  arts: readonly FenasojaHistoryArt[];
  sizes: string;
  onChange: (snapshot: GalleryAssetsSnapshot) => void;
  timeoutMs?: number;
}): GalleryAssetPreparer {
  const catalog = new Map(arts.map((art) => [art.id, art]));
  const status = new Map<string, 'queued' | 'loading' | 'ready' | 'failed'>();
  const queue: string[] = [];
  const pending = new Map<string, () => void>();
  let sizes = initialSizes;
  let disposed = false;
  const publish = () => {
    if (disposed) return;
    onChange({ ready: [...status].filter(([, value]) => value === 'ready').map(([id]) => id),
      failed: [...status].filter(([, value]) => value === 'failed').map(([id]) => id) });
  };
  const pump = () => {
    while (!disposed && pending.size < 3 && queue.length) {
      const id = queue.shift()!;
      if (status.get(id) !== 'queued') continue;
      const art = catalog.get(id)!;
      const image = new Image();
      status.set(id, 'loading');
      let settled = false;
      const finish = (valid: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        pending.delete(id);
        if (!valid) { image.removeAttribute('src'); image.removeAttribute('srcset'); }
        if (disposed) return;
        status.set(id, valid ? 'ready' : 'failed');
        publish();
        pump();
      };
      pending.set(id, () => finish(false));
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => {
        if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish(false));
        else finish(image.naturalWidth > 0);
      };
      image.onerror = () => finish(false);
      image.decoding = 'async';
      image.sizes = sizes;
      image.srcset = art.srcSet;
      image.src = art.src;
    }
  };
  return {
    request(ids) {
      if (disposed) return;
      // A new visible window takes priority over work that has not started yet.
      const requested = ids.filter((id) => catalog.has(id) && !status.has(id));
      requested.forEach((id) => status.set(id, 'queued'));
      queue.unshift(...requested);
      pump();
    },
    setSizes(next) { sizes = next; },
    fail(id) {
      if (disposed || !catalog.has(id) || status.get(id) === 'failed') return;
      pending.get(id)?.();
      status.set(id, 'failed');
      publish();
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      [...pending.values()].forEach((cancel) => cancel());
      pending.clear();
    },
  };
}
