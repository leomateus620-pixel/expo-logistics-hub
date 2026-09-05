import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildLateralResidentialRenderPlan, auditLateralResidentialRenderPlan, resolveResidentialDetailVisibility,
  type ResidentialBatchKind, type ResidentialRenderCell } from '../../utils/lateralResidentialGeometry';
import { createResidentialGround, createResidentialSharedAssets } from '../../utils/lateralResidentialAssets';

const NO_RAYCAST = () => undefined;
const DETAIL = new Set<ResidentialBatchKind>(['detail', 'glass', 'solar']);
const VEGETATION = new Set<ResidentialBatchKind>(['trunk', 'canopy', 'palm']);
type Assets = ReturnType<typeof createResidentialSharedAssets>;

function DistrictCell({ cell, assets, reducedGraphics, vegetationVisible, nightMode }: {
  cell: ResidentialRenderCell; assets: Assets; reducedGraphics: boolean; vegetationVisible: boolean; nightMode: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const detailVisible = useRef(true);
  const fullPalm = useRef(true);
  const nearShadows = useRef(true);
  const compiled = useMemo(() => {
    const group = new THREE.Group(); group.name = `residential-${cell.id}`;
    const batches: Partial<Record<ResidentialBatchKind, THREE.InstancedMesh>> = {};
    const transform = new THREE.Object3D(); const color = new THREE.Color();
    (Object.entries(cell.batches) as [ResidentialBatchKind, ResidentialRenderCell['batches'][ResidentialBatchKind]][]).forEach(([kind, instances]) => {
      if (!instances.length) return;
      const mesh = new THREE.InstancedMesh(assets.geometries[kind], assets.materials[kind], instances.length);
      mesh.name = `${cell.id}-${kind}`; mesh.raycast = NO_RAYCAST;
      mesh.userData.presentationOnly = true;
      const ordered = kind === 'trunk' ? [...instances].sort((a, b) => Number(b.id.includes('-pole-')) - Number(a.id.includes('-pole-'))) : instances;
      mesh.userData.poleCount = kind === 'trunk' ? ordered.filter((entry) => entry.id.includes('-pole-')).length : 0;
      ordered.forEach((entry, i) => {
        transform.position.set(...entry.position); transform.rotation.set(...entry.rotation); transform.scale.set(...entry.scale);
        transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, color.set(entry.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox();
      mesh.receiveShadow = kind !== 'lightPool' && kind !== 'lamp';
      if (kind === 'lightPool') mesh.renderOrder = 3;
      group.add(mesh); batches[kind] = mesh;
    });
    const groundGeometry = createResidentialGround(cell.surfaces);
    const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, name: `${cell.id}-ground` });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.raycast = NO_RAYCAST; ground.receiveShadow = true; group.add(ground);
    return { group, batches, entries: Object.entries(batches) as [ResidentialBatchKind, THREE.InstancedMesh][], groundGeometry, groundMaterial };
  }, [assets, cell]);
  useEffect(() => () => {
    Object.values(compiled.batches).forEach((mesh) => THREE.InstancedMesh.prototype.dispose.call(mesh));
    compiled.groundGeometry.dispose(); compiled.groundMaterial.dispose();
  }, [compiled]);
  useLayoutEffect(() => {
    // Poles share the trunk batch: keep their infrastructure when crowns are hidden.
    for (const kind of ['canopy', 'palm'] as const) if (compiled.batches[kind]) compiled.batches[kind]!.visible = vegetationVisible;
    if (compiled.batches.trunk) compiled.batches.trunk.count = vegetationVisible ? cell.batches.trunk.length : compiled.batches.trunk.userData.poleCount;
  }, [cell, compiled, vegetationVisible]);
  useLayoutEffect(() => {
    // A restrained ambient contribution keeps the local streets and gardens
    // readable with the park's night rig, without allocating point lights.
    compiled.groundMaterial.emissive.set('#596e77');
    compiled.groundMaterial.emissiveIntensity = nightMode ? .055 : 0;
  }, [compiled, nightMode]);
  const center = useMemo(() => new THREE.Vector3(cell.center[0], .5, cell.center[1]), [cell]);
  useFrame(({ camera }) => {
    const distance = camera.position.distanceTo(center);
    detailVisible.current = resolveResidentialDetailVisibility(distance, detailVisible.current, reducedGraphics ? 20 : 45, reducedGraphics ? 26 : 53);
    // Leaflets become sub-pixel at overview distances; keep the full curved
    // fronds for close views and the same crown silhouette farther away.
    fullPalm.current = resolveResidentialDetailVisibility(distance, fullPalm.current, 45, 53);
    nearShadows.current = resolveResidentialDetailVisibility(distance, nearShadows.current, 62, 70);
    for (const [kind, mesh] of compiled.entries) {
      if (DETAIL.has(kind)) mesh.visible = detailVisible.current || (kind === 'glass' && nightMode);
      if (kind === 'lightPool') mesh.visible = nightMode;
      if (VEGETATION.has(kind) && kind !== 'trunk') mesh.visible = vegetationVisible;
      const cast = !reducedGraphics && nearShadows.current && (kind === 'masonry' || kind === 'hipRoof' || kind === 'gableRoof');
      if (mesh.castShadow !== cast) { mesh.castShadow = cast; gl.shadowMap.needsUpdate = true; }
      if (kind === 'palm') mesh.geometry = fullPalm.current && !reducedGraphics ? assets.geometries.palm : assets.farPalm;
    }
  });
  return <primitive object={compiled.group} dispose={null} />;
}

export const LateralResidentialDistrict = memo(function LateralResidentialDistrict({
  reducedGraphics, vegetationVisible = true, nightMode = false, visible = true,
}: { reducedGraphics: boolean; vegetationVisible?: boolean; nightMode?: boolean; visible?: boolean }) {
  const assets = useMemo(createResidentialSharedAssets, []);
  const cells = useMemo(() => buildLateralResidentialRenderPlan(), []);
  const audit = useMemo(() => auditLateralResidentialRenderPlan(cells), [cells]);
  useEffect(() => () => assets.dispose(), [assets]);
  useLayoutEffect(() => {
    (assets.materials.lightPool as THREE.ShaderMaterial).uniforms.brightness.value = nightMode ? .65 : 0;
    for (const [kind, material] of Object.entries(assets.materials)) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissive.set(kind === 'glass' || kind === 'lamp' ? '#ffd18a' : kind.startsWith('pool') ? '#249caf' : '#506779');
      material.emissiveIntensity = nightMode ? kind === 'lamp' ? 1.8 : kind === 'glass' ? .55 : kind.startsWith('pool') ? .22 : .055 : 0;
    }
  }, [assets, nightMode]);
  return <group name="lateral-residential-district" visible={visible} dispose={null} userData={{ presentationOnly: true, ...audit }}>
    {cells.map((cell) => <DistrictCell key={cell.id} cell={cell} assets={assets} reducedGraphics={reducedGraphics} vegetationVisible={vegetationVisible} nightMode={nightMode} />)}
  </group>;
});
