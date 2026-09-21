import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createPublicContextMaterialPool } from '../../utils/publicContextMaterials';
import { usePublicScenePolicy } from './PublicScenePolicyContext';

const PoolContext = createContext<ReturnType<typeof createPublicContextMaterialPool> | null>(null);

export function PublicMaterialPool({ children }: { children: ReactNode }) {
  const pool = useMemo(createPublicContextMaterialPool, []);
  return <PoolContext.Provider value={pool}>{children}</PoolContext.Provider>;
}

/** Context uses a render-only layer. No raycast reaches its geometry. Active
 * entities stay outside this wrapper. Newly admitted details inherit the policy. */
export function PublicContextGroup({ children, active = false }: { children: ReactNode; active?: boolean }) {
  const policy = usePublicScenePolicy();
  const pool = useContext(PoolContext);
  const group = useRef<THREE.Group>(null);
  const camera = useThree(state => state.camera);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    if (!policy || active || !pool || !group.current) return;
    const records = new Map<THREE.Object3D, { mask: number; originals?: THREE.Material[]; variants?: THREE.Material[]; array: boolean }>();
    let mounted = true;
    camera.layers.enable(2);
    const visit = (object: THREE.Object3D) => {
      if (!mounted) return;
      if (object !== group.current && (object.userData.publicActive || object.userData.publicContextBoundary)) return;
      if (!records.has(object)) {
        const mesh = object as THREE.Mesh;
        const originals = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : undefined;
        const variants = originals?.map(material => pool.acquire(material));
        records.set(object, { mask: object.layers.mask, originals, variants, array: Array.isArray(mesh.material) });
        object.layers.set(2);
        if (variants) mesh.material = Array.isArray(mesh.material) ? variants : variants[0];
        object.addEventListener('childadded', added);
        object.addEventListener('childremoved', removed);
      }
      object.children.forEach(visit);
    };
    const release = (object: THREE.Object3D) => {
      const record = records.get(object);
      if (!record) return;
      object.removeEventListener('childadded', added);
      object.removeEventListener('childremoved', removed);
      object.layers.mask = record.mask;
      if (record.originals) (object as THREE.Mesh).material = record.array ? record.originals : record.originals[0];
      record.variants?.forEach(material => pool.release(material));
      records.delete(object);
      object.children.forEach(release);
    };
    function added(event: { child: THREE.Object3D }) {
      // Three reuses/clears its event object after dispatch.
      const child = event.child;
      queueMicrotask(() => { if (mounted && child.parent) { visit(child); invalidate(); } });
    }
    function removed(event: { child: THREE.Object3D }) { release(event.child); }
    visit(group.current);
    invalidate();
    return () => { mounted = false; [...records.keys()].forEach(release); };
  }, [active, camera, invalidate, policy, pool]);
  return <group ref={group} userData={{ publicContextBoundary: true, publicActive: active }} name={policy && !active ? 'public-grayscale-context' : undefined}>{children}</group>;
}
