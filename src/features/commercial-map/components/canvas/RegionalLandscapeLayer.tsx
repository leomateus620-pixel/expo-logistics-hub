import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import {
  projectedCommercialMapShadowDirection,
  projectedCommercialMapShadowRotation,
} from '../../data/commercialMapEnvironment';
import {
  REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET,
  REGIONAL_LANDSCAPE_GROUND_HEIGHT,
  buildRegionalLandscapePlan,
  regionalLandscapeDiagnostics,
  type RegionalLandscapeQualityTier,
} from '../../utils/regionalLandscape';

export interface RegionalLandscapeLayerProps {
  qualityTier: RegionalLandscapeQualityTier;
}

const NO_RAYCAST = () => undefined;
const SUNRISE_SHADOW_DIRECTION = projectedCommercialMapShadowDirection();
const SUNRISE_SHADOW_ROTATION = projectedCommercialMapShadowRotation();

const FOLIAGE_COLORS = Object.freeze([
  '#365f36',
  '#416a39',
  '#2f5734',
  '#4b703d',
  '#385f40',
  '#557849',
  '#31583a',
  '#45683a',
] as const);

const TRUNK_COLORS = Object.freeze([
  '#65513f',
  '#705844',
  '#5d4b3b',
  '#765e47',
  '#614b39',
  '#6d5540',
  '#59483a',
  '#735944',
] as const);

/** Eight silhouettes without eight geometries or material/program variants. */
const TREE_VARIANTS = Object.freeze([
  Object.freeze({ crownX: 0.92, crownY: 1.08, crownZ: 1.04, trunk: 0.96, yaw: 0.00 }),
  Object.freeze({ crownX: 1.10, crownY: 0.90, crownZ: 0.88, trunk: 1.05, yaw: 0.37 }),
  Object.freeze({ crownX: 0.84, crownY: 1.18, crownZ: 1.08, trunk: 0.90, yaw: 0.79 }),
  Object.freeze({ crownX: 1.16, crownY: 0.84, crownZ: 0.96, trunk: 1.08, yaw: 1.21 }),
  Object.freeze({ crownX: 0.98, crownY: 1.02, crownZ: 1.13, trunk: 0.94, yaw: 1.66 }),
  Object.freeze({ crownX: 1.06, crownY: 1.12, crownZ: 0.86, trunk: 1.02, yaw: 2.14 }),
  Object.freeze({ crownX: 0.88, crownY: 0.94, crownZ: 1.17, trunk: 0.98, yaw: 2.63 }),
  Object.freeze({ crownX: 1.13, crownY: 1.00, crownZ: 0.92, trunk: 1.06, yaw: 3.08 }),
] as const);

