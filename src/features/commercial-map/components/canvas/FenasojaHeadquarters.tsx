import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  FENASOJA_COMPLEX as SPEC,
  complexWorldPolygon,
} from "../../data/fenasojaComplexReconstruction";
import type { StrategicLandmarkBounds } from "../../utils/landmarks";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";
import { measureCommercialMapSync } from "../../utils/performanceDiagnostics";
import { commercialRainRuntime } from "../../utils/rainRuntime";

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
  type Surface,
  type V3,
} from "./headquarters/geometry";
import { makeHeadquartersMaterials } from "./headquarters/materials";
import { useCommercialMapStore } from "../../state/useCommercialMapStore";
import { readPreparedHeadquartersGeometry } from "./headquarters/headquartersPreparationResource";
import { unpackHeadquartersGeometry } from "./headquarters/headquartersGeometryPacking";
import { HeadquartersVisitors } from "./headquarters/HeadquartersVisitors";
import {
  loadRefinedHeadquarters,
  REFINED_HEADQUARTERS_URL,
  type RefinedHeadquartersAsset,
} from "./headquarters/refinedAsset";
const hq = SPEC.headquarters;
const u = SPEC.registration.unitsPerMeter;
const refinedEnterDistance = 11;
const refinedExitDistance = 13;
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
  reducedGraphics = false,
}: {
  bounds: StrategicLandmarkBounds;
  toneDown?: number;
  showDetail?: boolean;
  reducedGraphics?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const atmosphere = useMemo(() => commercialRainRuntime(scene), [scene]);
  const night = useCommercialMapStore((s) => s.nightModeActive);
  const neutral =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("complexNeutral");
  const renderCount = useRef(0);
  renderCount.current++;
  const prepared = readPreparedHeadquartersGeometry();
  const resources = useMemo(() => {
    const geometry = measureCommercialMapSync("b12-unpack", () => unpackHeadquartersGeometry(prepared));
    const contact = geometry.contact;
    const palette = measureCommercialMapSync("b12-materials", () => makeHeadquartersMaterials(
      invalidate,
      gl.capabilities.getMaxAnisotropy(),
    ));
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
  }, [gl, invalidate, prepared]);
  const group = useRef<THREE.Group>(null);
  const appearance = useRef({ night, toneDown });
  const refined = useRef<{
    asset: RefinedHeadquartersAsset | null;
    controller: AbortController | null;
    metadata: {
      source: "native" | "higgsfield";
      status: "idle" | "loading" | "ready" | "failed";
      lighting: "higgsfield-key" | "park";
      url: string;
    };
  }>({
    asset: null,
    controller: null,
    metadata: {
      source: "native", status: "idle", lighting: "park", url: REFINED_HEADQUARTERS_URL,
    },
  });
  const getVisitorKeyReceiver = useCallback(() => refined.current.asset?.applyVisitorKey, []);
  const lod = useRef({
    tier: -1,
    origin: new THREE.Vector3(),
    needsApply: true,
  });
  useFrame(({ camera }) => {
    const state = lod.current;
    const root = group.current;
    if (!root) return;
    root.getWorldPosition(state.origin);
    const distance = camera.position.distanceTo(state.origin);
    const local = refined.current;
    if (!neutral && distance < refinedEnterDistance && local.metadata.status === "idle") {
      const controller = new AbortController();
      local.controller = controller;
      local.metadata.status = "loading";
      void loadRefinedHeadquarters(controller.signal, atmosphere).then((asset) => {
        if (controller.signal.aborted || group.current !== root) {
          asset.dispose();
          return;
        }
        asset.applyToneDown(appearance.current.toneDown);
        asset.applyNight(appearance.current.night);
        asset.root.visible = false;
        root.add(asset.root);
        local.asset = asset;
        local.controller = null;
        local.metadata.status = "ready";
        local.metadata.lighting = asset.lighting;
        state.needsApply = true;
        invalidate();
      }, () => {
        if (controller.signal.aborted) return;
        controller.abort();
        local.controller = null;
        local.metadata.status = "failed";
        invalidate();
      });
    }
    // After the one lazy load, hysteresis only changes visibility and counts.
    const wasRefined = local.metadata.source === "higgsfield";
    const showRefined = Boolean(
      local.asset && !neutral &&
      distance < (wasRefined ? refinedExitDistance : refinedEnterDistance),
    );
    if (showRefined) local.asset?.placeLighting(root.matrixWorld);
    let tier = state.tier;
    if (distance < 5.8) tier = 2;
    else if (distance > 7.1 && distance < 16) tier = 1;
    else if (distance > 19) tier = 0;
    else if (tier < 0) tier = distance < 7.1 ? 2 : 1;
    if (tier === state.tier && showRefined === wasRefined && !state.needsApply) return;
    state.needsApply = false;
    state.tier = tier;
    local.metadata.source = showRefined ? "higgsfield" : "native";
    if (local.asset) {
      local.asset.root.visible = showRefined;
      if (showRefined) local.asset.applyTier(tier, showDetail);
    }
    for (const object of root.children) {
      if (object === local.asset?.root || object.userData.b12VisitorLayer) continue;
      if (object instanceof THREE.InstancedMesh) {
        object.visible = !showRefined && showDetail;
        object.count = Math.max(
          1,
          Math.floor(
            object.instanceMatrix.count *
              (tier === 2 ? 1 : tier === 1 ? 0.62 : 0.18),
          ),
        );
      } else {
        object.visible = !showRefined && (object.userData.detailTier ?? 0) <= tier;
      }
    }
    root.userData.lod = tier;
    if (showRefined || wasRefined) gl.shadowMap.needsUpdate = true;
    invalidate();
  });
  useLayoutEffect(() => {
    const local = refined.current;
    return () => {
      local.controller?.abort();
      local.asset?.dispose();
      local.controller = null;
      local.asset = null;
      local.metadata.source = "native";
      local.metadata.status = "idle";
      local.metadata.lighting = "park";
      lod.current.needsApply = true;
    };
  }, []);
  // React may reapply visibility props after filters/night/selection change.
  useLayoutEffect(() => {
    lod.current.needsApply = true;
    invalidate();
  }, [night, showDetail, toneDown, bounds, resources, invalidate]);
  useEffect(() => {
    appearance.current.night = night;
    refined.current.asset?.applyNight(night);
    resources.materials.warmInterior.emissiveIntensity = night ? 0.25 : 0.08;
    invalidate();
  }, [resources, night, invalidate]);
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => {
    appearance.current.toneDown = toneDown;
    refined.current.asset?.applyToneDown(toneDown);
    for (const key of Object.keys(resources.materials) as Surface[])
      resources.materials[key].color
        .copy(resources.base[key])
        .lerp(new THREE.Color("#9fa8a2"), toneDown * 0.7);
    invalidate();
  }, [resources, toneDown, invalidate]);
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
        b12Asset: refined.current.metadata,
      }}
    >
      {!neutral && (
        <group userData={{ b12VisitorLayer: true }}>
          <HeadquartersVisitors
            scope="frontage"
            reducedGraphics={reducedGraphics}
            getKeyReceiver={getVisitorKeyReceiver}
          />
        </group>
      )}
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
