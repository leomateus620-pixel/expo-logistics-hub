// Isolated QA entry, not an authenticated route or a production runtime switch.
import { useState } from 'react';
import { _roots } from '@react-three/fiber';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FenasojaPortalHero } from '../src/components/portal/FenasojaPortalHero';
import { collectAlvoradaDiagnostic } from '../src/features/alvorada/diagnostics';
import { getAlvoradaQualityProfile } from '../src/features/alvorada/capabilities';
import { getEarthTextureUrls } from '../src/features/alvorada/earthAssets';
import { loadAlvoradaText, ALVORADA_CRITICAL_GEODATA } from '../src/features/alvorada/alvoradaAssets';
import { versionAlvoradaAsset } from '../src/features/alvorada/assetVersion';
import '../src/index.css';
import '../src/styles/commission-portal.css';

async function warmVisualAssets() {
  const { loadAlvoradaTexture } = await import('../src/features/alvorada/alvoradaTextures');
  await import('../src/features/alvorada/AlvoradaIntro');
  await Promise.all([
    ...getEarthTextureUrls(getAlvoradaQualityProfile().textureTier === 'mobile').map(url => loadAlvoradaTexture(url)),
    ...ALVORADA_CRITICAL_GEODATA.map(url => loadAlvoradaText(url)),
    ...['soy-harvest-dawn.webp', 'soy-harvest-dawn-mobile.webp', 'fenasoja-symbol-official.png'].map(async file => {
      const image = new Image(); image.src = versionAlvoradaAsset(`/alvorada/${file}`); await image.decode();
    }),
    document.fonts.ready,
  ]);
}

function Fixture() {
  const [started, start] = useState(new URLSearchParams(location.search).has('cold'));
  Object.assign(window, { __alvoradaMotionQA: {
    start: () => start(true), warm: warmVisualAssets, diagnostic: collectAlvoradaDiagnostic,
    // With the test clock paused, flush the same frame through the REAL R3F
    // subscribers/composer, then wait for GPU completion. WebKit screenshots
    // otherwise race its compositor and may read a stale/blank drawing buffer.
    // This hook is absent from the application bundle and never changes time.
    flush: () => {
      const canvas = document.querySelector('canvas');
      const state = canvas ? _roots.get(canvas)?.store.getState() : undefined;
      if (state) { state.advance(performance.now(), true); state.gl.getContext().finish(); }
    },
    // QA only: read the REAL R3F camera; never replace it or control the timeline.
    // A paused non-preserving WebGL canvas can be empty in WebKit page snapshots.
  // Capture the REAL composer output synchronously after its normal render loop
  // and hold only that raster while Playwright composites the DOM screenshot.
  // Never used in production or in the native/cold/live-toggle lifecycle tests.
  // https://threejs.org/manual/en/tips.html#taking-a-screenshot-of-the-canvas
  captureDrawingBuffer: async () => {
    const canvas = document.querySelector('canvas');
    const state = canvas ? _roots.get(canvas)?.store.getState() : undefined;
    if (!canvas || !state) return null;
    const style = getComputedStyle(canvas);
    if (style.display === 'none' || style.visibility !== 'visible') {
      throw new Error('Canonical canvas is hidden during visual capture');
    }
    state.advance(performance.now(), true);
    state.gl.getContext().finish();
    // Must stay in the same JS task as rendering; no changed renderer settings.
    const dataUrl = canvas.toDataURL('image/png');
    const image = new Image();
    image.dataset.qaDrawingBuffer = 'true';
    image.alt = '';
    Object.assign(image.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', opacity: style.opacity, transform: style.transform,
      filter: style.filter,
    });
    image.src = dataUrl;
    await image.decode();
    canvas.parentElement?.appendChild(image);
    return dataUrl;
  },
  sample: () => {
      const canvas = document.querySelector('canvas');
      const state = canvas ? _roots.get(canvas)?.store.getState() : undefined;
      const camera = state?.camera;
      return { canvas: canvas ? { ...canvas.dataset } : null,
        camera: camera ? { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
          fov: 'fov' in camera ? camera.fov : null } : null };
    },
  } });
  return <MemoryRouter><div className="fenasoja-portal">
    <main className="fenasoja-portal__shell">
      {started && <FenasojaPortalHero />}
      <button className="fenasoja-portal__admin" data-testid="outside-motion"
        style={{ transitionDuration: '2s' }}>Controle fora da Alvorada</button>
    </main>
  </div></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
