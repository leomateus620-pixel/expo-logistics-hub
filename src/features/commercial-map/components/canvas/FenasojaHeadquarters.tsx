import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  FENASOJA_COMPLEX as SPEC,
  complexWorldPolygon,
} from "../../data/fenasojaComplexReconstruction";
import type { StrategicLandmarkBounds } from "../../utils/landmarks";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";

const NO_RAYCAST = () => undefined;
const PETAL_GEOMETRY = new THREE.SphereGeometry(1, 6, 3);
PETAL_GEOMETRY.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(
    new Float32Array(PETAL_GEOMETRY.getAttribute("position").count * 3).fill(1),
    3,
  ),
);
import {
  createHeadquartersGeometry,
  type Surface,
  type V3,
} from "./headquarters/geometry";
import { makeHeadquartersMaterials } from "./headquarters/materials";
import { useCommercialMapStore } from "../../state/useCommercialMapStore";
import { buildShell } from "./headquarters/architecture";
import { buildFrontage } from "./headquarters/landscape";
import { bakeArchitecturalContact } from "./headquarters/contact";
import { buildSoybeanMonument } from "./headquarters/monument";
const hq = SPEC.headquarters;
const u = SPEC.registration.unitsPerMeter;
const sitePolygon = complexWorldPolygon("headquarters", "site");
const siteCenter = [
  (Math.min(...sitePolygon.map((p) => p[0])) +
    Math.max(...sitePolygon.map((p) => p[0]))) /
    2,
  (Math.min(...sitePolygon.map((p) => p[1])) +
    Math.max(...sitePolygon.map((p) => p[1]))) /
    2,
];
const architecturalOffset: V3 = [
  hq.origin[1] - siteCenter[1],
  0,
  siteCenter[0] - hq.origin[0],
];

