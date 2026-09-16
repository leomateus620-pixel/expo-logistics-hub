import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Html } from '@react-three/drei';
import { ArrowRightLeft, ArrowUpDown, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import {
  resolveCommercialPavilionWayfindingMarkers,
  type CommercialPavilionWayfindingMarker,
} from '../../utils/commercialPavilionWayfinding';
import {
  resolveCommercialPavilionAccessTooltipLayout,
  type CommercialPavilionAccessScreenBounds,
  type CommercialPavilionAccessTooltipLayout,
} from '../../utils/commercialPavilionAccessTooltip';

const NO_RAYCAST = () => undefined;
const WAYFINDING_SCREEN_POINT = new THREE.Vector3();

/**
 * Half of the 44px hit target. The compact marker only needs to stay
 * tappable at the viewport edge; the real access point is never moved.
 */
const MARKER_SCREEN_MARGIN_PX = 24;
const MARKER_Z_INDEX_RANGE: [number, number] = [14, 4];
const ACTIVE_MARKER_Z_INDEX_RANGE: [number, number] = [28, 28];
const DEFAULT_TOOLTIP_LAYOUT: CommercialPavilionAccessTooltipLayout = { placement: 'top', shift: 0 };
const CONNECTION_TAP_HINT = 'Toque novamente para abrir a planta';
const CONNECTION_CLICK_HINT = 'Clique para abrir a planta';

function calculateWayfindingMarkerPosition(
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  WAYFINDING_SCREEN_POINT.setFromMatrixPosition(object.matrixWorld).project(camera);
  const x = WAYFINDING_SCREEN_POINT.x * size.width / 2 + size.width / 2;
  const y = -WAYFINDING_SCREEN_POINT.y * size.height / 2 + size.height / 2;
  const safeMargin = Math.min(MARKER_SCREEN_MARGIN_PX, size.width * 0.24);
  return [
    THREE.MathUtils.clamp(x, safeMargin, size.width - safeMargin),
    y,
  ];
}

const MARKER_COLORS = {
  entrance: '#16815c',
  exit: '#c58a24',
  bidirectional: '#247b78',
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
  if (kind === 'bidirectional') return <ArrowUpDown aria-hidden="true" />;
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

function resolveTooltipBounds(anchor: HTMLElement): CommercialPavilionAccessScreenBounds {
  const viewport = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  // The drei Html host is appended next to the canvas, so its parent is the
  // clipped map viewport. The bubble must stay inside both rectangles.
  const host = anchor.parentElement?.parentElement?.parentElement;
  if (!host) return viewport;
  const rect = host.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return viewport;
  return {
    left: Math.max(viewport.left, rect.left),
    top: Math.max(viewport.top, rect.top),
    right: Math.min(viewport.right, rect.right),
    bottom: Math.min(viewport.bottom, rect.bottom),
  };
}

function PavilionAccessTooltip({
  id,
  anchorRef,
  label,
  hint,
}: {
  id: string;
  anchorRef: RefObject<HTMLButtonElement>;
  label: string;
  hint?: string;
}) {
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState(DEFAULT_TOOLTIP_LAYOUT);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;
    const next = resolveCommercialPavilionAccessTooltipLayout(
      anchor.getBoundingClientRect(),
      { width: bubble.offsetWidth, height: bubble.offsetHeight },
      resolveTooltipBounds(anchor),
    );
    setLayout((current) => (
      current.placement === next.placement && current.shift === next.shift ? current : next
    ));
  }, [anchorRef, label, hint]);

  return (
    <span
      ref={bubbleRef}
      id={id}
      role="tooltip"
      className={`commercial-pavilion-access-tooltip is-${layout.placement}`}
      style={{ '--access-tooltip-shift': `${layout.shift}px` } as CSSProperties}
    >
      <span className="commercial-pavilion-access-tooltip-body">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </span>
  );
}

/**
 * Compact access marker shared by every pavilion interior: a fixed 44px hit
 * target with a small icon disc anchored exactly at the access point. The
 * description only appears on hover, focus, click or tap.
 */
