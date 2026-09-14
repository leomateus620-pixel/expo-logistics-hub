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
