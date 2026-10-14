import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FenasojaPortalHistory } from '@/components/portal/FenasojaPortalHistory';
import { FENASOJA_HISTORY_ARTS } from '@/components/portal/history/artCatalog';
import { getGalleryLayout } from '@/components/portal/history/galleryLayout';
import { GALLERY_SESSION_KEY, readGallerySession } from '@/components/portal/history/galleryTimeline';
import { createGalleryAssetPreparer, getGalleryAssetWindow } from '@/components/portal/history/prepareGalleryAssets';

interface RecordedAnimation {
  node: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: Animation;
}

let cardWidth = 1_440;
let brandWidth = 340;
let brandHeight = 40;
let initiallyVisible = true;
let visibility = 'visible';
let reducedMotion = false;
let connection: EventTarget & { saveData: boolean };
let failedYears: Set<number>;
let rejectedDecodes: Set<number>;
let slowImages = false;
let decodedImages: MockImage[];
let recordedAnimations: RecordedAnimation[];
let intersections: Map<Element, IntersectionObserverCallback>;
let resizeCallbacks: Set<ResizeObserverCallback>;
let disconnectedObservers: ReturnType<typeof vi.fn>[];

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 256;
  decoding = '';
  sizes = '';
  srcset = '';
  private source = '';
  decode = vi.fn(() => rejectedDecodes.has(this.year)
    ? Promise.reject(new Error('invalid image')) : Promise.resolve());
  constructor() { decodedImages.push(this); }
  get year() { return Number(this.source.match(/-(\d{4})-/)?.[1]); }
  get src() { return this.source; }
  set src(value: string) {
    this.source = value;
    if (!slowImages) queueMicrotask(() => this.load());
  }
  load() {
    if (failedYears.has(this.year)) this.onerror?.();
    else this.onload?.();
  }
  removeAttribute(name: string) {
    if (name === 'src') this.source = '';
    if (name === 'srcset') this.srcset = '';
  }
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const advance = (duration: number) => { act(() => vi.advanceTimersByTime(duration)); };
const gallery = () => screen.getByTestId('portal-history');
const artworkYears = () => [...new Set([...gallery().querySelectorAll<HTMLElement>('[data-art]')]
  .map((node) => Number(node.dataset.art)))].sort((left, right) => left - right);
const liveAnimations = () => recordedAnimations.filter(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 0);

function setIntersection(visible: boolean) {
  act(() => intersections.forEach((callback, target) => callback([{
    target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
  } as IntersectionObserverEntry], {} as IntersectionObserver)));
}

function setDocumentVisible(visible: boolean) {
  visibility = visible ? 'visible' : 'hidden';
  fireEvent(document, new Event('visibilitychange'));
}

async function resizeCard(width: number, fullBrandWidth = brandWidth) {
  cardWidth = width;
  brandWidth = fullBrandWidth;
  act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  sessionStorage.clear();
  cardWidth = 1_440;
  brandWidth = 340;
  brandHeight = 40;
  initiallyVisible = true;
  visibility = 'visible';
  reducedMotion = false;
  slowImages = false;
  failedYears = new Set();
  rejectedDecodes = new Set();
  decodedImages = [];
  recordedAnimations = [];
  intersections = new Map();
  resizeCallbacks = new Set();
  disconnectedObservers = [];
  connection = Object.assign(new EventTarget(), { saveData: false });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.classList.contains('fenasoja-history') ? cardWidth : brandWidth;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const width = this.classList.contains('fenasoja-brand') ? brandWidth
      : this.classList.contains('fenasoja-history__group')
        ? this.querySelectorAll('[data-art]').length * getGalleryLayout(cardWidth).stepPx : cardWidth;
    return { width, height: brandHeight, x: 0, y: 0, top: 0, left: 0, right: width, bottom: brandHeight, toJSON: () => ({}) };
  });
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn(() => { for (const target of this.targets) intersections.delete(target); });
    private targets: Element[] = [];
    constructor(private callback: IntersectionObserverCallback) { disconnectedObservers.push(this.disconnect); }
    observe(target: Element) {
      this.targets.push(target);
      intersections.set(target, this.callback);
      this.callback([{
        target, isIntersecting: initiallyVisible, intersectionRatio: initiallyVisible ? 1 : 0,
      } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    unobserve() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn(() => { resizeCallbacks.delete(this.callback); });
    constructor(private callback: ResizeObserverCallback) {
      resizeCallbacks.add(callback);
      disconnectedObservers.push(this.disconnect);
    }
    observe() {}
    unobserve() {}
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let baseTime = 0;
      let resumedAt = 0;
      let playing = false;
      const currentTime = () => baseTime + (playing ? performance.now() - resumedAt : 0);
      const animation = {
        get currentTime() { return currentTime(); },
        set currentTime(value: number) { baseTime = Number(value); resumedAt = performance.now(); },
        get playState() { return playing ? 'running' : 'paused'; },
        play: vi.fn(() => { if (!playing) { resumedAt = performance.now(); playing = true; } }),
        pause: vi.fn(() => { baseTime = currentTime(); playing = false; }),
        cancel: vi.fn(() => { baseTime = currentTime(); playing = false; }),
      } as unknown as Animation;
      recordedAnimations.push({ node: this, keyframes, options, animation });
      return animation;
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { connection?: EventTarget }).connection;
  delete (Element.prototype as Element & { animate?: unknown }).animate;
});

