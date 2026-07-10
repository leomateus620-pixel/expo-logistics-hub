import { memo, Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Html, OrbitControls, Preload, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CLASSIFICATION_COLORS, CAMERA_PRESETS, MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH, OFFICIAL_REFERENCE_IMAGE, STATUS_CONFIG } from '../../constants';
import { geometryCentroid, withoutClosingPoint } from '../../utils/geometry';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialLot, MapCalibration, MapEntity } from '../../types';

interface CommercialMapCanvasProps {
  entities: MapEntity[];
  lots: CommercialLot[];
  calibration: MapCalibration | null;
}

function ReferenceUnderlay({ calibration }: { calibration: MapCalibration | null }) {
  const referenceVisible = useCommercialMapStore((state) => state.referenceVisible);
  const referenceOpacity = useCommercialMapStore((state) => state.referenceOpacity);
  const imageUrl = calibration?.referenceImageUrl || calibration?.referenceImagePath || OFFICIAL_REFERENCE_IMAGE;
  const texture = useTexture(imageUrl);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  if (!referenceVisible) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, -THREE.MathUtils.degToRad(calibration?.imageRotationDegrees ?? 0)]}
      position={[calibration?.imageOffsetX ?? 0, -0.035, calibration?.imageOffsetY ?? 0]}
      scale={[calibration?.imageScaleX ?? 1, calibration?.imageScaleY ?? 1, 1]}
      receiveShadow
    >
      <planeGeometry args={[MAP_REFERENCE_WIDTH, MAP_REFERENCE_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent opacity={referenceOpacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function createEntityGeometry(entity: MapEntity) {
  const outer = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  entity.geometry.coordinates.slice(1).forEach((holeRing) => {
    const hole = new THREE.Path();
    withoutClosingPoint(holeRing).forEach(([x, z], index) => {
      if (index === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    shape.holes.push(hole);
  });
  const height = Math.max(0.025, entity.geometry.extrusionHeight);
  const bevel = height >= 0.4;
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel,
    bevelSegments: bevel ? 2 : 0,
    bevelSize: bevel ? Math.min(0.08, height * 0.06) : 0,
    bevelThickness: bevel ? Math.min(0.08, height * 0.06) : 0,
    curveSegments: 2,
  });
  extruded.rotateX(-Math.PI / 2);
  extruded.computeVertexNormals();
  return extruded;
}

const EntityMesh = memo(function EntityMesh({ entity, lot }: { entity: MapEntity; lot?: CommercialLot }) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const hoveredEntityId = useCommercialMapStore((state) => state.hoveredEntityId);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setHoveredEntityId = useCommercialMapStore((state) => state.setHoveredEntityId);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity[entity.layerId] ?? 1);
  const geometry = useMemo(() => createEntityGeometry(entity), [entity]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 24), [geometry]);
  const centroid = useMemo(() => geometryCentroid(entity.geometry), [entity.geometry]);
  const selected = selectedEntityId === entity.id;
  const hovered = hoveredEntityId === entity.id;
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const color = status?.color ?? CLASSIFICATION_COLORS[entity.classification];
  const isFlat = entity.geometry.extrusionHeight < 0.3;
  const showLabel = labelsVisible && (
    selected || hovered || entity.classification === 'GATE' || entity.classification === 'PAVILION'
    || entity.classification === 'PARKING' || entity.classification === 'WATER'
  );

  useEffect(() => () => {
    geometry.dispose();
    edges.dispose();
  }, [edges, geometry]);

  return (
    <group position={[0, entity.geometry.elevation + (selected ? 0.18 : hovered ? 0.08 : 0), 0]}>
      <mesh
        geometry={geometry}
        castShadow={!isFlat}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          setSelectedEntityId(entity.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
          setHoveredEntityId(entity.id);
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          setHoveredEntityId(null);
        }}
      >
        <meshStandardMaterial
          color={color}
          roughness={isFlat ? 0.9 : 0.68}
          metalness={0.02}
          transparent={layerOpacity < 1}
          opacity={layerOpacity}
          emissive={selected ? color : '#000000'}
          emissiveIntensity={selected ? 0.18 : hovered ? 0.08 : 0}
        />
      </mesh>
      <lineSegments geometry={edges} position={[0, 0.012, 0]}>
        <lineBasicMaterial
          color={selected ? '#fff8d6' : status?.border ?? '#1f3327'}
          transparent
          opacity={selected ? 1 : Math.min(0.78, layerOpacity)}
        />
      </lineSegments>
      {showLabel && (
        <Html
          position={[centroid[0], entity.geometry.extrusionHeight + 0.45, centroid[1]]}
          center
          distanceFactor={selected ? 38 : 44}
          zIndexRange={[18, 2]}
          style={{ pointerEvents: 'none' }}
        >
          <div className={`commercial-map-label ${selected ? 'is-selected' : ''}`}>
            <span>{entity.publicIdentifier}</span>
            {(selected || hovered) && <strong>{entity.name}</strong>}
            {status && <small><b aria-hidden="true">{status.symbol}</b> {status.label}</small>}
          </div>
        </Html>
      )}
    </group>
  );
});