function createSoftGroundShadowMaterial() {
  const material = new THREE.ShaderMaterial({
    name: 'RegionalLandscapeSoftGroundShadowMaterial',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec2 vRegionalShadowUv;
      void main() {
        vRegionalShadowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vRegionalShadowUv;
      void main() {
        vec2 centered = (vRegionalShadowUv - 0.5) * 2.0;
        float radial = dot(centered, centered);
        float alpha = (1.0 - smoothstep(0.08, 1.0, radial)) * 0.16;
        gl_FragColor = vec4(0.035, 0.055, 0.028, alpha);
      }
    `,
  });
  material.customProgramCacheKey = () => 'regional-landscape-soft-shadow-r170-v1';
  return material;
}

function refreshInstanceAttributes(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.count = mesh.instanceMatrix.count;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.StaticDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/**
 * Presentation-only regional vegetation. It owns no map entity, selection or
 * surveyed geometry and is deliberately excluded from raycasting and real
 * shadow-map renders.
 */
export const RegionalLandscapeLayer = memo(function RegionalLandscapeLayer({
  qualityTier,
}: RegionalLandscapeLayerProps) {
  const invalidate = useThree((state) => state.invalidate);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const fakeShadows = qualityTier !== 'reduced';
  const plan = useMemo(() => buildRegionalLandscapePlan(qualityTier), [qualityTier]);
  const diagnostics = useMemo(() => regionalLandscapeDiagnostics(qualityTier), [qualityTier]);

  const geometries = useMemo(() => {
    const trunkSegments = qualityTier === 'full' ? 7 : qualityTier === 'balanced' ? 6 : 5;
    const trunk = new THREE.CylinderGeometry(0.66, 1, 1, trunkSegments, 1, false);
    const canopy = new THREE.IcosahedronGeometry(1, qualityTier === 'full' ? 1 : 0);
    const shadow = fakeShadows ? new THREE.PlaneGeometry(2, 2, 1, 1) : null;
    trunk.deleteAttribute('uv');
    return { trunk, canopy, shadow };
  }, [fakeShadows, qualityTier]);

  const materials = useMemo(() => ({
    trunk: new THREE.MeshStandardMaterial({
      name: 'RegionalLandscapeTrunkMaterial',
      color: '#ffffff',
      roughness: 0.96,
      metalness: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({
      name: 'RegionalLandscapeCanopyMaterial',
      color: '#ffffff',
      roughness: 0.93,
      metalness: 0,
    }),
    shadow: fakeShadows ? createSoftGroundShadowMaterial() : null,
  }), [fakeShadows]);

  useLayoutEffect(() => {
    const trunkMesh = trunkRef.current;
    const canopyMesh = canopyRef.current;
    const shadowMesh = shadowRef.current;
    if (!trunkMesh || !canopyMesh) return;

    const transform = new THREE.Object3D();
    const trunkColor = new THREE.Color();
    const foliageColor = new THREE.Color();

    plan.forEach((instance, index) => {
      const variantIndex = instance.variant % TREE_VARIANTS.length;
      const variant = TREE_VARIANTS[variantIndex];
      const [x, z] = instance.position;
      const trunkHeight = instance.height * (0.47 + variant.trunk * 0.025);
      const trunkRadius = instance.canopyRadius * 0.105 * variant.trunk;
      const crownHeight = Math.max(0.8, instance.height - trunkHeight);

      transform.position.set(x, REGIONAL_LANDSCAPE_GROUND_HEIGHT + trunkHeight / 2, z);
      transform.rotation.set(0, instance.rotation + variant.yaw, 0);
      transform.scale.set(
        trunkRadius * instance.scaleX,
        trunkHeight,
        trunkRadius * instance.scaleZ,
      );
      transform.updateMatrix();
      trunkMesh.setMatrixAt(index, transform.matrix);
      trunkColor.set(TRUNK_COLORS[variantIndex]);
      trunkMesh.setColorAt(index, trunkColor);

      transform.position.set(
        x,
        REGIONAL_LANDSCAPE_GROUND_HEIGHT + trunkHeight + crownHeight * 0.48,
        z,
      );
      transform.rotation.set(0, instance.rotation + variant.yaw, 0);
      transform.scale.set(
        instance.canopyRadius * instance.scaleX * variant.crownX,
        crownHeight * 0.54 * instance.canopyScaleY * variant.crownY,
        instance.canopyRadius * instance.scaleZ * variant.crownZ,
      );
      transform.updateMatrix();
      canopyMesh.setMatrixAt(index, transform.matrix);
      foliageColor.set(FOLIAGE_COLORS[variantIndex]);
      canopyMesh.setColorAt(index, foliageColor);

      if (shadowMesh) {
        const shadowOffset = instance.height * 0.2;
        transform.position.set(
          x + SUNRISE_SHADOW_DIRECTION[0] * shadowOffset,
          REGIONAL_LANDSCAPE_GROUND_HEIGHT + 0.002,
          z + SUNRISE_SHADOW_DIRECTION[1] * shadowOffset,
        );
        transform.rotation.set(-Math.PI / 2, 0, SUNRISE_SHADOW_ROTATION);
        transform.scale.set(
          instance.canopyRadius * (0.82 + variant.crownX * 0.18),
          instance.canopyRadius * (1.28 + instance.height * 0.075),
          1,
        );
        transform.updateMatrix();
        shadowMesh.setMatrixAt(index, transform.matrix);
      }
    });

    [trunkMesh, canopyMesh, shadowMesh].forEach(refreshInstanceAttributes);
    invalidate();
  }, [invalidate, plan]);

  // InstancedMesh owns an internal resource in addition to the explicitly
  // shared geometry/material. Capture mounted instances before refs are reset.
  useLayoutEffect(() => {
    const meshes = [trunkRef.current, canopyRef.current, shadowRef.current];
    return () => meshes.forEach(disposeInstancedMesh);
  }, [geometries, materials]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry?.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material?.dispose());
  }, [materials]);

  return (
    <group
      name="regional-landscape-presentation"
      dispose={null}
      userData={{
        presentationOnly: true,
        selectable: false,
        variantCount: TREE_VARIANTS.length,
        instanceCount: plan.length,
        drawCallBudget: REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET[qualityTier],
        diagnostics,
      }}
    >
      {fakeShadows && geometries.shadow && materials.shadow && (
        <instancedMesh
          ref={shadowRef}
          name="regional-landscape-fake-shadows"
          args={[geometries.shadow, materials.shadow, plan.length]}
          count={plan.length}
          renderOrder={1}
          frustumCulled
          castShadow={false}
          receiveShadow={false}
          raycast={NO_RAYCAST}
          dispose={null}
        />
      )}
      <instancedMesh
        ref={trunkRef}
        name="regional-landscape-trunks"
        args={[geometries.trunk, materials.trunk, plan.length]}
        count={plan.length}
        frustumCulled
        castShadow={false}
        receiveShadow={false}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <instancedMesh
        ref={canopyRef}
        name="regional-landscape-canopies"
        args={[geometries.canopy, materials.canopy, plan.length]}
        count={plan.length}
        frustumCulled
        castShadow={false}
        receiveShadow={false}
        raycast={NO_RAYCAST}
        dispose={null}
      />
    </group>
  );
});
