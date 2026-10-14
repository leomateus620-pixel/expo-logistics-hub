import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import officialSymbol from '@/assets/brand/fenasoja-symbol-144.webp';
import { selectHistoryArtworks, type FenasojaHistoryArt } from './history/artCatalog';
import { getGalleryLayout } from './history/galleryLayout';
import { prepareGalleryAssets } from './history/prepareGalleryAssets';
import { artworkKeyframes, highlightKeyframes } from './history/galleryAnimation';
import {
  createGalleryTimeline, readGallerySession, GALLERY_REVEAL_MS, GALLERY_HIGHLIGHT_MS,
  type GallerySnapshot, type GalleryTimeline,
} from './history/galleryTimeline';
import '@/styles/portal-history.css';

interface Props { released: boolean; paused?: boolean }
const waiting: GallerySnapshot = {
  phase: 'waiting', activeIndex: -1, artIds: [], elapsedMs: 0,
  phaseElapsedMs: 0, durationMs: 0, running: false,
};

export function FenasojaPortalHistory({ released, paused = false }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const brandRef = useRef<HTMLSpanElement>(null);
  const clock = useRef<GalleryTimeline | null>(null);
  const animations = useRef<Animation[]>([]);
  const [touchPresentation, setTouchPresentation] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const [layout, setLayout] = useState(() => ({ ...getGalleryLayout(0, 0), measured: false, brandWidth: 0, brandHeight: 0, inset: 16 }));
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [saveData, setSaveData] = useState(() => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData));
  const [motionSupported] = useState(() => typeof Element.prototype.animate === 'function');
  const [sessionDone] = useState(() => readGallerySession()?.status === 'done');
  const [prepared, setPrepared] = useState(false);
  const [arts, setArts] = useState<readonly FenasojaHistoryArt[]>([]);
  const [snapshot, setSnapshot] = useState<GallerySnapshot>(sessionDone ? { ...waiting, phase: 'done' } : waiting);
  const fullSelection = layout.perSide >= 2;
  const selected = useMemo(() => selectHistoryArtworks(fullSelection ? 2 : 1), [fullSelection]);
  const chosenIds = useMemo(() => new Set(selected.map((art) => art.id)), [selected]);
  const artIds = useMemo(() => arts.filter((art) => chosenIds.has(art.id)).map((art) => art.id), [arts, chosenIds]);
  const artIdsRef = useRef(artIds);
  artIdsRef.current = artIds;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const brand = brandRef.current;
    if (!host || !brand) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const inset = host.clientWidth < 512 ? 16 : 48;
      const width = host.clientWidth - inset * 2;
      // Measure the full real lockup, including the edition badge; never infer it from text length.
      const brandWidth = brand.firstElementChild?.getBoundingClientRect().width ?? 0;
      const brandHeight = brand.firstElementChild?.getBoundingClientRect().height ?? 0;
      const capacity = getGalleryLayout(width, brandWidth);
      const next = { ...capacity, perSide: touchPresentation ? Math.min(1, capacity.perSide) : capacity.perSide, measured: true, brandWidth, brandHeight, inset };
      setLayout((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(host);
    observer?.observe(brand);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { disposed = true; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [touchPresentation]);

  useEffect(() => {
    const host = hostRef.current;
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      const onScreen = entry.isIntersecting && entry.intersectionRatio >= .5;
      if (!onScreen) clock.current?.pause();
      setVisible(onScreen);
    }, { threshold: [0, .5] }) : null;
    if (host) observer?.observe(host);
    if (!observer) setVisible(true);
    const pointerMedia = window.matchMedia?.('(pointer: coarse)');
    const onPointer = () => setTouchPresentation(pointerMedia?.matches ?? false);
    pointerMedia?.addEventListener?.('change', onPointer);
    const onVisibility = () => {
      const onPage = document.visibilityState !== 'hidden';
      if (!onPage) clock.current?.pause();
      setPageVisible(onPage);
    };
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const onConnection = () => setSaveData(Boolean(connection?.saveData));
    document.addEventListener('visibilitychange', onVisibility);
    // A tab can become visible between render and effect subscription.
    onVisibility();
    connection?.addEventListener('change', onConnection);
    return () => {
      observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
      pointerMedia?.removeEventListener?.('change', onPointer);
      connection?.removeEventListener('change', onConnection);
    };
  }, []);

  useEffect(() => {
    if (!layout.measured || sessionDone || saveData || !motionSupported) return;
    const abort = new AbortController();
    void prepareGalleryAssets(selected, abort.signal).then((valid) => {
      if (!abort.signal.aborted) { setArts(valid); setPrepared(true); }
    });
    return () => abort.abort();
  }, [selected, layout.measured, sessionDone, saveData, motionSupported]);

  const validKey = artIds.join(',');
  useEffect(() => {
    if (!prepared || sessionDone || saveData) return;
    const controller = createGalleryTimeline({ artIds: artIdsRef.current, onChange: setSnapshot });
    clock.current = controller;
    setSnapshot(controller.getSnapshot());
    return () => { controller.dispose(); if (clock.current === controller) clock.current = null; };
  }, [prepared, sessionDone, saveData]);

  useEffect(() => { clock.current?.reconfigure(artIds); }, [artIds]);

  useEffect(() => {
    const controller = clock.current;
    if (!controller) return;
    const synchronize = () => {
      if (released && visible && pageVisible && document.visibilityState !== 'hidden' && !paused && !saveData) controller.resume();
      else controller.pause();
    };
    const freeze = () => controller.pause();
    synchronize();
    window.addEventListener('pagehide', freeze);
    window.addEventListener('pageshow', synchronize);
    return () => { window.removeEventListener('pagehide', freeze); window.removeEventListener('pageshow', synchronize); };
  }, [released, visible, pageVisible, paused, saveData, validKey, prepared]);

  const shown = snapshot.artIds.filter((id) => chosenIds.has(id)).map((id) => arts.find((art) => art.id === id)).filter((art): art is FenasojaHistoryArt => Boolean(art));
  const shownKey = shown.map((art) => art.id).join(',');
  const shownCount = shown.length;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || saveData || !shownCount || typeof host.animate !== 'function') return;
    const duration = snapshot.durationMs;
    const options: KeyframeAnimationOptions = { duration, fill: 'both', easing: 'linear' };
    const items: Animation[] = [];
    host.querySelectorAll<HTMLElement>('.fenasoja-history__art').forEach((node, index) => {
      items.push(node.animate(artworkKeyframes(index, shownCount), options));
      const halo = node.querySelector<HTMLElement>('.fenasoja-history__halo');
      if (halo) items.push(halo.animate(highlightKeyframes(index, shownCount), options));
    });
    const closing = GALLERY_REVEAL_MS + shownCount * GALLERY_HIGHLIGHT_MS;
    const brand = brandRef.current;
    if (brand) items.push(brand.animate([
      { offset: 0, transform: 'translate(-50%, -50%)' },
      { offset: 160 / duration, transform: `translate(-50%, calc(-50% - ${layout.stacked ? 42 : 0}px))` },
      { offset: closing / duration, transform: `translate(-50%, calc(-50% - ${layout.stacked ? 42 : 0}px))` },
      { offset: (closing + 600) / duration, transform: `translate(-50%, calc(-50% - ${layout.stacked ? 42 : 0}px))` },
      { offset: (closing + 1100) / duration, transform: 'translate(-50%, -50%)' },
      { offset: 1, transform: 'translate(-50%, -50%)' },
    ], options));
    const glow = host.querySelector<HTMLElement>('.fenasoja-history__brand-glow');
    if (glow) items.push(glow.animate([
      { offset: 0, opacity: 0 }, { offset: closing / duration, opacity: 0 },
      { offset: (closing + 650) / duration, opacity: .8 }, { offset: 1, opacity: .35 },
    ], options));
    items.forEach((animation) => { animation.pause(); animation.currentTime = clock.current?.getSnapshot().elapsedMs ?? 0; });
    animations.current = items;
    return () => { items.forEach((animation) => animation.cancel()); animations.current = []; };
  }, [shownKey, shownCount, layout.stacked, saveData, snapshot.durationMs]);

  useLayoutEffect(() => {
    animations.current.forEach((animation) => {
      animation.currentTime = snapshot.elapsedMs;
      if (snapshot.running) animation.play(); else animation.pause();
    });
  }, [snapshot, shownKey, layout.stacked]);

  const active = !saveData && snapshot.phase !== 'waiting' && snapshot.phase !== 'done';
  const split = Math.ceil(shown.length / 2);
  const style = {
    '--history-inset': `${layout.inset}px`, '--history-slot': `${layout.slotWidth}px`, '--history-brand-width': `${layout.brandWidth}px`,
    '--history-height': `${Math.max(174, layout.brandHeight + 110)}px`,
    '--history-gap': `${layout.gap}px`, '--history-clearance': `${layout.centralClearance}px`,
  } as CSSProperties;
  return (
    <span ref={hostRef} className="fenasoja-history" style={style}
      data-testid="portal-history" data-ready={released && visible && pageVisible} data-layout={layout.stacked ? 'stacked' : 'inline'}
      data-phase={saveData || !motionSupported ? 'done' : snapshot.phase} data-running={snapshot.running}
      data-active-art={snapshot.activeIndex >= 0 ? shown[snapshot.activeIndex]?.year : undefined}
      data-gallery-motion="canonical" data-active={active}>
      <span className="fenasoja-history__brand-glow" aria-hidden="true" />
      <span ref={brandRef} className="fenasoja-history__brand">
        <FenasojaBrand markSrc={officialSymbol} tone="dark" editionLabel={false} />
      </span>
      <span className="fenasoja-history__gallery" aria-hidden="true">
        <svg className="fenasoja-history__connection" viewBox="0 0 1000 100" preserveAspectRatio="none" focusable="false">
          <path d="M 8 94 H 992" fill="none" stroke="currentColor" strokeWidth=".7" vectorEffect="non-scaling-stroke" />
        </svg>
        {['left', 'right'].map((side, sideIndex) => (
          <span className={`fenasoja-history__side fenasoja-history__side--${side}`} key={side}>
            {shown.slice(sideIndex === 0 ? 0 : split, sideIndex === 0 ? split : shown.length).map((art) => (
              <span className="fenasoja-history__art" key={art.id} data-art={art.year}>
                <span className="fenasoja-history__halo" />
                <img src={art.src} srcSet={art.srcSet} sizes="108px" width={art.width} height={art.height}
                  alt={art.alt} decoding="async" draggable={false}
                  onError={() => setArts((current) => current.filter((item) => item.id !== art.id))} />
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
