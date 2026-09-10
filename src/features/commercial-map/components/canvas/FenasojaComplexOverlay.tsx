import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FENASOJA_COMPLEX as S } from "../../data/fenasojaComplexReconstruction";
import type { StrategicLandmarkBounds } from "../../utils/landmarks";

/** Temporary registration overlay, explicitly gated by DEV and URL flag. */
export function FenasojaComplexOverlay({
  identifier,
  bounds,
}: {
  identifier: string;
  bounds: StrategicLandmarkBounds;
}) {
  const building = identifier === "B12" ? S.headquarters : S.stage;
  const geometries = useMemo(
    () =>
      [building.footprint, building.roofProjection].map((poly) =>
        new THREE.BufferGeometry().setFromPoints(
          [...poly, poly[0]].map(
            ([x, z]) =>
              new THREE.Vector3(
                x * S.registration.unitsPerMeter,
                0.12,
                z * S.registration.unitsPerMeter,
              ),
          ),
        ),
      ),
    [building],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <group
      position={[
        building.origin[1] - bounds.centerZ,
        0,
        bounds.centerX - building.origin[0],
      ]}
    >
      {geometries.map((g, i) => (
        <lineLoop
          key={i}
          geometry={g}
          renderOrder={100}
          raycast={() => undefined}
        >
          <lineBasicMaterial
            color={
              i === 0 ? "#27d88a" : identifier === "B12" ? "#237eff" : "#ed342c"
            }
            depthTest={false}
            transparent
            opacity={0.95}
          />
        </lineLoop>
      ))}
    </group>
  );
}
