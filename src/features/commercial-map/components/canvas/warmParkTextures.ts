import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { captureCommercialMapStageRecorder } from '../../utils/performanceDiagnostics';
import { scheduleCommercialMapSceneTask } from './DeferredSceneLayer';

const paths = {
  grass: '/maps/materials/warm-grass-v2.webp',
  woodland: '/maps/materials/warm-woodland-v1.webp',
  metal: '/maps/materials/warm-metal-v1.webp',
  interiorFloor: '/maps/materials/warm-interior-floor-v1.webp',
  cover: '/maps/materials/woodland-cover-v1.png',
} as const;
type Kind = keyof typeof paths;
type Resource = {
  texture: THREE.Texture | null;
  listeners: Set<(texture: THREE.Texture) => void>;
  pending: boolean;
  decoded?: THREE.Texture;
  decodeMs?: number;
  cancel?: () => void;
};
const caches = new WeakMap<THREE.WebGLRenderer, Map<Kind, Resource>>();

function subscribe(gl: THREE.WebGLRenderer, kind: Kind, changed: (t: THREE.Texture) => void) {
  let cache = caches.get(gl);
  if (!cache) caches.set(gl, cache = new Map());
  let resource = cache.get(kind);
  if (!resource) cache.set(kind, resource = { texture: null, listeners: new Set(), pending: false });
  const entry = resource;
  entry.listeners.add(changed);
  if (entry.texture) changed(entry.texture);
  else if (!entry.pending) {
    entry.pending = true;
    const record = captureCommercialMapStageRecorder();
    const scheduleUpload = (texture: THREE.Texture) => {
      if (!entry.listeners.size) { entry.pending = false; return; }
      entry.cancel = scheduleCommercialMapSceneTask(gl.domElement, {
        id: 'appearance-upload-' + kind, priority: 3,
        run(done) {
          entry.cancel = undefined;
          entry.pending = false;
          const started = performance.now();
          try {
            gl.initTexture(texture);
            record('appearance:' + kind + ':ready', { decodeMs: entry.decodeMs,
              uploadSubmissionMs: performance.now() - started });
            entry.texture = texture;
            entry.listeners.forEach(listener => listener(texture));
          } catch {
            // Context loss during an optional upload must keep the base surface usable.
            record('appearance:' + kind + ':upload-failed', { failed: true });
          } finally { done(); }
        },
      });
    };
    if (entry.decoded) scheduleUpload(entry.decoded);
    else entry.cancel = scheduleCommercialMapSceneTask(gl.domElement, {
      id: 'appearance-fetch-' + kind, priority: 2,
      run(complete) {
        entry.cancel = undefined;
        // A network wait must not hold the shared queue or suspend the Canvas.
        complete();
        new THREE.TextureLoader().load(paths[kind], async texture => {
          texture.name = 'park-natural-' + kind;
          texture.colorSpace = kind === 'cover' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = kind === 'cover' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
          const started = performance.now();
          try {
            await (texture.image as HTMLImageElement).decode();
            entry.decodeMs = performance.now() - started;
            entry.decoded = texture;
            scheduleUpload(texture);
          } catch {
            texture.dispose();
            entry.pending = false;
          }
        }, undefined, () => { entry.pending = false; });
      },
    });
  }
  return () => {
    entry.listeners.delete(changed);
    if (!entry.listeners.size && entry.cancel) {
      entry.cancel(); entry.cancel = undefined; entry.pending = false;
    }
  };
}

/** Native decode and one idle upload per map context. The default material
 * remains renderable throughout loading, including when a request fails. */
export function useWarmParkTexture(kind: Kind, enabled: boolean) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const [loaded, setLoaded] = useState<{ gl: THREE.WebGLRenderer; kind: Kind; texture: THREE.Texture }>();
  useEffect(() => {
    if (!enabled) return;
    return subscribe(gl, kind, texture => {
      setLoaded({ gl, kind, texture });
      invalidate();
    });
  }, [enabled, gl, invalidate, kind]);
  return enabled && loaded?.gl === gl && loaded.kind === kind ? loaded.texture : null;
}
