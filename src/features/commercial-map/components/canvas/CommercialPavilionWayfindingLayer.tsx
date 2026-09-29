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
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { ArrowRightLeft, ArrowUpDown, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import * as THREE from 'three';
import './pavilion-wayfinding.css';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR } from '../../utils/contextualViewport';
import { type DimensionScreenRect } from '../../utils/pavilionDimensions';
import { layoutPavilionAccess } from '../../utils/pavilionAccessVisibility';
import { createCommercialPavilionModuleProjectionFrame, projectCommercialPavilionModuleRect, type CommercialPavilionLocalRect } from '../../utils/commercialPavilionModules';
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

/** Access anchors never move to accommodate screen edges. */
const MARKER_Z_INDEX_RANGE: [number, number] = [14, 4];
const ACTIVE_MARKER_Z_INDEX_RANGE: [number, number] = [28, 28];
const DEFAULT_TOOLTIP_LAYOUT: CommercialPavilionAccessTooltipLayout = { placement: 'top', shift: 0 };
const HTML_HOST_STYLE: CSSProperties = { pointerEvents: 'none' };
const CONNECTION_TAP_HINT = 'Toque novamente para abrir a planta';
const CONNECTION_CLICK_HINT = 'Clique para abrir a planta';

function isKeyboardFocus(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

function calculateWayfindingMarkerPosition(
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  WAYFINDING_SCREEN_POINT.setFromMatrixPosition(object.matrixWorld).project(camera);
  const x = WAYFINDING_SCREEN_POINT.x * size.width / 2 + size.width / 2;
  const y = -WAYFINDING_SCREEN_POINT.y * size.height / 2 + size.height / 2;
  return [x, y]; // Never clamp: an offscreen access stays anchored to the plan.
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
  protectedRects,
}: {
  marker: CommercialPavilionWayfindingMarker;
  layout: CommercialPavilionLayout;
  geometry: THREE.BoxGeometry;
  materials: WayfindingMaterials;
  targetEntityId?: string;
  active: boolean;
  onActivate: (markerId: string | null) => void;
  onNavigate: (targetEntityId: string) => void;
  protectedRects: readonly CommercialPavilionLocalRect[];
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
  const reactId = useId();
  const tooltipId = `pavilion-access-tooltip-${reactId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const markerGroupRef = useRef<THREE.Group>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const leaderRef = useRef<SVGLineElement>(null);
  const arrowPoints = useMemo(() => [new THREE.Vector3(), new THREE.Vector3()], []);
  const htmlRef = useRef<HTMLDivElement>(null);
  const lastPointerType = useRef('');
  const [hovered, setHovered] = useState(false);
  const open = hovered || active;
  const lastProjection = useRef('');
  useEffect(() => {
    const dirty = () => { lastProjection.current = ''; };
    window.addEventListener('commercial-map-panel-resize', dirty);
    return () => window.removeEventListener('commercial-map-panel-resize', dirty);
  }, []);

  useFrame(({ camera, size, gl }) => {
    if (!markerGroupRef.current || !iconRef.current || !buttonRef.current) return;
    camera.updateMatrixWorld();
    markerGroupRef.current.updateWorldMatrix(true, false);
    const signature=[size.width,size.height,open,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,...markerGroupRef.current.matrixWorld.elements].join(',');
    if (signature === lastProjection.current) return;
    lastProjection.current=signature;
    const [origin, normal] = arrowPoints;
    origin.set(marker.position[0]-x, layout.interior.floorY + 0.05, marker.position[1]-z).applyMatrix4(markerGroupRef.current.matrixWorld).project(camera);
    const px = (origin.x + 1) * size.width / 2, py = (1 - origin.y) * size.height / 2;
    const obstacles: DimensionScreenRect[] = [];
    const parent = markerGroupRef.current.parent;
    if (parent) for (const rect of protectedRects) {
      const bounds: DimensionScreenRect = { left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity };
      for (const [dx, dz] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
        normal.set(rect.centerX + dx * rect.width / 2, layout.interior.floorY + 0.05, rect.centerZ + dz * rect.depth / 2).applyMatrix4(parent.matrixWorld).project(camera);
        const x = (normal.x+1)*size.width/2, y=(1-normal.y)*size.height/2;
        bounds.left=Math.min(bounds.left,x); bounds.right=Math.max(bounds.right,x); bounds.top=Math.min(bounds.top,y); bounds.bottom=Math.max(bounds.bottom,y);
      }
      obstacles.push(bounds);
    }
    const canvasRect=gl.domElement.getBoundingClientRect();
    const shell=gl.domElement.closest('.public-map-shell, .commercial-map-shell') ?? gl.domElement.parentElement;
    shell?.querySelectorAll<HTMLElement>(`${COMMERCIAL_MAP_OBSTRUCTION_SELECTOR}, [data-commercial-map-interior-controls]`).forEach(element => {
      if(!element.getClientRects().length) return;
      const rect=element.getBoundingClientRect();
      obstacles.push({left:rect.left-canvasRect.left-4,right:rect.right-canvasRect.left+4,top:rect.top-canvasRect.top-4,bottom:rect.bottom-canvasRect.top+4});
    });
    const outwardX=marker.edge==='left'?-1:marker.edge==='right'?1:0;
    const outwardZ=marker.edge==='rear'?-1:marker.edge==='front'?1:0;
    normal.set(marker.position[0]-x+outwardX, layout.interior.floorY+.05, marker.position[1]-z+outwardZ)
      .applyMatrix4(markerGroupRef.current.matrixWorld).project(camera);
    const badge = origin.z < -1 || origin.z > 1 ? null : layoutPavilionAccess([px,py],
      [(normal.x-origin.x)*size.width, -(normal.y-origin.y)*size.height],size,obstacles);
    buttonRef.current.style.visibility = badge ? '' : 'hidden';
    if (badge) {
      buttonRef.current.style.width=buttonRef.current.style.height=`${badge.size}px`;
      buttonRef.current.style.transform=`translate(${badge.dx}px, ${badge.dy}px)`;
      leaderRef.current?.setAttribute('x1',String(badge.size/2-badge.dx));
      leaderRef.current?.setAttribute('y1',String(badge.size/2-badge.dy));
    }
    if (!marker.orientToWall) return;
    origin.set(0, 0, 0).applyMatrix4(markerGroupRef.current.matrixWorld).project(camera);
    normal.set(frontOrRear ? 0 : 1, 0, frontOrRear ? 1 : 0)
      .applyMatrix4(markerGroupRef.current.matrixWorld).project(camera);
    const angle = Math.atan2(-(normal.y - origin.y) * size.height, (normal.x - origin.x) * size.width);
    iconRef.current.style.transform = `rotate(${angle * 180 / Math.PI - 90}deg)`;
  });

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
  const handleFocus = useCallback((event: ReactFocusEvent<HTMLButtonElement>) => {
    // Only keyboard focus reveals the bubble; pointer focus is handled by
    // hover/tap so a second tap can close it even while the button is focused.
    if (isKeyboardFocus(event.currentTarget)) setHovered(true);
  }, []);
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
    if (active) setHovered(false);
    onActivate(active ? null : marker.id);
  }, [active, isConnection, marker.id, onActivate, onNavigate, targetEntityId]);

  const hint = canNavigate
    ? (active ? CONNECTION_TAP_HINT : CONNECTION_CLICK_HINT)
    : undefined;

  return (
    <group
      ref={markerGroupRef}
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
        position={[marker.position[0]-x, layout.interior.floorY + 0.05, marker.position[1]-z]}
        center
        eps={0.001}
        zIndexRange={open ? ACTIVE_MARKER_Z_INDEX_RANGE : MARKER_Z_INDEX_RANGE}
        calculatePosition={calculateWayfindingMarkerPosition}
        style={HTML_HOST_STYLE}
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
          <svg className="commercial-pavilion-access-leader" aria-hidden="true"><line ref={leaderRef} x2="50%" y2="50%" /></svg>
          <span ref={iconRef} className="commercial-pavilion-access-marker-icon" aria-hidden="true">
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
  const protectedRects = useMemo(() => {
    const frame = createCommercialPavilionModuleProjectionFrame(plan, { width:layout.interior.clearWidth, depth:layout.interior.clearDepth });
    return plan.cells.flatMap(cell => cell.shape?.renderParts ?? [cell]).map(rect => projectCommercialPavilionModuleRect(rect,frame));
  }, [layout.interior.clearWidth, layout.interior.clearDepth, plan]);
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
          protectedRects={protectedRects}
        />
      ))}
    </group>
  );
});
