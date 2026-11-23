import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { projectCommercialPavilionReferencePoint, type CommercialPavilionReferenceProjectionFrame } from '../../../data/commercialPavilionReference';
import { projectCommercialPavilionModuleRect, type CommercialPavilionModulePlan, type NormalizedCommercialPavilionRect } from '../../../utils/commercialPavilionModules';
import { useWarmParkTexture } from '../warmParkTextures';

const NO_RAYCAST = () => undefined;

/** The slab and the existing raised corridor boxes meet in the same local
 * coordinate system. This keeps both aggregate and saw cuts continuous. */
export function usePavilionCirculationFloor(enabled: boolean) {
  const texture = useWarmParkTexture('interiorFloor', enabled);
  const invalidate = useThree(state => state.invalidate);
  const surface = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ name: 'pavilion-circulation-concrete', color: '#d8cdb9', roughness: .77 });
    const sample = { value: null as THREE.Texture | null };
    const available = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.uPavilionStone = sample;
      shader.uniforms.uPavilionStoneReady = available;
      shader.vertexShader = 'varying vec2 vPavilionFloor;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 localFloor = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          localFloor = instanceMatrix * localFloor;
        #endif
        vPavilionFloor = localFloor.xz;`);
      shader.fragmentShader = 'uniform sampler2D uPavilionStone; uniform float uPavilionStoneReady; varying vec2 vPavilionFloor;\n' +
        shader.fragmentShader.replace('#include <color_fragment>', `
          // Corridor instance tints in the historic floor denote the circulation type.
          #ifdef USE_COLOR
            diffuseColor.rgb *= mix(vec3(1.), vColor.rgb, .12);
          #endif
          if (uPavilionStoneReady > .5) {
            vec3 aggregate = texture2D(uPavilionStone, vPavilionFloor / .24).rgb;
            diffuseColor.rgb *= clamp(aggregate / vec3(.571, .558, .515), .7, 1.35);
          }
          // 3 m slabs, with derivative-filtered joints in the plan view.
          vec2 tile = vPavilionFloor / .45;
          vec2 aa = max(fwidth(tile), vec2(.0001));
          vec2 distanceToJoint = abs(fract(tile + .5) - .5);
          vec2 coverage = 1. - smoothstep(vec2(.006) - aa * .40, vec2(.006) + aa * .65, distanceToJoint);
          float fade = 1. - smoothstep(.12, .6, max(aa.x, aa.y));
          diffuseColor.rgb *= 1. - .30 * max(coverage.x, coverage.y) * fade;
        `);
    };
    material.customProgramCacheKey = () => 'pavilion-circulation-concrete-v1';
    return { material, sample, available };
  }, []);
  useLayoutEffect(() => {
    surface.sample.value = texture;
    surface.available.value = Number(Boolean(texture));
    invalidate();
  }, [surface, texture, invalidate]);
  useEffect(() => () => surface.material.dispose(), [surface]);
  return enabled ? surface.material : null;
}

/** Project the same rectangles and irregular rings as the selectable meshes.
 * Bridge only the narrow drafting gap between adjacent rectangles of one
 * official run. Differently sized modules retain their exposed side edges. */
export function pavilionIslandRings(plan: CommercialPavilionModulePlan, frame: CommercialPavilionReferenceProjectionFrame) {
  const polygons: Polygon[] = [];
  function add(ring: readonly (readonly [number, number])[]) {
    // Identical official boundaries can differ by an ulp after projection.
    polygons.push([ring.map(([x, z]) => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6])]);
  }
  function rectangle(left: number, top: number, right: number, bottom: number) {
    add([[left, top], [right, top], [right, bottom], [left, bottom]]);
  }
  const edges = (rect: NormalizedCommercialPavilionRect) => {
    const { centerX: x, centerZ: z, width, depth } = projectCommercialPavilionModuleRect(rect, frame);
    return { left: x - width / 2, right: x + width / 2, top: z - depth / 2, bottom: z + depth / 2 };
  };
  const previousByRun = new Map<string, ReturnType<typeof edges>>();
  // At most one mortar-width gap is bridged; a wider, actual aisle stays open.
  const maximumJointX = (plan.moduleGap ?? 0) * frame.width + 1e-6;
  const maximumJointZ = (plan.moduleGap ?? 0) * frame.depth + 1e-6;
  for (const cell of plan.cells) {
    if (cell.shape?.footprint.length) {
      add(cell.shape.footprint.map(point => projectCommercialPavilionReferencePoint(point, frame)));
      previousByRun.delete(cell.zoneId);
      continue;
    }
    const parts = cell.shape?.renderParts.length ? cell.shape.renderParts : [cell];
    for (const part of parts) {
      const bounds = edges(part);
      rectangle(bounds.left, bounds.top, bounds.right, bounds.bottom);
      const last = previousByRun.get(cell.zoneId);
      if (last) {
        const x0 = Math.max(last.left, bounds.left), x1 = Math.min(last.right, bounds.right);
        const z0 = Math.max(last.top, bounds.top), z1 = Math.min(last.bottom, bounds.bottom);
        if (x0 > x1 && x0 - x1 <= maximumJointX && z1 > z0) rectangle(x1, z0, x0, z1);
        if (z0 > z1 && z0 - z1 <= maximumJointZ && x1 > x0) rectangle(x0, z1, x1, z0);
      }
      previousByRun.set(cell.zoneId, bounds);
    }
  }
  return polygons.length ? polygonClipping.union(polygons[0], ...polygons.slice(1)) : [];
}

function edgingGeometry(plan: CommercialPavilionModulePlan, frame: CommercialPavilionReferenceProjectionFrame, width: number) {
  const positions: number[] = [], colors: number[] = [];
  const index: number[] = [];
  const seam = new THREE.Color('#64645a'), curb = new THREE.Color('#c7b491');
  for (const polygon of pavilionIslandRings(plan, frame)) for (const closedRing of polygon) {
    // polygon-clipping winds all exteriors CCW and holes CW. The right normal
    // therefore always points out of the commercial area, even at a cutout.
    const ring = closedRing.slice(0, -1);
    const first = positions.length / 3;
    for (let i = 0; i < ring.length; i++) {
      const [x, z] = ring[i], a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
      const incoming = new THREE.Vector2(z - a[1], a[0] - x).normalize();
      const outgoing = new THREE.Vector2(b[1] - z, x - b[0]).normalize();
      const join = incoming.add(outgoing).normalize();
      join.multiplyScalar(width / Math.max(.4, join.dot(outgoing)));
      // Graphite reveal and pale stone. Both bands share a single draw.
      for (const [offset, color] of [[0, seam], [.42, seam], [.42, curb], [1, curb]] as const) {
        positions.push(x + join.x * offset, 0, z + join.y * offset);
        colors.push(color.r, color.g, color.b);
      }
      const left = first + 4 * i, right = first + 4 * ((i + 1) % ring.length);
      for (const band of [0, 2]) index.push(left+band, right+band, left+band+1, right+band, right+band+1, left+band+1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function PavilionIslandEdging({ plan, frame, floorY, width }: {
  plan: CommercialPavilionModulePlan; frame: CommercialPavilionReferenceProjectionFrame; floorY: number; width: number;
}) {
  const geometry = useMemo(() => edgingGeometry(plan, frame, width), [frame, plan, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name="pavilion-island-edging" geometry={geometry} position-y={floorY + .013} receiveShadow raycast={NO_RAYCAST}>
    <meshStandardMaterial vertexColors roughness={.77} metalness={.12} />
  </mesh>;
}
