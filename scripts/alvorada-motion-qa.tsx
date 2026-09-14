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

function runtime() {
  const canvas = document.querySelector('canvas');
  return canvas ? _roots.get(canvas)?.store.getState() : undefined;
}

let lastReadback: Record<string, unknown> | null = null;

// Read-only evidence at visual checkpoints, never in the native frame loop.
function graphicsSnapshot() {
  const state = runtime();
  if (!state) return null;
  const { gl, scene, camera } = state;
  const context = gl.getContext();
  const programs = (gl.info.programs ?? []).map(program => {
    const values: Record<string, unknown> = {};
    const count = context.getProgramParameter(program.program, context.ACTIVE_UNIFORMS);
    for (let index = 0; index < count; index += 1) {
      const info = context.getActiveUniform(program.program, index);
      if (!info || !/^(viewMatrix|projectionMatrix|cameraPosition|modelMatrix|modelViewMatrix|cloudOffset|sunDirection|detailMix|nightMix|normalMix|cloudMix|opacity)$/.test(info.name)) continue;
      const value = context.getUniform(program.program, context.getUniformLocation(program.program, info.name));
      values[info.name] = ArrayBuffer.isView(value) ? Array.from(value as Float32Array) : value;
    }
    return values;
  });
  const earth = scene.getObjectByName('AlvoradaCanonicalSurface');
  return {
    viewport: Array.from(context.getParameter(context.VIEWPORT)),
    scissor: Array.from(context.getParameter(context.SCISSOR_BOX)),
    drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
    pixelRatio: gl.getPixelRatio(),
    cameraWorld: camera.matrixWorld.toArray(), cameraView: camera.matrixWorldInverse.toArray(),
    projection: camera.projectionMatrix.toArray(), cameraParent: camera.parent?.type ?? null,
    earthWorld: earth?.matrixWorld.toArray(), toneMappingExposure: gl.toneMappingExposure,
    originNdc: camera.position.clone().set(0, 0, 0).project(camera).toArray(), programs,
    readback: lastReadback,
  };
}

function Fixture() {
  const [started, start] = useState(new URLSearchParams(location.search).has('cold'));
  Object.assign(window, { __alvoradaMotionQA: {
    start: () => start(true), warm: warmVisualAssets, diagnostic: collectAlvoradaDiagnostic,
    flush: () => {
      const state = runtime();
      if (state) { state.advance(performance.now(), true); state.gl.getContext().finish(); }
    },
    // QA only: encode the actual screen framebuffer in the rendering task.
    // WebGL2 read and draw framebuffer bindings are independent. Postprocessing
    // may leave READ_FRAMEBUFFER on a floating-point target even after drawing
    // the final composition to screen; read that screen explicitly and restore
    // all changed read state. No renderer/quality/camera setting is changed.
    // The 2D canvas only encodes unchanged RGBA pixels with row-order conversion.
    // Native cold/live-toggle scenarios never use this hook or a paused clock.
    captureDrawingBuffer: async () => {
      const state = runtime();
      const canvas = state?.gl.domElement;
      if (!canvas || !state) return null;
      const style = getComputedStyle(canvas);
      if (style.display === 'none' || style.visibility !== 'visible') {
        throw new Error('Canonical canvas is hidden during visual capture');
      }
      state.advance(performance.now(), true);
      const context = state.gl.getContext() as WebGL2RenderingContext;
      context.finish();
      if (state.gl.getRenderTarget() !== null) throw new Error('Composer has not presented to the screen');
      const priorErrors: number[] = [];
      for (let index = 0; index < 16; index += 1) {
        const error = context.getError();
        if (error === context.NO_ERROR) break;
        priorErrors.push(error);
      }
      const previousReadFramebuffer = context.getParameter(context.READ_FRAMEBUFFER_BINDING);
      const previousReadBuffer = context.getParameter(context.READ_BUFFER);
      const width = context.drawingBufferWidth;
      const height = context.drawingBufferHeight;
      const rgba = new Uint8Array(width * height * 4);
      let readError = context.NO_ERROR as number;
      try {
        context.bindFramebuffer(context.READ_FRAMEBUFFER, null);
        context.readBuffer(context.BACK);
        context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, rgba);
        readError = context.getError();
      } finally {
        context.bindFramebuffer(context.READ_FRAMEBUFFER, previousReadFramebuffer);
        context.readBuffer(previousReadBuffer);
      }
      lastReadback = { priorErrors, readError, previousReadFramebufferDefault: previousReadFramebuffer === null,
        previousReadBuffer, width, height };
      if (readError !== context.NO_ERROR) {
        throw new Error(`Framebuffer readback failed: ${JSON.stringify(lastReadback)}`);
      }
      const topDown = new Uint8ClampedArray(rgba.length);
      const stride = width * 4;
      for (let y = 0; y < height; y += 1) {
        const from = (height - y - 1) * stride;
        topDown.set(rgba.subarray(from, from + stride), y * stride);
      }
      const encoder = document.createElement('canvas');
      encoder.width = width; encoder.height = height;
      const encoderContext = encoder.getContext('2d');
      if (!encoderContext) throw new Error('PNG encoder unavailable');
      encoderContext.putImageData(new ImageData(topDown, width, height), 0, 0);
      const dataUrl = encoder.toDataURL('image/png');
      const image = new Image();
      image.dataset.qaDrawingBuffer = 'true';
      image.alt = '';
      Object.assign(image.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        pointerEvents: 'none', opacity: style.opacity, transform: style.transform, filter: style.filter,
      });
      image.src = dataUrl;
      await image.decode();
      canvas.parentElement?.appendChild(image);
      return dataUrl;
    },
    sample: (includeGraphics = false) => {
      const state = runtime();
      const camera = state?.camera;
      return { canvas: state ? { ...state.gl.domElement.dataset } : null,
        camera: camera ? { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
          fov: 'fov' in camera ? camera.fov : null } : null,
        ...(includeGraphics ? { graphics: graphicsSnapshot() } : {}),
      };
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