function PavilionAccessMarker({
  marker,
  layout,
  geometry,
  materials,
  targetEntityId,
  active,
  onActivate,
  onNavigate,
}: {
  marker: CommercialPavilionWayfindingMarker;
  layout: CommercialPavilionLayout;
  geometry: THREE.BoxGeometry;
  materials: WayfindingMaterials;
  targetEntityId?: string;
  active: boolean;
  onActivate: (markerId: string | null) => void;
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
  const isConnection = marker.kind === 'connection';
  const canNavigate = isConnection && Boolean(targetEntityId);
  const tooltipId = `pavilion-access-tooltip-${useId()}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const lastPointerType = useRef('');
  const [hovered, setHovered] = useState(false);
  const open = hovered || active;

  // drei only refreshes the host z-index when the marker moves on screen, so
  // promote the open marker immediately to keep its bubble above neighbours.
  useLayoutEffect(() => {
    const host = htmlRef.current?.parentElement;
    if (!host) return;
    host.style.zIndex = `${open ? ACTIVE_MARKER_Z_INDEX_RANGE[0] : MARKER_Z_INDEX_RANGE[0]}`;
  }, [open]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    lastPointerType.current = event.pointerType;
  }, []);
  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') setHovered(true);
  }, []);
  const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') setHovered(false);
  }, []);
  const handleFocus = useCallback(() => setHovered(true), []);
  const handleBlur = useCallback(() => setHovered(false), []);
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setHovered(false);
    onActivate(null);
  }, [onActivate]);
  const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const pointerType = lastPointerType.current;
    lastPointerType.current = '';
    if (isConnection) {
      if (!targetEntityId) return;
      // Touch reveals the destination first; a second tap follows the link.
      if (pointerType === 'touch' && !active) {
        onActivate(marker.id);
        return;
      }
      onActivate(null);
      onNavigate(targetEntityId);
      return;
    }
    onActivate(active ? null : marker.id);
  }, [active, isConnection, marker.id, onActivate, onNavigate, targetEntityId]);

  const hint = canNavigate
    ? (active ? CONNECTION_TAP_HINT : CONNECTION_CLICK_HINT)
    : undefined;

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
        ref={htmlRef}
        position={[0, layout.interior.floorY + shortSide * 0.065, 0]}
        center
        eps={0.001}
        zIndexRange={open ? ACTIVE_MARKER_Z_INDEX_RANGE : MARKER_Z_INDEX_RANGE}
        calculatePosition={calculateWayfindingMarkerPosition}
        style={{ pointerEvents: 'none' }}
      >
        <button
          ref={buttonRef}
          type="button"
          className={`commercial-pavilion-access-marker is-${marker.kind}${open ? ' is-active' : ''}`}
          data-wayfinding-id={marker.id}
          data-wayfinding-kind={marker.kind}
          data-wayfinding-edge={marker.edge}
          data-wayfinding-target={marker.targetPublicIdentifier}
          aria-label={canNavigate ? `${marker.label}. Abrir vista interna` : marker.label}
          aria-describedby={open ? tooltipId : undefined}
          aria-expanded={isConnection ? undefined : active}
          aria-disabled={isConnection && !targetEntityId ? true : undefined}
          onPointerDown={handlePointerDown}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={handleClick}
        >
          <span className="commercial-pavilion-access-marker-icon" aria-hidden="true">
            <WayfindingIcon kind={marker.kind} />
          </span>
          {open ? (
            <PavilionAccessTooltip
              id={tooltipId}
              anchorRef={buttonRef}
              label={marker.label}
              hint={hint}
            />
          ) : null}
        </button>
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
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  useEffect(() => {
    setActiveMarkerId(null);
  }, [plan.publicIdentifier]);

  // One document listener, registered only while a bubble is pinned, closes
  // it on outside taps (including map pans) and on Escape.
  useEffect(() => {
    if (!activeMarkerId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('.commercial-pavilion-access-marker')) return;
      setActiveMarkerId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveMarkerId(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeMarkerId]);

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
        <PavilionAccessMarker
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
          active={activeMarkerId === marker.id}
          onActivate={setActiveMarkerId}
          onNavigate={onNavigate}
        />
      ))}
    </group>
  );
});
