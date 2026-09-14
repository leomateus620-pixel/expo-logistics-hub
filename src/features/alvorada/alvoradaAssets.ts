import { versionAlvoradaAsset } from './assetVersion';
import { getEarthTextureSet, getEarthTextureUrls } from './earthAssets';

/**
 * Shared download pipeline for the Alvorada intro assets.
 *
 * Every asset is fetched exactly once per execution, as a streamed `Blob`
 * whose byte progress is observable. The portal starts the downloads while
 * the card is still waiting for visibility (this module has no `three`
 * dependency, so it ships in the portal chunk), and the WebGL scene later
 * consumes the very same responses — no second `<img>` request racing an
 * in-flight `fetch`, and no hidden dependency on HTTP cache heuristics.
 */

export interface AlvoradaAssetProgress {
  /** Bytes received across every tracked asset (unknown lengths count once complete). */
  loadedBytes: number;
  /** Number of assets that have finished downloading. */
  loadedItems: number;
  /** Number of assets that failed to download. */
  failedItems: number;
  /** Total bytes when every server sent `Content-Length`; otherwise the best-effort sum. */
  totalBytes: number;
  totalItems: number;
}

type ProgressListener = (progress: AlvoradaAssetProgress, url: string) => void;
type AlvoradaAssetPriority = 'auto' | 'high' | 'low';

interface AssetEntry {
  blob: Promise<Blob>;
  failed: boolean;
  loadedBytes: number;
  settled: boolean;
  totalBytes: number;
  status?: number;
  contentType?: string;
  error?: string;
}

const entries = new Map<string, AssetEntry>();
const listeners = new Set<ProgressListener>();
/** Emitting on every chunk would flood the watchdog; byte progress is coalesced. */
const PROGRESS_EMIT_INTERVAL_MS = 120;
let lastEmit = 0;
let emitTimer: number | null = null;

export const ALVORADA_CRITICAL_GEODATA = [
  '/alvorada/brazil-min.geojson',
  '/alvorada/rio-grande-do-sul-min.geojson',
] as const;

/**
 * The globe cannot be presented without its albedo. Every tier starts from the
 * same base resolution so the first frame never waits for the desktop detail.
 */
export function getAlvoradaCriticalTextureUrl() {
  return getEarthTextureSet(false).surface;
}

/**
 * Night lights, relief, clouds and (desktop) the detail albedo fade in when
 * they arrive; they never gate the first frame.
 */
export function getAlvoradaSecondaryTextureUrls(mobile: boolean) {
  return getEarthTextureUrls(mobile).slice(1);
}

export function snapshotAlvoradaAssetProgress(): AlvoradaAssetProgress {
  let loadedBytes = 0;
  let totalBytes = 0;
  let loadedItems = 0;
  let failedItems = 0;
  entries.forEach((entry) => {
    loadedBytes += entry.loadedBytes;
    totalBytes += entry.totalBytes || entry.loadedBytes;
    if (entry.settled && !entry.failed) loadedItems += 1;
    if (entry.failed) failedItems += 1;
  });
  return { loadedBytes, loadedItems, failedItems, totalBytes, totalItems: entries.size };
}

function emit(url: string, immediate: boolean) {
  if (listeners.size === 0) return;
  const now = Date.now();
  const flush = () => {
    emitTimer = null;
    lastEmit = Date.now();
    const snapshot = snapshotAlvoradaAssetProgress();
    listeners.forEach((listener) => listener(snapshot, url));
  };
  if (immediate || now - lastEmit >= PROGRESS_EMIT_INTERVAL_MS) {
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
      emitTimer = null;
    }
    flush();
    return;
  }
  if (emitTimer === null) {
    emitTimer = window.setTimeout(flush, PROGRESS_EMIT_INTERVAL_MS - (now - lastEmit));
  }
}

