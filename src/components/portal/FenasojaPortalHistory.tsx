import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import officialSymbol from '@/assets/brand/fenasoja-symbol-144.webp';
import { FENASOJA_HISTORY_ARTS } from './history/artCatalog';
import { getGalleryLayout } from './history/galleryLayout';
import { getGalleryCopies, getGalleryTrackKeyframes, reverseChronologicalGroup } from './history/galleryAnimation';
import { createGalleryAssetPreparer, getGalleryAssetWindow, type GalleryAssetPreparer, type GalleryAssetsSnapshot } from './history/prepareGalleryAssets';
import { createGalleryTimeline, readGallerySession, type GallerySnapshot, type GalleryTimeline } from './history/galleryTimeline';
import '@/styles/portal-history.css';

interface Props {
  released: boolean;
  paused?: boolean;
  userPaused?: boolean;
  onMotionAvailable?: (available: boolean) => void;
}
const emptyAssets: GalleryAssetsSnapshot = { ready: [], failed: [] };
const prefers = (query: string) => window.matchMedia?.(query).matches ?? false;
const connection = () => (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;

export function FenasojaPortalHistory({ released, paused = false, userPaused, onMotionAvailable }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const brandRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const groupRef = useRef<HTMLSpanElement>(null);
  const clock = useRef<GalleryTimeline | null>(null);
  const preparer = useRef<GalleryAssetPreparer | null>(null);
  const [restored] = useState(readGallerySession);
  const requestedPause = userPaused ?? restored?.userPaused ?? false;
  const [compact, setCompact] = useState(() => prefers('(pointer: coarse)'));
  const [reduced, setReduced] = useState(() => prefers('(prefers-reduced-motion: reduce)'));
  const [saveData, setSaveData] = useState(() => Boolean(connection()?.saveData));
  const [supported] = useState(() => typeof Element.prototype.animate === 'function');
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [geometry, setGeometry] = useState({ width: 0, brandWidth: 0, brandHeight: 0, measured: false });
  const [groupLength, setGroupLength] = useState(0);
  const [assets, setAssets] = useState<GalleryAssetsSnapshot>(emptyAssets);
  const [snapshot, setSnapshot] = useState<GallerySnapshot | null>(null);
  const [revealed, setRevealed] = useState(false);
  const enabled = supported && !reduced && !saveData;
  const layout = getGalleryLayout(geometry.width, undefined, compact || geometry.width < 600);
  const height = Math.max(layout.headerHeight, geometry.brandHeight + 32);
  const sizes = `${layout.slotWidth}px`;
  const readyIds = useMemo(() => new Set(assets.ready), [assets.ready]);
  const failedIds = useMemo(() => new Set(assets.failed), [assets.failed]);
  const arts = useMemo(() => FENASOJA_HISTORY_ARTS.filter((art) => !failedIds.has(art.id)), [failedIds]);
  const ids = useMemo(() => arts.map((art) => art.id), [arts]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const key = ids.join(',');
  const step = groupLength > 0 && ids.length ? groupLength / ids.length : layout.stepPx;
  const position = snapshot?.positionUnits ?? restored?.positionUnits ?? 0;
  const required = getGalleryAssetWindow(ids, position, geometry.width, step, 1);
  const windowIds = getGalleryAssetWindow(ids, position, geometry.width, step, 3);
  const windowKey = windowIds.join(',');
  const buffered = ids.length > 0 && required.every((id) => readyIds.has(id));
  const group = reverseChronologicalGroup(arts);
  const copies = getGalleryCopies(geometry.width, groupLength || ids.length * layout.stepPx, step);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const brand = brandRef.current;
    if (!host || !brand) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const box = brand.firstElementChild?.getBoundingClientRect();
      const next = { width: host.clientWidth, brandWidth: box?.width ?? 0, brandHeight: box?.height ?? 0, measured: true };
      setGeometry((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(host);
    observer?.observe(brand);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { disposed = true; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      const onScreen = entry.isIntersecting && entry.intersectionRatio >= .5;
      if (!onScreen) clock.current?.pause();
      setVisible(onScreen);
    }, { threshold: [0, .5] }) : null;
    if (host) observer?.observe(host);
    if (!observer) setVisible(true);
    const onVisibility = () => {
      const onPage = document.visibilityState !== 'hidden';
      if (!onPage) clock.current?.pause();
      setPageVisible(onPage);
    };
    const pointer = window.matchMedia?.('(pointer: coarse)');
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPointer = () => setCompact(pointer?.matches ?? false);
    const onMotion = () => { if (motion?.matches) clock.current?.pause(); setReduced(motion?.matches ?? false); };
    const network = connection();
    const onNetwork = () => { if (network?.saveData) clock.current?.pause(); setSaveData(Boolean(network?.saveData)); };
    pointer?.addEventListener?.('change', onPointer);
    motion?.addEventListener?.('change', onMotion);
    network?.addEventListener?.('change', onNetwork);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility);
      pointer?.removeEventListener?.('change', onPointer);
      motion?.removeEventListener?.('change', onMotion);
      network?.removeEventListener?.('change', onNetwork);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !geometry.measured) return;
    setAssets(emptyAssets);
    setRevealed(false);
    const loader = createGalleryAssetPreparer({ arts: FENASOJA_HISTORY_ARTS, sizes, onChange: setAssets });
    preparer.current = loader;
    return () => { loader.dispose(); if (preparer.current === loader) preparer.current = null; };
    // Geometry changes update sizes/window below; they must not discard decoded editions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, geometry.measured]);

  useEffect(() => {
    preparer.current?.setSizes(sizes);
    if (visible && pageVisible) preparer.current?.request(windowIds);
  }, [sizes, windowKey, enabled, visible, pageVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!enabled || !geometry.measured) return;
    const controller = createGalleryTimeline({ artIds: idsRef.current, stepPx: layout.stepPx, speedPxPerSecond: layout.speedPxPerSecond, onChange: setSnapshot });
    clock.current = controller;
    setSnapshot(controller.getSnapshot());
    return () => { controller.dispose(); if (clock.current === controller) clock.current = null; };
    // Reconfiguration retains the visible edition and fraction instead of starting another controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, geometry.measured]);

  useLayoutEffect(() => {
    const measured = groupRef.current?.getBoundingClientRect().width ?? 0;
    if (measured > 0) setGroupLength(measured);
    else setGroupLength(0);
  }, [key, layout.slotWidth, layout.gap, enabled]);

  useLayoutEffect(() => {
    if (ids.length > 0 && !groupLength) return;
    clock.current?.reconfigure({ artIds: ids, stepPx: step, speedPxPerSecond: layout.speedPxPerSecond });
  }, [key, groupLength, step, layout.speedPxPerSecond, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const track = trackRef.current;
    const controller = clock.current;
    if (!enabled || !track || !controller || !groupLength || !snapshot?.durationMs) return;
    const animation = track.animate(getGalleryTrackKeyframes(groupLength, step), {
      duration: groupLength / layout.speedPxPerSecond * 1000, easing: 'linear', iterations: Infinity, fill: 'both',
    });
    controller.attachAnimation(animation);
    return () => controller.attachAnimation(null);
  }, [enabled, groupLength, step, key, layout.speedPxPerSecond, snapshot?.durationMs]);

  useEffect(() => {
    const controller = clock.current;
    if (!controller) return;
    controller.setUserPaused(requestedPause);
    const synchronize = () => {
      if (enabled && released && visible && pageVisible && document.visibilityState !== 'hidden' && !paused && buffered && groupLength > 0) {
        controller.resume();
        setRevealed(true);
      } else controller.pause();
    };
    const freeze = () => controller.pause();
    synchronize();
    window.addEventListener('pagehide', freeze);
    window.addEventListener('pageshow', synchronize);
    return () => { window.removeEventListener('pagehide', freeze); window.removeEventListener('pageshow', synchronize); };
  }, [enabled, released, visible, pageVisible, paused, requestedPause, buffered, groupLength, key]);

  useEffect(() => { onMotionAvailable?.(enabled && assets.ready.length > 0 && ids.length > 0); }, [onMotionAvailable, enabled, assets.ready.length, ids.length]);

  const style = {
    '--history-height': `${height}px`, '--history-brand-width': `${geometry.brandWidth}px`,
    '--history-slot': `${layout.slotWidth}px`, '--history-art-height': `${layout.artHeight}px`, '--history-gap': `${layout.gap}px`,
  } as CSSProperties;
  return (
    <span ref={hostRef} className="fenasoja-history" style={style} data-testid="portal-history"
      data-layout="continuous" data-mode={enabled ? 'loop' : 'static'} data-phase={enabled ? snapshot?.phase ?? 'waiting' : 'static'}
      data-ready={released && visible && pageVisible} data-buffered={buffered} data-released={released} data-visible={visible} data-page-visible={pageVisible}
      data-running={enabled && snapshot?.running} data-art-count={enabled ? arts.length : 0}
      data-speed={layout.speedPxPerSecond} data-group-length={groupLength} data-duration={groupLength / layout.speedPxPerSecond * 1000}
      data-position={snapshot?.positionUnits ?? position} data-revealed={enabled && revealed}>
      {enabled && <span className="fenasoja-history__viewport" aria-hidden="true">
        <span ref={trackRef} className="fenasoja-history__track">
          {Array.from({ length: copies }, (_, copy) => <span ref={copy === 0 ? groupRef : undefined} className="fenasoja-history__group" data-clone={copy > 0} key={copy}>
            {group.map((art) => <span className="fenasoja-history__art" key={art.id} data-art={art.year} data-edition={art.editionNumber}>
              {readyIds.has(art.id) && <img src={art.src} srcSet={art.srcSet} sizes={sizes} width={art.width} height={art.height}
                alt={art.alt} decoding="async" draggable={false} onError={() => preparer.current?.fail(art.id)} />}
            </span>)}
          </span>)}
        </span>
      </span>}
      <span className="fenasoja-history__shield" aria-hidden="true" />
      <span ref={brandRef} className="fenasoja-history__brand">
        <FenasojaBrand markSrc={officialSymbol} tone="dark" editionLabel={false} />
      </span>
    </span>
  );
}
