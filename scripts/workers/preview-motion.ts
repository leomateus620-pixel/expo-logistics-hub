/** Synthetic motion preference for the loopback QA entrypoint only.
 * Never imported by application routes or the production build. */
export type PreviewMotionMode = 'system' | 'full';
interface PreviewSurface {
  location: Pick<Location, 'hostname'>;
  document: Document;
  matchMedia: Window['matchMedia'];
}

export function configurePreviewMotion(surface: PreviewSurface, params: URLSearchParams): PreviewMotionMode {
  if (params.get('motion') !== 'full') return 'system';
  if (!['127.0.0.1', 'localhost'].includes(surface.location.hostname)) throw new Error('Motion fixture requires loopback.');
  if (surface.document.documentElement.dataset.workersPreviewMotion === 'full') return 'full';
  const nativeMatchMedia = surface.matchMedia.bind(surface);
  surface.matchMedia = (query: string): MediaQueryList => {
    if (!/^\(prefers-reduced-motion(?::reduce)?\)$/.test(query.replace(/\s+/g, '').toLowerCase())) return nativeMatchMedia(query);
    // Fixed synthetic preference: there are no preference-change events in this fixture.
    return { matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  };
  surface.document.documentElement.dataset.workersPreviewMotion = 'full';
  // CSS media queries still see the real system preference. Restore only these
  // three preview dots, using the production keyframes and active/paused state.
  const style = surface.document.createElement('style');
  style.dataset.workersPreviewMotion = 'full';
  const dots = 'html[data-workers-preview-motion="full"] .workers-scope .worker-response-identity:has(.worker-mascot[data-active="true"]) .worker-response-dots>span';
  style.textContent = `${dots}{animation:worker-response-dot 1.5s ease-in-out infinite!important}${dots}:nth-child(2){animation-delay:.18s!important}${dots}:nth-child(3){animation-delay:.36s!important}`;
  surface.document.head.append(style);
  return 'full';
}
