import { memo, useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { ArrowRightLeft, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import {
  resolveCommercialPavilionWayfindingMarkers,
  type CommercialPavilionWayfindingMarker,
} from '../../utils/commercialPavilionWayfinding';

const NO_RAYCAST = () => undefined;

const MARKER_COLORS = {
  entrance: '#16815c',
  exit: '#c58a24',
  emergency: '#c64747',
  connection: '#5247a8',
} as const;

type WayfindingMaterials = Readonly<Record<
  CommercialPavilionWayfindingMarker['kind'],
  Readonly<{
    surface: THREE.MeshBasicMaterial;
    accent: THREE.MeshBasicMaterial;
  }>
>>;

function WayfindingIcon({ kind }: Pick<CommercialPavilionWayfindingMarker, 'kind'>) {
  if (kind === 'entrance') return <LogIn aria-hidden="true" />;
  if (kind === 'exit') return <LogOut aria-hidden="true" />;
  if (kind === 'emergency') return <ShieldAlert aria-hidden="true" />;
  return <ArrowRightLeft aria-hidden="true" />;
}

function markerPosition(
  marker: CommercialPavilionWayfindingMarker,
  layout: CommercialPavilionLayout,
): readonly [x: number, z: number] {
  const inset = Math.min(layout.interior.clearWidth, layout.interior.clearDepth) * 0.022;
  const [x, z] = marker.position;
  if (marker.edge === 'front') return [x, z - inset];
  if (marker.edge === 'rear') return [x, z + inset];
  if (marker.edge === 'left') return [x + inset, z];
  return [x - inset, z];
}

function WayfindingMarker({
  marker,
  layout,
  geometry,
  materials,
  targetEntityId,
  onNavigate,
}: {
  marker: CommercialPavilionWayfindingMarker;
  layout: CommercialPavilionLayout;
  geometry: THREE.BoxGeometry;
  materials: WayfindingMaterials;
  targetEntityId?: string;
  onNavigate: (targetEntityId: string) => void;
}) {
  const shortSide = Math.min(layout.interior.clearWidth, layout.interior.clearDepth);
  const [x, z] = markerPosition(marker, layout);
  const frontOrRear = marker.edge === 'front' || marker.edge === 'rear';
  const markerSpan = Math.min(
    Math.max(marker.span * 0.86, shortSide * 0.07),
    shortSide * (marker.kind === 'connection' ? 0.3 : 0.24),
  );
  const markerDepth = Math.max(shortSide * 0.025, 0.12);
  const canNavigate = marker.kind === 'connection' && Boolean(targetEntityId);

  return (
    <group
      name={`pavilion-wayfinding:${marker.id}`}
      position={[x, 0, z]}
      userData={{
        wayfindingId: marker.id,
        wayfindingKind: marker.kind,
        sourcePrecision: marker.sourcePrecision,
        targetPublicIdentifier: marker.targetPublicIdentifier,
      }}
      dispose={null}
    >
      <mesh
        position={[0, layout.interior.floorY + 0.018, 0]}
        scale={frontOrRear
          ? [markerSpan, 0.025, markerDepth]
          : [markerDepth, 0.025, markerSpan]}
        geometry={geometry}
        material={materials[marker.kind].surface}
        raycast={NO_RAYCAST}
        renderOrder={20}
        dispose={null}
      />
      <mesh
        position={[0, layout.interior.floorY + 0.034, 0]}
        scale={frontOrRear
          ? [markerSpan * 0.84, 0.018, markerDepth * 0.2]
          : [markerDepth * 0.2, 0.018, markerSpan * 0.84]}
        geometry={geometry}
        material={materials[marker.kind].accent}
        raycast={NO_RAYCAST}
        renderOrder={21}
        dispose={null}
      />
      <Html
        position={[0, layout.interior.floorY + shortSide * 0.065, 0]}
        center
        eps={0.001}
        zIndexRange={[14, 4]}
        style={{ pointerEvents: canNavigate ? 'auto' : 'none' }}
      >
        {marker.kind === 'connection' ? (
          <button
            type="button"
            className="commercial-pavilion-wayfinding-label is-connection"
            data-wayfinding-id={marker.id}
            data-wayfinding-kind={marker.kind}
            data-wayfinding-target={marker.targetPublicIdentifier}
            aria-label={`Abrir vista interna: ${marker.label}`}
            disabled={!targetEntityId}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (targetEntityId) onNavigate(targetEntityId);
            }}
          >
            <span className="commercial-pavilion-wayfinding-icon">
              <WayfindingIcon kind={marker.kind} />
            </span>
            <strong>{marker.label}</strong>
          </button>
        ) : (
          <div
            className={`commercial-pavilion-wayfinding-label is-${marker.kind}`}
            data-wayfinding-id={marker.id}
            data-wayfinding-kind={marker.kind}
            role="note"
            aria-label={marker.label}
          >
            <span className="commercial-pavilion-wayfinding-icon">
              <WayfindingIcon kind={marker.kind} />
            </span>
            <strong>{marker.label}</strong>
          </div>
        )}
      </Html>
    </group>
  );
}

export const CommercialPavilionWayfindingLayer = memo(function CommercialPavilionWayfindingLayer({
  layout,
  plan,
  entities,
  onNavigate,
}: {
  layout: CommercialPavilionLayout;
  plan: CommercialPavilionModulePlan;
  entities: readonly MapEntity[];
  onNavigate: (targetEntityId: string) => void;
}) {
  const markers = useMemo(() => resolveCommercialPavilionWayfindingMarkers(plan, {
    width: layout.interior.clearWidth,
    depth: layout.interior.clearDepth,
  }), [layout.interior.clearDepth, layout.interior.clearWidth, plan]);
  const targetEntityIdByPublicIdentifier = useMemo(() => new Map(entities.map((entity) => [
    entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR'),
    entity.id,
  ])), [entities]);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const materials = useMemo(() => Object.fromEntries(
    Object.entries(MARKER_COLORS).map(([kind, color]) => [
      kind,
      {
        surface: new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          toneMapped: false,
        }),
        accent: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      },
    ]),
  ) as WayfindingMaterials, []);

  useEffect(() => () => {
    geometry.dispose();
    Object.values(materials).forEach(({ surface, accent }) => {
      surface.dispose();
      accent.dispose();
    });
  }, [geometry, materials]);

  if (markers.length === 0) return null;
  return (
    <group name={`pavilion-wayfinding:${plan.publicIdentifier}`} dispose={null}>
      {markers.map((marker) => (
        <WayfindingMarker
          key={marker.id}
          marker={marker}
          layout={layout}
          geometry={geometry}
          materials={materials}
          targetEntityId={marker.targetPublicIdentifier
            ? targetEntityIdByPublicIdentifier.get(
                marker.targetPublicIdentifier.trim().toLocaleUpperCase('pt-BR'),
              )
            : undefined}
          onNavigate={onNavigate}
        />
      ))}
    </group>
  );
});
