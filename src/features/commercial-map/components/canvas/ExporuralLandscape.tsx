import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapEntity } from "../../types";
import {
  buildExporuralLandscape,
  EXPORURAL_WELL,
  isExporuralLandscapeLot,
} from "../../utils/exporuralLandscape";
import { pointInPolygon } from "../../utils/spatialSurface";
import { applyParkSurfaceDetail } from "./parkSurfaceMaterial";

const NO_RAYCAST = () => undefined;

function wellGeometry(elevation: number) {
  const parts: THREE.BufferGeometry[] = [];
  const [x, z] = EXPORURAL_WELL.position;
  const box = (
    w: number,
    h: number,
    d: number,
    px: number,
    py: number,
    pz: number,
    color: string,
  ) => {
    const primitive = new THREE.BoxGeometry(w, h, d);
    const g = primitive.toNonIndexed();
    primitive.dispose();
    g.translate(x + px, elevation + py, z + pz);
    const c = new THREE.Color(color),
      colors = [];
    for (let i = 0; i < g.getAttribute("position").count; i++)
      colors.push(c.r, c.g, c.b);
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    parts.push(g);
  };
  box(0.66, 0.025, 0.66, 0, 0.014, 0, "#898a71");
  box(0.4, 0.17, 0.12, 0.08, 0.11, 0.23, "#9a6946");
  box(0.43, 0.025, 0.14, 0.08, 0.205, 0.23, "#999b8e");
  box(0.045, 1.3, 0.045, -0.12, 0.65, -0.12, "#8a8980");
  box(0.12, 0.14, 0.055, -0.12, 0.43, -0.085, "#c4c4b1");
  box(0.045, 0.2, 0.045, -0.11, 0.12, 0.05, "#3e7c93");
  for (const side of [-1, 1]) {
    for (const end of [-1, 1])
      box(0.018, 0.4, 0.018, side * 0.28, 0.2, end * 0.28, "#484e45");
    for (const y of [0.07, 0.32]) {
      box(0.56, 0.009, 0.009, 0, y, side * 0.28, "#343e35");
      box(0.009, 0.009, 0.56, side * 0.28, y, 0, "#343e35");
    }
    for (let i = -3; i <= 3; i++) {
      box(0.006, 0.29, 0.006, i * 0.07, 0.175, side * 0.28, "#414b3e");
      box(0.006, 0.29, 0.006, side * 0.28, 0.175, i * 0.07, "#414b3e");
    }
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export function ExporuralLandscape({
  entities,
  opacity,
}: {
  entities: readonly MapEntity[];
  opacity: number;
}) {
  const model = useMemo(() => {
    const geometry = buildExporuralLandscape(entities);
    const r2 = entities.find(
      (e) =>
        e.publicIdentifier === "Q-R-02" &&
        isExporuralLandscapeLot(e) &&
        pointInPolygon(EXPORURAL_WELL.position, e.geometry.coordinates[0]),
    );
    const well = r2
      ? wellGeometry(r2.geometry.elevation + r2.geometry.extrusionHeight)
      : null;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      side: THREE.DoubleSide,
    });
    applyParkSurfaceDetail(material, {
      grainFrequency: 36,
      grainStrength: 0.14,
      normalStrength: 0.12,
    });
    return { ...geometry, well, material };
  }, [entities]);
  useEffect(() => {
    model.material.opacity = opacity;
    model.material.transparent = opacity < 0.995;
    model.material.depthWrite = opacity > 0.42;
    model.material.needsUpdate = true;
  }, [model, opacity]);
  useEffect(
    () => () => {
      model.borders?.dispose();
      model.slopes?.dispose();
      model.terrace?.dispose();
      model.well?.dispose();
      model.material.dispose();
    },
    [model],
  );
  return (
    <group name="exporural-landscape" userData={{ presentationOnly: true }}>
      {(["borders", "slopes", "terrace", "well"] as const).map(
        (key) =>
          model[key] && (
            <mesh
              key={key}
              name={`exporural-${key}`}
              geometry={model[key]!}
              material={model.material}
              raycast={NO_RAYCAST}
              receiveShadow
              castShadow={key === "well"}
              dispose={null}
            />
          ),
      )}
    </group>
  );
}
