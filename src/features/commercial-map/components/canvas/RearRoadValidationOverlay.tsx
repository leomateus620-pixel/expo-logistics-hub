import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { REAR_ROAD_EXCLUSION_BOUNDARIES } from '../../data/rearRoadExclusions';
import {
  REAR_PARK_ROAD_NETWORK,
  rearRoadLocalPath,
} from '../../data/rearParkRoadNetwork';
import {
  REAR_ATTACHMENT_5_REFERENCE_POINTS,
  REAR_SATELLITE_TOPOLOGY,
  projectRearAttachment5PointToLocal,
} from '../../utils/rearSpatialCalibration';
import { officialPdfPointToLocal } from '../../data/officialReference2026';
import { sampleRearRoadCenterline } from '../../utils/rearRoadNetwork';

const NO_RAYCAST = () => undefined;
const OVERLAY_Y = 0.12;
const ANCHOR_SPRITE_CENTER = new THREE.Vector2(0, 0);

function lineSegmentsGeometry(polylines: readonly (readonly (readonly [number, number])[])[]) {
  const positions: number[] = [];
  polylines.forEach((polyline) => {
    for (let index = 0; index < polyline.length - 1; index += 1) {
      const from = polyline[index];
      const to = polyline[index + 1];
      positions.push(from[0], OVERLAY_Y, from[1], to[0], OVERLAY_Y, to[1]);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function pointsGeometry(points: readonly (readonly [number, number])[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    points.flatMap(([x, z]) => [x, OVERLAY_Y + 0.012, z]),
    3,
  ));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Overlay estritamente de desenvolvimento: ?rearRoadDebug mostra centerlines,
 * controles, exclusões, seis âncoras do IMG_9933 e a tríade do IMG_9936.
 */
export const RearRoadValidationOverlay = memo(function RearRoadValidationOverlay() {
  // Screen-facing GPU sprites share the canvas projection with the anchors.
  // This also keeps the development overlay independent of DOM zoom/portals.
  const anchorLabels = useMemo(() => REAR_ATTACHMENT_5_REFERENCE_POINTS.map((point) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 40;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#7b126e';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = '700 23px sans-serif';
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`P${point.id} · ${point.percent[0]}%, ${point.percent[1]}%`, 128, 20);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { id: point.id, position: projectRearAttachment5PointToLocal(point.id), texture };
  }), []);

  const geometries = useMemo(() => {
    const centerlines = lineSegmentsGeometry(REAR_PARK_ROAD_NETWORK.map((road) => (
      sampleRearRoadCenterline(rearRoadLocalPath(road), 5)
    )));
    const exclusions = lineSegmentsGeometry(REAR_ROAD_EXCLUSION_BOUNDARIES.map((boundary) => {
      const polygon = boundary.polygon;
      return polygon.length > 0 ? [...polygon, polygon[0]] : polygon;
    }));
    const controlPoints = pointsGeometry(REAR_PARK_ROAD_NETWORK.flatMap(rearRoadLocalPath));
    const anchors = pointsGeometry(REAR_ATTACHMENT_5_REFERENCE_POINTS.map((point) => (
      projectRearAttachment5PointToLocal(point.id)
    )));
    const satellite = pointsGeometry(REAR_SATELLITE_TOPOLOGY.points.map((point) => (
      officialPdfPointToLocal(point.officialSource)
    )));
    return { centerlines, exclusions, controlPoints, anchors, satellite };
  }, []);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);
  useEffect(() => () => {
    anchorLabels.forEach(({ texture }) => texture.dispose());
  }, [anchorLabels]);

  return (
    <group name="rear-road-validation-overlay" renderOrder={120}>
      <lineSegments geometry={geometries.exclusions} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#ff4f64" transparent opacity={0.72} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geometries.centerlines} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#35e7ff" depthTest={false} />
      </lineSegments>
      <points geometry={geometries.controlPoints} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#ffd54a" size={0.18} sizeAttenuation depthTest={false} />
      </points>
      <points geometry={geometries.anchors} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#ff4ee3" size={0.34} sizeAttenuation depthTest={false} />
      </points>
      <points geometry={geometries.satellite} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#55ff8a" size={0.3} sizeAttenuation depthTest={false} />
      </points>
      {anchorLabels.map(({ id, position: [x, z], texture }) => (
        <sprite key={id} position={[x, OVERLAY_Y + 0.05, z]} scale={[8.4, 1.3125, 1]}
          center={ANCHOR_SPRITE_CENTER} raycast={NO_RAYCAST} renderOrder={121}>
          <spriteMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
});
