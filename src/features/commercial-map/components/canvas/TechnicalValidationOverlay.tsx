import { memo, useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialLot, MapEntity } from '../../types';
import {
  buildTechnicalValidationReport,
  type TechnicalValidationEntry,
  type TechnicalValidationSeverity,
} from '../../utils/technicalValidation';
import { withoutClosingPoint } from '../../utils/geometry';

const NO_RAYCAST = () => undefined;
const AREA_NUMBER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SEVERITY_COLOR: Record<TechnicalValidationSeverity, THREE.Color> = {
  valid: new THREE.Color('#1ad5f5'),
  overlap: new THREE.Color('#ff9f1c'),
  invalid: new THREE.Color('#ff315f'),
};

function entryHeight(entry: TechnicalValidationEntry, lift = 0) {
  return entry.entity.geometry.elevation
    + Math.max(0.16, entry.entity.geometry.extrusionHeight)
    + 0.13
    + lift;
}

function pushSegment(target: number[], start: readonly [number, number], end: readonly [number, number], height: number) {
  target.push(start[0], height, start[1], end[0], height, end[1]);
}

function pushColor(target: number[], color: THREE.Color, vertexCount = 2) {
  for (let index = 0; index < vertexCount; index += 1) {
    target.push(color.r, color.g, color.b);
  }
}

function createOverlayBuffers(entries: TechnicalValidationEntry[]) {
  const outlinePositions: number[] = [];
  const outlineColors: number[] = [];
  const boundsPositions: number[] = [];
  const pointPositions: number[] = [];
  const pointColors: number[] = [];
  const boundsColor = new THREE.Color('#f3ff86');

  entries.forEach((entry) => {
    const height = entryHeight(entry);
    const severityColor = SEVERITY_COLOR[entry.severity];
    entry.entity.geometry.coordinates.forEach((sourceRing) => {
      const ring = withoutClosingPoint(sourceRing);
      ring.forEach((start, index) => {
        const end = ring[(index + 1) % ring.length];
        if (!end) return;
        pushSegment(outlinePositions, start, end, height);
        pushColor(outlineColors, severityColor);
      });
    });
    entry.vertices.forEach(([x, z]) => {
      pointPositions.push(x, height + 0.025, z);
      pushColor(pointColors, severityColor, 1);
    });

    const { minX, maxX, minZ, maxZ } = entry.bounds;
    const corners = [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ] as const;
    corners.forEach((start, index) => {
      pushSegment(boundsPositions, start, corners[(index + 1) % corners.length], height + 0.06);
    });
  });

  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
  outlineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(outlineColors, 3));
  const boundsGeometry = new THREE.BufferGeometry();
  boundsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(boundsPositions, 3));
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
  pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));

  return { outlineGeometry, boundsGeometry, pointGeometry, boundsColor };
}

function areaLabel(value: number | null) {
  return value == null ? '—' : `${AREA_NUMBER.format(value)} m²`;
}

function differenceLabel(value: number | null) {
  if (value == null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${AREA_NUMBER.format(value)} m²`;
}

export const TechnicalValidationOverlay = memo(function TechnicalValidationOverlay({
  entities,
  lots,
}: {
  entities: MapEntity[];
  lots: CommercialLot[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const entries = useMemo(
    () => buildTechnicalValidationReport(entities, lots),
    [entities, lots],
  );
  const buffers = useMemo(() => createOverlayBuffers(entries), [entries]);
  const labelEntries = useMemo(
    () => entries.filter((entry) => entry.lot || entry.severity !== 'valid'),
    [entries],
  );

  useEffect(() => {
    invalidate();
    return () => {
      buffers.outlineGeometry.dispose();
      buffers.boundsGeometry.dispose();
      buffers.pointGeometry.dispose();
      invalidate();
    };
  }, [buffers, invalidate]);

  return (
    <group name="exporural-technical-validation" renderOrder={40}>
      <lineSegments geometry={buffers.outlineGeometry} raycast={NO_RAYCAST} renderOrder={40}>
        <lineBasicMaterial vertexColors depthTest={false} transparent opacity={0.96} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={buffers.boundsGeometry} raycast={NO_RAYCAST} renderOrder={39}>
        <lineBasicMaterial
          color={buffers.boundsColor}
          depthTest={false}
          transparent
          opacity={0.58}
          toneMapped={false}
        />
      </lineSegments>
      <points geometry={buffers.pointGeometry} raycast={NO_RAYCAST} renderOrder={41}>
        <pointsMaterial
          vertexColors
          depthTest={false}
          size={5}
          sizeAttenuation={false}
          toneMapped={false}
        />
      </points>
      {labelEntries.map((entry) => (
        <Html
          key={`technical:${entry.entity.id}`}
          position={[entry.centroid[0], entryHeight(entry, 0.34), entry.centroid[1]]}
          center
          distanceFactor={32}
          zIndexRange={[48, 30]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`commercial-map-validation-label is-${entry.severity}`}
            data-technical-validation-code={entry.code}
          >
            <strong>{entry.code}</strong>
            {entry.lot && (
              <>
                <span>Of. {areaLabel(entry.officialAreaSqm)}</span>
                <span>Calc. {areaLabel(entry.calculatedAreaSqm)}</span>
                <span>Δ {differenceLabel(entry.differenceSqm)}</span>
              </>
            )}
            {entry.selfIntersecting && <em>Auto-interseção</em>}
            {entry.overlappingCodes.length > 0 && (
              <em>Sobreposição: {entry.overlappingCodes.join(', ')}</em>
            )}
            {!entry.valid && !entry.selfIntersecting && <em>Geometria inválida</em>}
          </div>
        </Html>
      ))}
    </group>
  );
});