function buildArchitecture() {
  const builder = createHeadquartersGeometry();
  buildShell(builder);
  buildFrontage(builder);
  buildSoybeanMonument(builder);
  return builder.finish();
}
function RepeatedPlanting({
  matrices,
  material,
  visible,
}: {
  matrices: THREE.Matrix4[];
  material: THREE.Material;
  visible: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    const tint = new THREE.Color();
    matrices.forEach((_, i) => {
      const f = 0.83 + 0.17 * (0.5 + 0.5 * Math.sin(i * 12.93));
      tint.setRGB(f, f, f * 0.96);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return () => disposeInstancedMesh(mesh);
  }, [matrices]);
  return (
    <instancedMesh
      ref={ref}
      args={[PETAL_GEOMETRY, material, matrices.length]}
      visible={visible}
      castShadow
      receiveShadow
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

export function FenasojaHeadquarters({
  bounds,
  toneDown = 0,
  showDetail = true,
}: {
  bounds: StrategicLandmarkBounds;
  toneDown?: number;
  showDetail?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const night = useCommercialMapStore((s) => s.nightModeActive);
  const renderCount = useRef(0);
  renderCount.current++;
  const resources = useMemo(() => {
    const geometry = buildArchitecture();
    const contact = bakeArchitecturalContact(geometry.geometry);
    const palette = makeHeadquartersMaterials(
      invalidate,
      gl.capabilities.getMaxAnisotropy(),
    );
    const textures = new Set<THREE.Texture>();
    for (const material of Object.values(palette.materials))
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    const statistics = {
      materialCount: Object.keys(palette.materials).length,
      geometryBatches: geometry.geometry.length,
      instancedBatches: geometry.repeated.size,
      instanceCapacity: [...geometry.repeated.values()].reduce(
        (n, m) => n + m.length,
        0,
      ),
      geometryBufferBytes: geometry.geometry.reduce(
        (n, p) =>
          n +
          Object.values(p.geometry.attributes).reduce(
            (sum, a) => sum + a.array.byteLength,
            0,
          ) +
          (p.geometry.index?.array.byteLength ?? 0),
        0,
      ),
      textureCount: textures.size,
      // Estimated uncompressed RGBA + mip chain; driver VRAM cannot be queried in WebGL.
      estimatedTextureBytes: [...textures].reduce(
        (n, t) =>
          n +
          ((t.image as { width?: number })?.width ?? 0) *
            ((t.image as { height?: number })?.height ?? 0) *
            4 *
            (t.generateMipmaps ? 4 / 3 : 1),
        0,
      ),
      transparentBatches: geometry.geometry.filter(
        (p) => palette.materials[p.key].transparent,
      ).length,
    };
    return {
      ...geometry,
      ...palette,
      contact,
      statistics,
      dispose: () => {
        geometry.geometry.forEach((g) => g.geometry.dispose());
        palette.dispose();
      },
    };
  }, [gl, invalidate]);
  const group = useRef<THREE.Group>(null);
  const lod = useRef({
    tier: -1,
    origin: new THREE.Vector3(),
    needsApply: true,
  });
  useFrame(({ camera }) => {
    const state = lod.current;
    if (!group.current) return;
    group.current.getWorldPosition(state.origin);
    const distance = camera.position.distanceTo(state.origin);
    // Hysteresis only changes visibility/counts. No React setState or allocation in navigation.
    let tier = state.tier;
    if (distance < 5.8) tier = 2;
    else if (distance > 7.1 && distance < 16) tier = 1;
    else if (distance > 19) tier = 0;
    else if (tier < 0) tier = distance < 7.1 ? 2 : 1;
    if (tier === state.tier && !state.needsApply) return;
    state.needsApply = false;
    state.tier = tier;
    for (const object of group.current.children) {
      if (object instanceof THREE.InstancedMesh)
        object.count = Math.max(
          1,
          Math.floor(
            object.instanceMatrix.count *
              (tier === 2 ? 1 : tier === 1 ? 0.62 : 0.18),
          ),
        );
      else object.visible = (object.userData.detailTier ?? 0) <= tier;
    }
    group.current.userData.lod = tier;
    invalidate();
  });
  // React may reapply visibility props after filters/night/selection change.
  useLayoutEffect(() => {
    lod.current.needsApply = true;
    invalidate();
  }, [night, showDetail, toneDown, bounds, resources, invalidate]);
  useEffect(() => {
    resources.materials.warmInterior.emissiveIntensity = night ? 0.25 : 0.08;
    invalidate();
  }, [resources, night, invalidate]);
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => {
    for (const key of Object.keys(resources.materials) as Surface[])
      resources.materials[key].color
        .copy(resources.base[key])
        .lerp(new THREE.Color("#9fa8a2"), toneDown * 0.7);
    invalidate();
  }, [resources, toneDown, invalidate]);
  const neutral =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("complexNeutral");
  return (
    <group
      ref={group}
      name="sede-fenasoja-reference-reconstruction"
      position={architecturalOffset}
      scale={u}
      dispose={null}
      userData={{
        entityBounds: [bounds.width, bounds.depth],
        contactBake: resources.contact,
        resources: resources.statistics,
        renderCount: renderCount.current,
      }}
    >
      {resources.geometry.map(({ key, geometry, lod: detailTier }) => (
        <mesh
          key={`${key}:${detailTier}`}
          userData={{ detailTier }}
          name={`B12:${key}`}
          geometry={geometry}
          material={
            neutral ? resources.materials.concrete : resources.materials[key]
          }
          visible={true}
          castShadow={
            key !== "glass" &&
            key !== "graphics" &&
            key !== "entry" &&
            key !== "joint"
          }
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
      ))}
      {[...resources.repeated].map(([key, matrices]) => (
        <RepeatedPlanting
          key={key}
          matrices={matrices}
          material={
            neutral ? resources.materials.concrete : resources.materials[key]
          }
          visible={showDetail}
        />
      ))}
    </group>
  );
}