export function subscribeAlvoradaAssetProgress(listener: ProgressListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function streamResponse(entry: AssetEntry, url: string, response: Response) {
  entry.totalBytes = Number(response.headers.get('content-length') ?? 0) || 0;
  const reader = response.body?.getReader();
  if (!reader || typeof ReadableStream === 'undefined') {
    const blob = await response.blob();
    entry.loadedBytes = blob.size;
    entry.totalBytes = blob.size;
    return blob;
  }
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      entry.loadedBytes += value.byteLength;
      emit(url, false);
    }
  }
  entry.totalBytes = entry.loadedBytes;
  return new Blob(chunks, { type: response.headers.get('content-type') ?? undefined });
}

/**
 * Starts (or joins) the download of one asset. The returned promise resolves
 * to the shared `Blob`; failures are remembered so the scene can decide how to
 * degrade instead of retrying forever.
 */
export function loadAlvoradaAsset(url: string, priority: AlvoradaAssetPriority = 'auto'): Promise<Blob> {
  const existing = entries.get(url);
  if (existing) return existing.blob;

  const entry: AssetEntry = {
    blob: Promise.resolve(new Blob()),
    failed: false,
    loadedBytes: 0,
    settled: false,
    totalBytes: 0,
  };
  entry.blob = (async () => {
    try {
      // Priority hints let the albedo win bandwidth over the secondary maps on
      // browsers that support them; elsewhere the field is ignored.
      const response = await fetch(versionAlvoradaAsset(url), { cache: 'force-cache', priority } as RequestInit);
      entry.status = response.status;
      entry.contentType = response.headers.get('content-type') ?? '';
      if (response.status === 206 || /text\/html/i.test(entry.contentType)) {
        throw new Error(`Alvorada asset ${url}: incomplete or HTML response`);
      }
      if (!response.ok) throw new Error(`Alvorada asset ${url}: HTTP ${response.status}`);
      const blob = await streamResponse(entry, url, response);
      entry.settled = true;
      emit(url, true);
      return blob;
    } catch (error) {
      entry.failed = true;
      entry.error = error instanceof Error ? error.message : 'network-or-body-failed';
      entry.settled = true;
      emit(url, true);
      throw error;
    }
  })();
  entries.set(url, entry);
  return entry.blob;
}

/** Text assets (GeoJSON) decoded from the shared pipeline. */
export function loadAlvoradaText(url: string): Promise<string> {
  return loadAlvoradaAsset(url).then((blob) => blob.text());
}

export function isAlvoradaAssetWarm(url: string) {
  return entries.has(url);
}

/**
 * Kicks off every download the intro needs, ordered by criticality: albedo and
 * boundaries first, the secondary textures right after. Idempotent.
 */
export function warmAlvoradaIntroAssets(mobile: boolean) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  const start = (url: string, priority: AlvoradaAssetPriority) => {
    // Errors surface where the asset is consumed; warming is best effort.
    loadAlvoradaAsset(url, priority).catch(() => undefined);
  };
  start(getAlvoradaCriticalTextureUrl(), 'high');
  ALVORADA_CRITICAL_GEODATA.forEach((url) => start(url, 'high'));
  getAlvoradaSecondaryTextureUrls(mobile).forEach((url) => start(url, 'low'));
}

/** Test-only: forget every download so each scenario starts cold. */
export function resetAlvoradaAssetsForTests() {
  entries.clear();
  listeners.clear();
  lastEmit = 0;
  if (emitTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(emitTimer);
  }
  emitTimer = null;
}

/** Public asset diagnostics only; no headers, cookies or application requests. */
export function getAlvoradaAssetDiagnostics() {
  return Array.from(entries, ([url, entry]) => ({
    asset: url.split('?')[0], status: entry.status ?? null,
    contentType: entry.contentType ?? null, bytes: entry.loadedBytes,
    settled: entry.settled, failed: entry.failed, error: entry.error ?? null,
  }));
}

/** A consumer may explicitly make one bounded retry of a failed request. */
export function retryFailedAlvoradaAsset(url: string) {
  if (entries.get(url)?.failed) entries.delete(url);
}