describe('continuous Fenasoja visual history', () => {
  it('keeps all 12 recovered campaigns in technical copies and loops beyond two full traversals', async () => {
    render(<button aria-label="Abrir Ecossistema Fenasoja"><FenasojaPortalHistory released /></button>);
    await flush();
    expect(gallery()).toHaveAttribute('data-layout', 'continuous');
    expect(gallery()).toHaveAttribute('data-art-count', '12');
    expect(artworkYears()).toEqual(FENASOJA_HISTORY_ARTS.map(({ year }) => year));
    expect(gallery()).toHaveAttribute('data-phase', 'running');
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(gallery().querySelectorAll('button, a')).toHaveLength(0);
    expect(gallery().querySelectorAll('.fenasoja-history__group').length).toBeGreaterThan(1);
    for (const group of gallery().querySelectorAll('.fenasoja-history__group')) {
      expect(group.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(group.querySelectorAll('[data-art]')).toHaveLength(12);
    }
    const track = liveAnimations().find(({ node }) => node.classList.contains('fenasoja-history__track'));
    expect(track).toBeDefined();
    expect(track!.options.iterations).toBe(Infinity);
    const duration = Number(track!.options.duration);
    expect(duration).toBeGreaterThan(0);
    for (let step = 0; step < 25; step += 1) {
      advance(duration / 12);
      await flush();
    }
    expect(gallery()).toHaveAttribute('data-phase', 'running');
    expect(gallery()).toHaveAttribute('data-running', 'true');
    expect(gallery()).toHaveAttribute('data-art-count', '12');
    expect(artworkYears()).toHaveLength(12);
  });

  it('waits for both intro release and viewport visibility before saving any motion position', async () => {
    initiallyVisible = false;
    const view = render(<FenasojaPortalHistory released={false} />);
    await flush();
    advance(20_000);
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    view.rerender(<FenasojaPortalHistory released />);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    setIntersection(true);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'running');
    expect(readGallerySession()).not.toBeNull();
  });

  it('loads a visible window before starting while the launcher remains immediately usable', async () => {
    cardWidth = 320;
    brandWidth = 230;
    slowImages = true;
    const click = vi.fn();
    render(<button onClick={click}><FenasojaPortalHistory released /></button>);
    await flush();
    expect(decodedImages.length).toBeGreaterThan(0);
    expect(decodedImages.length).toBeLessThan(12);
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledOnce();
    for (let wave = 0; wave < 4; wave += 1) {
      act(() => decodedImages.filter((image) => image.onload).forEach((image) => image.load()));
      await flush();
    }
    expect(gallery()).toHaveAttribute('data-phase', 'running');
    expect(decodedImages.length).toBeLessThan(12);
  });

  it('pauses at the rendered WAAPI position for offscreen, hidden tabs and the existing dialog', async () => {
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    advance(1_050);
    setIntersection(false);
    const firstTime = liveAnimations()[0].animation.currentTime;
    expect(Number(firstTime)).toBeCloseTo(1_050);
    const firstSession = sessionStorage.getItem(GALLERY_SESSION_KEY);
    advance(50_000);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(liveAnimations()[0].animation.currentTime).toBe(firstTime);
    expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBe(firstSession);
    setIntersection(true);
    advance(300);
    setDocumentVisible(false);
    const hiddenTime = liveAnimations()[0].animation.currentTime;
    advance(50_000);
    expect(liveAnimations()[0].animation.currentTime).toBe(hiddenTime);
    setDocumentVisible(true);
    view.rerender(<FenasojaPortalHistory released paused />);
    const dialogTime = liveAnimations()[0].animation.currentTime;
    advance(10_000);
    expect(liveAnimations()[0].animation.currentTime).toBe(dialogTime);
    view.rerender(<FenasojaPortalHistory released />);
    expect(gallery()).toHaveAttribute('data-running', 'true');
    advance(250);
    expect(Number(liveAnimations()[0].animation.currentTime)).toBeCloseTo(Number(dialogTime) + 250);
  });

  it('keeps explicit user pause when viewport, page lifecycle and dialog change', async () => {
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    advance(875);
    view.rerender(<FenasojaPortalHistory released userPaused />);
    const saved = sessionStorage.getItem(GALLERY_SESSION_KEY);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(readGallerySession()?.userPaused).toBe(true);
    setIntersection(false);
    setIntersection(true);
    fireEvent(window, new Event('pagehide'));
    fireEvent(window, new Event('pageshow'));
    view.rerender(<FenasojaPortalHistory released userPaused paused />);
    view.rerender(<FenasojaPortalHistory released userPaused />);
    advance(50_000);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBe(saved);
    view.rerender(<FenasojaPortalHistory released userPaused={false} />);
    expect(gallery()).toHaveAttribute('data-running', 'true');
  });

  it.each(['reduced motion', 'data saving', 'unsupported animation'] as const)(
    'uses the official static brand with no campaign downloads under %s', async (mode) => {
      reducedMotion = mode === 'reduced motion';
      connection.saveData = mode === 'data saving';
      if (mode === 'unsupported animation') delete (Element.prototype as Element & { animate?: unknown }).animate;
      const available = vi.fn();
      render(<FenasojaPortalHistory released onMotionAvailable={available} />);
      await flush();
      expect(gallery()).toHaveAttribute('data-mode', 'static');
      expect(gallery()).toHaveAttribute('data-phase', 'static');
      expect(gallery()).toHaveAttribute('data-running', 'false');
      expect(decodedImages).toHaveLength(0);
      expect(recordedAnimations).toHaveLength(0);
      expect(sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
      expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
      expect(available).toHaveBeenLastCalledWith(false);
    },
  );

  it('stops pending work and track motion when data saving is enabled during a loop', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(1_250);
    connection.saveData = true;
    act(() => connection.dispatchEvent(new Event('change')));
    await flush();
    const paused = readGallerySession();
    expect(paused).not.toBeNull();
    expect(gallery()).toHaveAttribute('data-mode', 'static');
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(liveAnimations()).toHaveLength(0);
    advance(20_000);
    expect(readGallerySession()?.positionUnits).toBe(paused!.positionUnits);
    connection.saveData = false;
    act(() => connection.dispatchEvent(new Event('change')));
    await flush();
    expect(gallery()).toHaveAttribute('data-running', 'true');
    expect(readGallerySession()?.positionUnits).toBeCloseTo(paused!.positionUnits);
  });

  it.each([320, 360, 390, 430, 844, 1_366, 1_440, 1_920])(
    'keeps every recovered edition in one continuous row in a %ipx container', async (width) => {
      cardWidth = width;
      brandWidth = width < 600 ? 230 : 340;
      render(<FenasojaPortalHistory released />);
      await flush();
      expect(gallery()).toHaveAttribute('data-layout', 'continuous');
      expect(gallery()).toHaveAttribute('data-art-count', '12');
      expect(artworkYears()).toEqual(FENASOJA_HISTORY_ARTS.map(({ year }) => year));
      expect(liveAnimations()).toHaveLength(1);
      expect(liveAnimations()[0].node).toHaveClass('fenasoja-history__track');
      expect(recordedAnimations.some(({ node }) => node.classList.contains('fenasoja-history__brand'))).toBe(false);
    },
  );

  it('preserves the current campaign position while resize changes speed, slots and copy count', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(2_375);
    setIntersection(false);
    const before = readGallerySession();
    await resizeCard(390, 230);
    expect(gallery()).toHaveAttribute('data-layout', 'continuous');
    expect(gallery()).toHaveAttribute('data-art-count', '12');
    expect(readGallerySession()?.anchorId).toBe(before?.anchorId);
    expect(readGallerySession()!.positionUnits % 1).toBeCloseTo(before!.positionUnits % 1);
    expect(liveAnimations()).toHaveLength(1);
    expect(Number(liveAnimations()[0].options.duration)).toBeGreaterThan(0);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    setIntersection(true);
    expect(gallery()).toHaveAttribute('data-running', 'true');
  });

  it('omits a rendered image failure without resetting the other recovered editions', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(2_450);
    const failed = gallery().querySelector<HTMLImageElement>('[data-art] img[src]');
    expect(failed).not.toBeNull();
    const year = Number(failed!.closest<HTMLElement>('[data-art]')!.dataset.art);
    fireEvent.error(failed!);
    await flush();
    expect(artworkYears()).not.toContain(year);
    expect(gallery()).toHaveAttribute('data-art-count', '11');
    expect(liveAnimations()).toHaveLength(1);
    expect(gallery()).toHaveAttribute('data-running', 'true');
  });

  it('falls back to the official brand when every load or decode fails', async () => {
    failedYears = new Set(FENASOJA_HISTORY_ARTS.map(({ year }) => year));
    render(<FenasojaPortalHistory released />);
    await flush();
    for (let item = 0; item < 12; item += 1) { advance(6_001); await flush(); }
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(gallery()).toHaveAttribute('data-art-count', '0');
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
    expect(liveAnimations()).toHaveLength(0);
  });

  it('ignores finite v1 completion and restores continuous position after navigation', async () => {
    sessionStorage.setItem('fenasoja.portal.visual-history.v1', JSON.stringify({ version: 1, status: 'done', artIds: ['fenasoja-2014'], elapsedMs: 7_800 }));
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-running', 'true');
    advance(3_125);
    view.unmount();
    const before = readGallerySession();
    expect(before).not.toBeNull();
    advance(50_000);
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-running', 'true');
    expect(readGallerySession()?.anchorId).toBe(before?.anchorId);
    expect(readGallerySession()?.positionUnits).toBeCloseTo(before!.positionUnits);
  });

  it('disconnects pending loads, observers, timers and animation without duplicate live work in StrictMode', async () => {
    const view = render(<StrictMode><FenasojaPortalHistory released /></StrictMode>);
    await flush();
    expect(liveAnimations()).toHaveLength(1);
    const track = liveAnimations()[0];
    expect(track.node).toBe(gallery().querySelector('.fenasoja-history__track'));
    expect(track.options.iterations).toBe(Infinity);
    expect(track.options.duration).toBe(Number(gallery().dataset.duration));
    expect(track.animation.cancel).not.toHaveBeenCalled();
    expect(track.animation.play).toHaveBeenCalled();
    expect(track.keyframes[0].transform).not.toBe(track.keyframes[1].transform);
    advance(1_200);
    setIntersection(false);
    const position = readGallerySession()!.positionUnits;
    const step = Number(gallery().dataset.groupLength) / Number(gallery().dataset.artCount);
    expect(Number(track.animation.currentTime)).toBeCloseTo(position * step / Number(gallery().dataset.speed) * 1_000);
    view.unmount();
    await flush();
    expect(liveAnimations()).toHaveLength(0);
    expect(disconnectedObservers.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(decodedImages.every((image) => !image.onload && !image.onerror)).toBe(true);
    advance(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('continuous gallery preparation and responsive geometry', () => {
  it('sizes slots by their container while preserving artwork aspect ratio and readable mobile height', () => {
    const mobile = getGalleryLayout(390);
    const desktop = getGalleryLayout(1_440);
    expect(mobile.headerHeight).toBe(88);
    expect(desktop.headerHeight).toBe(112);
    expect(mobile.artHeight).toBe(32);
    expect(desktop.artHeight).toBe(72);
    expect(mobile.slotWidth / mobile.artHeight).toBeCloseTo(4 / 3);
    expect(desktop.slotWidth / desktop.artHeight).toBeCloseTo(4 / 3);
    expect(mobile.speedPxPerSecond).toBe(12);
    expect(desktop.speedPxPerSecond).toBe(16);
  });

  it('never starts an image request after its preparation owner has been disposed', () => {
    const preparer = createGalleryAssetPreparer({ arts: FENASOJA_HISTORY_ARTS, sizes: '96px', onChange: vi.fn() });
    preparer.dispose();
    preparer.request(FENASOJA_HISTORY_ARTS.map(({ id }) => id));
    expect(decodedImages).toHaveLength(0);
  });

  it('limits concurrent decode jobs to three and only loads the mobile visible window plus incoming editions', async () => {
    slowImages = true;
    const layout = getGalleryLayout(320);
    const ids = FENASOJA_HISTORY_ARTS.map(({ id }) => id);
    const window = getGalleryAssetWindow(ids, 0, 320, layout.stepPx, 3);
    expect(window.length).toBeLessThan(12);
    const changes = vi.fn();
    const preparer = createGalleryAssetPreparer({ arts: FENASOJA_HISTORY_ARTS, sizes: `${layout.slotWidth}px`, onChange: changes });
    preparer.request(window);
    preparer.request(window);
    expect(decodedImages).toHaveLength(3);
    for (let wave = 0; wave < 4; wave += 1) {
      const pending = decodedImages.filter((image) => image.onload);
      expect(pending.length).toBeLessThanOrEqual(3);
      act(() => pending.forEach((image) => image.load()));
      await flush();
    }
    expect(decodedImages).toHaveLength(window.length);
    expect(changes.mock.lastCall?.[0].ready).toHaveLength(window.length);
    preparer.request(getGalleryAssetWindow(ids, 1, 320, layout.stepPx, 3));
    expect(decodedImages.length).toBeGreaterThan(window.length);
    expect(decodedImages.length).toBeLessThan(12);
    preparer.dispose();
  });

  it('clears all preparation timers and prevents late decode publication after disposal', async () => {
    slowImages = true;
    const changes = vi.fn();
    const preparer = createGalleryAssetPreparer({ arts: FENASOJA_HISTORY_ARTS, sizes: '43px', onChange: changes });
    preparer.request(FENASOJA_HISTORY_ARTS.map(({ id }) => id));
    expect(decodedImages).toHaveLength(3);
    let resolveDecode!: () => void;
    decodedImages[0].decode.mockReturnValue(new Promise<void>((resolve) => { resolveDecode = resolve; }));
    decodedImages[0].load();
    preparer.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(decodedImages.every((image) => !image.onload && !image.onerror)).toBe(true);
    resolveDecode();
    await flush();
    expect(changes).not.toHaveBeenCalled();
    expect(decodedImages).toHaveLength(3);
  });

  it('omits both failed network responses and rejected decodes without losing a valid campaign', async () => {
    const [networkFailure, decodeFailure, valid] = FENASOJA_HISTORY_ARTS;
    failedYears.add(networkFailure.year);
    rejectedDecodes.add(decodeFailure.year);
    const changes = vi.fn();
    const preparer = createGalleryAssetPreparer({ arts: FENASOJA_HISTORY_ARTS, sizes: '96px', onChange: changes });
    preparer.request([networkFailure.id, decodeFailure.id, valid.id]);
    await flush();
    expect(changes.mock.lastCall?.[0]).toEqual({ ready: [valid.id], failed: [networkFailure.id, decodeFailure.id] });
    expect(vi.getTimerCount()).toBe(0);
    preparer.dispose();
  });
});
