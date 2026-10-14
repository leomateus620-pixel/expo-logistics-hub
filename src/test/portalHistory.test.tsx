import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FenasojaPortalHistory } from '@/components/portal/FenasojaPortalHistory';
import { FENASOJA_HISTORY_ARTS, selectHistoryArtworks } from '@/components/portal/history/artCatalog';
import { artworkKeyframes } from '@/components/portal/history/galleryAnimation';
import { getGalleryLayout } from '@/components/portal/history/galleryLayout';
import { GALLERY_SESSION_KEY, readGallerySession } from '@/components/portal/history/galleryTimeline';
import { prepareGalleryAssets } from '@/components/portal/history/prepareGalleryAssets';

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
let coarsePointer = false;
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
  naturalWidth = 320;
  decoding = '';
  sizes = '';
  srcset = '';
  private source = '';
  decode = vi.fn(() => rejectedDecodes.has(this.year)
    ? Promise.reject(new Error('invalid image')) : Promise.resolve());

  constructor() { decodedImages.push(this); }
  get year() { return Number(this.source.match(/fenasoja-(\d{4})/)?.[1]); }
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
const artworkYears = () => [...gallery().querySelectorAll<HTMLElement>('[data-art]')].map((node) => Number(node.dataset.art));

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

describe('Fenasoja visual history in the header', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    window.sessionStorage.clear();
    cardWidth = 1_440;
    brandWidth = 340;
    brandHeight = 40;
    initiallyVisible = true;
    visibility = 'visible';
    reducedMotion = false;
    coarsePointer = false;
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
      const width = this.classList.contains('fenasoja-brand') ? brandWidth : cardWidth;
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
      matches: (reducedMotion && query.includes('prefers-reduced-motion')) || (coarsePointer && query.includes('pointer: coarse')),
      media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn(), cancel: vi.fn() } as unknown as Animation;
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

  it('keeps all four stable slots during each 1400ms window and returns to the official brand at 7800ms', async () => {
    render(<button aria-label="Abrir Ecossistema Fenasoja"><FenasojaPortalHistory released /></button>);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'reveal');
    expect(gallery()).toHaveAttribute('data-layout', 'inline');
    expect(artworkYears()).toEqual([2014, 2016, 2018, 2024]);
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(gallery().querySelector('.fenasoja-history__gallery')).toHaveAttribute('aria-hidden', 'true');
    advance(600);
    for (const year of [2014, 2016, 2018, 2024]) {
      expect(gallery()).toHaveAttribute('data-phase', 'highlight');
      expect(gallery()).toHaveAttribute('data-active-art', String(year));
      expect(artworkYears()).toEqual([2014, 2016, 2018, 2024]);
      advance(1_399);
      expect(gallery()).toHaveAttribute('data-active-art', String(year));
      advance(1);
    }
    expect(gallery()).toHaveAttribute('data-phase', 'closing');
    expect(gallery()).toHaveAttribute('data-active', 'true');
    advance(1_600);
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    expect(gallery()).toHaveAttribute('data-active', 'false');
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(readGallerySession()?.status).toBe('done');
    expect(recordedAnimations.every(({ options }) => options.duration === 7_800)).toBe(true);
  });

  it('waits for intro release and actual viewport visibility before consuming the session', async () => {
    initiallyVisible = false;
    const view = render(<FenasojaPortalHistory released={false} />);
    await flush();
    advance(20_000);
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    expect(window.sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    view.rerender(<FenasojaPortalHistory released />);
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    setIntersection(true);
    expect(gallery()).toHaveAttribute('data-phase', 'reveal');
    expect(readGallerySession()?.elapsedMs).toBe(0);
  });

  it('starts after deferred asset decoding when intro release already occurred', async () => {
    slowImages = true;
    const view = render(<FenasojaPortalHistory released={false} />);
    await flush();
    expect(decodedImages).toHaveLength(4);
    advance(2_000);
    view.rerender(<FenasojaPortalHistory released />);
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    expect(window.sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    act(() => decodedImages.forEach((image) => image.load()));
    await flush();
    expect(artworkYears()).toEqual([2014, 2016, 2018, 2024]);
    expect(gallery()).toHaveAttribute('data-phase', 'reveal');
    expect(gallery()).toHaveAttribute('data-running', 'true');
    expect(readGallerySession()?.elapsedMs).toBe(0);
    advance(600);
    expect(gallery()).toHaveAttribute('data-active-art', '2014');
  });

  it('synchronizes visibility when the document becomes visible between render and effect subscription', async () => {
    vi.spyOn(document, 'visibilityState', 'get')
      .mockReturnValueOnce('hidden')
      .mockReturnValue('visible');
    render(<FenasojaPortalHistory released />);
    await flush();
    // No visibilitychange event is dispatched: the initial effect must read
    // the current document state after registering its listener.
    expect(artworkYears()).toEqual([2014, 2016, 2018, 2024]);
    expect(gallery()).toHaveAttribute('data-phase', 'reveal');
    expect(gallery()).toHaveAttribute('data-running', 'true');
    expect(readGallerySession()?.elapsedMs).toBe(0);
  });

  it('pauses offscreen and hidden tabs at the exact animation time, then resumes the remaining window', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(1_050);
    setIntersection(false);
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(readGallerySession()?.elapsedMs).toBe(1_050);
    expect(recordedAnimations.every(({ animation }) => animation.currentTime === 1_050)).toBe(true);
    advance(50_000);
    setIntersection(true);
    advance(300);
    setDocumentVisible(false);
    expect(readGallerySession()?.elapsedMs).toBe(1_350);
    expect(recordedAnimations.every(({ animation }) => animation.currentTime === 1_350)).toBe(true);
    advance(50_000);
    setDocumentVisible(true);
    advance(649);
    expect(gallery()).toHaveAttribute('data-active-art', '2014');
    advance(1);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
  });

  it('pauses for the existing launcher dialog without changing its function', async () => {
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    advance(875);
    view.rerender(<FenasojaPortalHistory released paused />);
    advance(10_000);
    expect(readGallerySession()?.elapsedMs).toBe(875);
    view.rerender(<FenasojaPortalHistory released paused={false} />);
    advance(1_125);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
  });

  it('persists the remaining window on pagehide and resumes on pageshow', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(1_175);
    fireEvent(window, new Event('pagehide'));
    expect(gallery()).toHaveAttribute('data-running', 'false');
    expect(readGallerySession()?.elapsedMs).toBe(1_175);
    advance(50_000);
    fireEvent(window, new Event('pageshow'));
    expect(gallery()).toHaveAttribute('data-running', 'true');
    advance(825);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
  });

  it('runs the canonical gallery when reduced motion is requested, as authorized for this experience', async () => {
    reducedMotion = true;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-gallery-motion', 'canonical');
    expect(gallery()).toHaveAttribute('data-phase', 'reveal');
    expect(decodedImages).toHaveLength(4);
    advance(600);
    expect(gallery()).toHaveAttribute('data-active-art', '2014');
  });

  it('uses a static brand and downloads no campaign artwork under data saving', async () => {
    connection.saveData = true;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
    expect(decodedImages).toHaveLength(0);
    expect(recordedAnimations).toHaveLength(0);
    expect(window.sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
  });

  it('keeps the normal brand available if the browser cannot animate', async () => {
    delete (Element.prototype as Element & { animate?: unknown }).animate;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    expect(decodedImages).toHaveLength(0);
    expect(window.sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
  });

  it('uses the full measured lockup and container width for a four/two/stacked gallery', async () => {
    // The browser remains wide; only this card is narrower.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_920 });
    cardWidth = 770;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(gallery()).toHaveAttribute('data-layout', 'inline');
    expect(decodedImages.map((image) => image.year)).toEqual([2016, 2024]);
    advance(1_100);
    await resizeCard(390, 230);
    expect(gallery()).toHaveAttribute('data-layout', 'stacked');
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(decodedImages).toHaveLength(2);
    advance(900);
    expect(gallery()).toHaveAttribute('data-active-art', '2024');
    await resizeCard(1_440, 340);
    expect(gallery()).toHaveAttribute('data-layout', 'inline');
    expect(artworkYears()).toEqual([2014, 2016, 2018, 2024]);
    expect(gallery()).toHaveAttribute('data-active-art', '2024');
    expect(gallery()).toHaveAttribute('data-phase', 'highlight');
    const live = recordedAnimations.filter(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 0);
    expect(live).toHaveLength(10);
    expect(live.every(({ options }) => options.duration === 7_800)).toBe(true);
  });

  it('rebuilds WAAPI at the new total duration without replaying the active slot after a desktop-to-mobile resize', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(2_375);
    await resizeCard(390, 230);
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
    expect(readGallerySession()?.elapsedMs).toBe(975);
    const live = recordedAnimations.filter(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 0);
    expect(live).toHaveLength(6);
    expect(live.every(({ options, animation }) => options.duration === 5_000 && animation.currentTime === 975)).toBe(true);
    advance(1_025);
    expect(gallery()).toHaveAttribute('data-active-art', '2024');
  });

  it('immediately reduces four slots to the mobile pair while replacement decoding is still pending', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(2_375);
    slowImages = true;
    await resizeCard(390, 230);
    expect(decodedImages).toHaveLength(6);
    expect(decodedImages.slice(4).every((image) => image.onload !== null)).toBe(true);
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
    expect(readGallerySession()?.elapsedMs).toBe(975);
    const live = recordedAnimations.filter(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 0);
    expect(live).toHaveLength(6);
    expect(live.every(({ options, animation }) => options.duration === 5_000 && animation.currentTime === 975)).toBe(true);
    advance(1_025);
    expect(gallery()).toHaveAttribute('data-active-art', '2024');
    advance(3_000);
    expect(gallery()).toHaveAttribute('data-phase', 'done');
  });

  it.each([320, 360, 390, 430])('selects only 2016 and 2024 in a %ipx card and completes in 5000ms', async (width) => {
    cardWidth = width;
    brandWidth = 230;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-layout', 'stacked');
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(decodedImages).toHaveLength(2);
    expect(recordedAnimations.every(({ options }) => options.duration === 5_000)).toBe(true);
    advance(5_000);
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    const brandAnimation = recordedAnimations.find(({ node }) => node.classList.contains('fenasoja-history__brand'));
    expect(brandAnimation?.keyframes.find(({ offset }) => offset === 160 / 5_000)?.transform)
      .toBe('translate(-50%, calc(-50% - 42px))');
    expect(brandAnimation?.keyframes.find(({ offset }) => offset === 4_000 / 5_000)?.transform)
      .toBe('translate(-50%, calc(-50% - 42px))');
    expect(brandAnimation?.keyframes.find(({ offset }) => offset === 4_500 / 5_000)?.transform)
      .toBe('translate(-50%, -50%)');
    expect(brandAnimation?.keyframes.at(-1)?.transform).toBe('translate(-50%, -50%)');
  });

  it.each([844, 900])('keeps the mobile pair and 5000ms duration on a %ipx coarse-pointer landscape container', async (width) => {
    coarsePointer = true;
    cardWidth = width;
    brandWidth = 230;
    expect(getGalleryLayout(width - 32, brandWidth).perSide).toBe(2);
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(decodedImages.map((image) => image.year)).toEqual([2016, 2024]);
    expect(recordedAnimations.every(({ options }) => options.duration === 5_000)).toBe(true);
    advance(5_000);
    expect(gallery()).toHaveAttribute('data-phase', 'done');
  });

  it('reserves the complete measured brand height for enlarged text without changing the final center', async () => {
    cardWidth = 320;
    brandWidth = 288;
    brandHeight = 140;
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-layout', 'stacked');
    expect(gallery().style.getPropertyValue('--history-height')).toBe('250px');
    expect(gallery().style.getPropertyValue('--history-brand-width')).toBe('288px');
    const brandAnimation = recordedAnimations.find(({ node }) => node.classList.contains('fenasoja-history__brand'));
    expect(brandAnimation?.keyframes.at(-1)?.transform).toBe('translate(-50%, -50%)');
  });

  it('omits load and decode failures and uses the normal brand after a total failure', async () => {
    failedYears.add(2014);
    rejectedDecodes.add(2018);
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    expect(artworkYears()).toEqual([2016, 2024]);
    expect(recordedAnimations.every(({ options }) => options.duration === 5_000)).toBe(true);
    view.unmount();
    window.sessionStorage.clear();
    failedYears = new Set([2014, 2016, 2018, 2024]);
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    expect(artworkYears()).toEqual([]);
    expect(screen.getByRole('img', { name: 'Fenasoja 2028' })).toBeInTheDocument();
  });

  it('removes a rendered image error and rebuilds every animation using the shortened timeline duration', async () => {
    render(<FenasojaPortalHistory released />);
    await flush();
    advance(2_450);
    const failed = gallery().querySelector('[data-art="2014"] img');
    expect(failed).not.toBeNull();
    fireEvent.error(failed as HTMLElement);
    await flush();
    expect(artworkYears()).toEqual([2016, 2018, 2024]);
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
    const live = recordedAnimations.filter(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 0);
    expect(live).toHaveLength(8);
    expect(live.every(({ options, animation }) => options.duration === 6_400 && animation.currentTime === 1_050)).toBe(true);
    advance(950);
    expect(gallery()).toHaveAttribute('data-active-art', '2018');
  });

  it('keeps navigation available while images load slowly and cleans every resource on unmount', async () => {
    slowImages = true;
    const click = vi.fn();
    const view = render(<button onClick={click}><FenasojaPortalHistory released /></button>);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'waiting');
    expect(window.sessionStorage.getItem(GALLERY_SESSION_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnectedObservers.every((disconnect) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(decodedImages.every((image) => !image.onload && !image.onerror)).toBe(true);
    advance(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replay a completed session or duplicate its controller in StrictMode', async () => {
    const view = render(<StrictMode><FenasojaPortalHistory released /></StrictMode>);
    await flush();
    advance(7_800);
    expect(readGallerySession()?.status).toBe('done');
    view.unmount();
    const downloads = decodedImages.length;
    render(<StrictMode><FenasojaPortalHistory released /></StrictMode>);
    await flush();
    // React schedules a zero-delay task from the final boundary callback.
    advance(1);
    expect(gallery()).toHaveAttribute('data-phase', 'done');
    expect(decodedImages).toHaveLength(downloads);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores a partially played session after navigation without treating undecoded assets as completion', async () => {
    const view = render(<FenasojaPortalHistory released />);
    await flush();
    advance(3_125);
    view.unmount();
    expect(readGallerySession()?.elapsedMs).toBe(3_125);
    advance(50_000);
    render(<FenasojaPortalHistory released />);
    await flush();
    expect(gallery()).toHaveAttribute('data-phase', 'highlight');
    expect(gallery()).toHaveAttribute('data-active-art', '2016');
    expect(readGallerySession()?.elapsedMs).toBe(3_125);
    advance(275);
    expect(gallery()).toHaveAttribute('data-active-art', '2018');
  });
});

describe('gallery capacity and asset preparation', () => {
  it('clamps container capacity to zero through two sides and accounts for the badge width', () => {
    expect(getGalleryLayout(100, 340).perSide).toBe(0);
    expect(getGalleryLayout(738, 340).perSide).toBe(1);
    expect(getGalleryLayout(1_408, 340).perSide).toBe(2);
    expect(getGalleryLayout(738, 500).perSide).toBe(0);
    expect(selectHistoryArtworks(0).map(({ year }) => year)).toEqual([2016, 2024]);
    expect(selectHistoryArtworks(1).map(({ year }) => year)).toEqual([2016, 2024]);
    expect(selectHistoryArtworks(2).map(({ year }) => year)).toEqual([2014, 2016, 2018, 2024]);
  });

  it('keeps the artwork visible after its own highlight until the shared closing step', () => {
    const frames = artworkKeyframes(0, 4);
    expect(frames.find(({ offset }) => offset === 0)?.opacity).toBe(0);
    expect(frames.find(({ offset }) => offset === 160 / 7_800)?.opacity).toBe(0);
    expect(frames.find(({ offset }) => offset === 600 / 7_800)?.opacity).toBe(.86);
    expect(frames.find(({ offset }) => offset === 2_000 / 7_800)?.opacity).toBe(.86);
    expect(frames.find(({ offset }) => offset === 6_200 / 7_800)?.opacity).toBe(.86);
    expect(frames.find(({ offset }) => offset === 6_800 / 7_800)?.opacity).toBe(0);
  });

  it('does not instantiate an image for an already aborted preparation request', async () => {
    const abort = new AbortController();
    abort.abort();
    const image = vi.spyOn(globalThis, 'Image');
    expect(await prepareGalleryAssets(FENASOJA_HISTORY_ARTS, abort.signal)).toEqual([]);
    expect(image).not.toHaveBeenCalled();
    image.mockRestore();
  });
});