function CameraRig({ selectedEntity }: { selectedEntity: MapEntity | null }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const preset = useCommercialMapStore((state) => state.cameraPreset);
  const cameraSequence = useCommercialMapStore((state) => state.cameraSequence);
  const targetPosition = useRef(new THREE.Vector3(...CAMERA_PRESETS.overview.position));
  const targetLookAt = useRef(new THREE.Vector3(...CAMERA_PRESETS.overview.target));
  const animating = useRef(true);

  useEffect(() => {
    if (selectedEntity) {
      const [x, z] = geometryCentroid(selectedEntity.geometry);
      const height = Math.max(1, selectedEntity.geometry.extrusionHeight);
      targetLookAt.current.set(x, height * 0.35, z);
      targetPosition.current.set(x + 15, Math.max(18, height * 8), z + 19);
    } else {
      const config = CAMERA_PRESETS[preset];
      const portraitScale = size.width / Math.max(size.height, 1) < 0.72 ? 3.15 : 1;
      targetPosition.current.set(
        config.position[0] * portraitScale,
        config.position[1] * portraitScale,
        config.position[2] * portraitScale,
      );
      targetLookAt.current.set(...config.target);
    }
    animating.current = true;
  }, [cameraSequence, preset, selectedEntity, size.height, size.width]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 5.2);
    camera.position.lerp(targetPosition.current, factor);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, factor);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(targetPosition.current) < 0.08
      && (!controlsRef.current || controlsRef.current.target.distanceTo(targetLookAt.current) < 0.05)) {
      animating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      minDistance={8}
      maxDistance={520}
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI / 2.1}
      screenSpacePanning
      zoomToCursor
    />
  );
}

function Scene({ entities, lots, calibration }: CommercialMapCanvasProps) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;

  return (
    <>
      <color attach="background" args={['#e9eee8']} />
      <fog attach="fog" args={['#e9eee8', 360, 690]} />
      <ambientLight intensity={1.75} />
      <hemisphereLight args={['#ffffff', '#57705e', 1.25]} />
      <directionalLight
        position={[-34, 68, 28]}
        intensity={2.2}
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 512 : 2048}
        shadow-mapSize-height={reducedGraphics ? 512 : 2048}
        shadow-camera-left={-72}
        shadow-camera-right={72}
        shadow-camera-top={54}
        shadow-camera-bottom={-54}
        shadow-bias={-0.00012}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[MAP_REFERENCE_WIDTH + 8, MAP_REFERENCE_HEIGHT + 8]} />
        <meshStandardMaterial color="#d8e2d5" roughness={1} />
      </mesh>
      <ReferenceUnderlay calibration={calibration} />
      {entities.map((entity) => <EntityMesh key={entity.id} entity={entity} lot={lotByEntity.get(entity.id)} />)}
      <CameraRig selectedEntity={selectedEntity} />
      <AdaptiveDpr pixelated={reducedGraphics} />
      <Preload all />
    </>
  );
}

function CanvasLoader() {
  return (
    <Html center>
      <div className="commercial-map-loading">
        <span />
        <strong>Preparando o parque digital</strong>
        <small>Carregando geometrias e materiais…</small>
      </div>
    </Html>
  );
}

export function CommercialMapCanvas({ entities, lots, calibration }: CommercialMapCanvasProps) {
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const portrait = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const initialCameraPosition = portrait
    ? CAMERA_PRESETS.overview.position.map((value) => value * 3.15) as [number, number, number]
    : CAMERA_PRESETS.overview.position;
  return (
    <Canvas
      className="commercial-map-canvas"
      camera={{ position: initialCameraPosition, fov: 38, near: 0.1, far: 720 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={() => setSelectedEntityId(null)}
    >
      <Suspense fallback={<CanvasLoader />}>
        <Scene entities={entities} lots={lots} calibration={calibration} />
      </Suspense>
    </Canvas>
  );
}
