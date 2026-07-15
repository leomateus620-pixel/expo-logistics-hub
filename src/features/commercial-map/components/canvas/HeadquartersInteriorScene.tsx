import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MapEntity } from '../../types';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UP = new THREE.Vector3(0, 1, 0);

function createPosterWallTexture(era: 'historical' | 'contemporary') {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = era === 'historical' ? '#f2f0e8' : '#b7b2a7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const historicalColors = ['#17633f', '#e0b83c', '#e8d37b', '#f3f0e3', '#ebe6dc', '#ece8df', '#164076', '#1e8ba6', '#1786ad', '#3184a8'];
  const contemporaryColors = ['#1b83a5', '#e5d7a7', '#226e8e', '#c4a03f', '#7d4b31', '#1b654d', '#be6b3f', '#84723e', '#5b745b', '#2b6e6d', '#d26b38', '#264f6e'];
  const colors = era === 'historical' ? historicalColors : contemporaryColors;
  const columns = era === 'historical' ? 4 : 4;
  const rows = era === 'historical' ? 3 : 3;
  const outerX = 54;
  const outerY = 44;
  const gap = 18;
  const cardWidth = (canvas.width - outerX * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (canvas.height - outerY * 2 - gap * (rows - 1)) / rows;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = outerX + column * (cardWidth + gap);
    const y = outerY + row * (cardHeight + gap);
    context.save();
    context.shadowColor = 'rgba(48, 38, 25, .24)';
    context.shadowBlur = 9;
    context.shadowOffsetY = 4;
    context.fillStyle = '#d7c5a2';
    context.fillRect(x - 5, y - 5, cardWidth + 10, cardHeight + 10);
    context.shadowColor = 'transparent';
    context.fillStyle = colors[index % colors.length];
    context.fillRect(x, y, cardWidth, cardHeight);

    const accent = index % 3 === 0 ? '#f1d24e' : index % 3 === 1 ? '#f4eee0' : '#80a85f';
    context.globalAlpha = 0.9;
    context.fillStyle = accent;
    context.beginPath();
    context.ellipse(
      x + cardWidth * (0.34 + (index % 2) * 0.25),
      y + cardHeight * (0.37 + (index % 3) * 0.08),
      cardWidth * 0.24,
      cardHeight * 0.19,
      index * 0.17,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = index % 2 ? '#f8f4e8' : '#132f2a';
    context.font = `800 ${era === 'historical' ? 24 : 22}px Arial, sans-serif`;
    const edition = era === 'historical' ? index + 1 : index + 12;
    context.fillText(`${edition}ª FENA`, x + cardWidth / 2, y + cardHeight * 0.72);
    context.font = '900 31px Arial, sans-serif';
    context.fillText('SOJA', x + cardWidth / 2, y + cardHeight * 0.84);
    context.font = '600 11px Arial, sans-serif';
    context.fillText(index === columns * rows - 1 ? 'NOSSO OURO VEM DO CAMPO' : 'SANTA ROSA · RS', x + cardWidth / 2, y + cardHeight * 0.94);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function createWoodFloorTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#8a5637';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < 16; row += 1) {
    const y = row * 32;
    context.fillStyle = row % 3 === 0 ? '#9f6741' : row % 3 === 1 ? '#7f4c32' : '#905a39';
    context.fillRect(0, y + 1, canvas.width, 30);
    context.strokeStyle = 'rgba(54, 29, 17, .45)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
    const offset = row % 2 ? 86 : 0;
    for (let x = offset; x < canvas.width; x += 170) {
      context.strokeStyle = 'rgba(48, 26, 16, .28)';
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + 32);
      context.stroke();
    }
    context.strokeStyle = 'rgba(225, 170, 111, .13)';
    context.beginPath();
    context.moveTo(0, y + 9 + row % 5);
    context.bezierCurveTo(150, y + 3, 325, y + 22, 512, y + 11);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.8, 3.6);
  texture.anisotropy = 8;
  return texture;
}

function PosterWall({ era, position, rotation }: {
  era: 'historical' | 'contemporary';
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const texture = useMemo(() => createPosterWallTexture(era), [era]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : era === 'historical' ? '#e7d7a1' : '#7490a0',
    map: texture,
    roughness: 0.68,
    metalness: 0,
  }), [era, texture]);
  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <group position={position} rotation={rotation} raycast={NO_RAYCAST}>
      <mesh position={[0, 0, -0.035]} castShadow>
        <boxGeometry args={[3.75, 2.32, 0.075]} />
        <meshStandardMaterial color="#5a3523" roughness={0.72} />
      </mesh>
      <mesh material={material} position={[0, 0, 0.01]}>
        <planeGeometry args={[3.62, 2.18]} />
      </mesh>
    </group>
  );
}

function FenasojaInteriorIdentity() {
  const { texture, material } = useMemo(() => {
    let logoTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#f2eee4';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#e4a930';
        context.beginPath();
        context.arc(125, 128, 72, Math.PI, Math.PI * 2);
        context.fill();
        context.fillStyle = '#27764c';
        for (let index = 0; index < 4; index += 1) {
          context.beginPath();
          context.moveTo(57 + index * 34, 135);
          context.quadraticCurveTo(76 + index * 34, 214, 111 + index * 28, 216);
          context.lineTo(136 + index * 18, 145);
          context.closePath();
          context.fill();
        }
        context.fillStyle = '#173c2b';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.font = '900 86px Arial, sans-serif';
        context.fillText('FENASOJA', 230, 114);
        context.font = '700 27px Arial, sans-serif';
        context.fillStyle = '#647066';
        context.fillText('COMISSÃO CENTRAL · SANTA ROSA', 235, 176);
        logoTexture = new THREE.CanvasTexture(canvas);
        logoTexture.colorSpace = THREE.SRGBColorSpace;
        logoTexture.anisotropy = 8;
      }
    }
    return {
      texture: logoTexture,
      material: new THREE.MeshStandardMaterial({
        color: logoTexture ? '#ffffff' : '#f2eee4',
        map: logoTexture,
        roughness: 0.58,
      }),
    };
  }, []);
  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <mesh material={material} position={[0, 2.22, -3.425]} raycast={NO_RAYCAST}>
      <planeGeometry args={[3.25, 1.08]} />
    </mesh>
  );
}

function LoungeFurniture() {
  return (
    <group raycast={NO_RAYCAST}>
      <group position={[1.27, 0, -1.7]}>
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[2.25, 0.38, 0.78]} />
          <meshStandardMaterial color="#eee9dd" roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.86, -0.29]} castShadow rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[2.2, 0.78, 0.22]} />
          <meshStandardMaterial color="#f6f1e7" roughness={0.94} />
        </mesh>
        {[-0.73, 0, 0.73].map((x) => (
          <mesh key={x} position={[x, 0.57, 0.04]} castShadow>
            <boxGeometry args={[0.68, 0.14, 0.68]} />
            <meshStandardMaterial color={x === 0 ? '#e8e0d2' : '#f1eadf'} roughness={0.96} />
          </mesh>
        ))}
        {[-1.18, 1.18].map((x) => (
          <mesh key={x} position={[x, 0.59, 0]} castShadow>
            <boxGeometry args={[0.18, 0.68, 0.82]} />
            <meshStandardMaterial color="#e7dfd2" roughness={0.95} />
          </mesh>
        ))}
      </group>
      <group position={[0.8, 0, 0.15]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.62, 0.66, 0.09, 28]} />
          <meshStandardMaterial color="#6e4933" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.13, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.18, 0.26, 16]} />
          <meshStandardMaterial color="#353a36" roughness={0.45} metalness={0.18} />
        </mesh>
      </group>
    </group>
  );
}

function ReceptionDesk() {
  return (
    <group position={[-1.28, 0, -1.72]} raycast={NO_RAYCAST}>
      <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.95, 1.1, 0.62]} />
        <meshStandardMaterial color="#6f4932" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.12, 0.02]} castShadow>
        <boxGeometry args={[2.08, 0.12, 0.78]} />
        <meshStandardMaterial color="#d7c6aa" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.61, 0.321]}>
        <boxGeometry args={[1.35, 0.48, 0.02]} />
        <meshStandardMaterial color="#173f2a" roughness={0.54} />
      </mesh>
      <mesh position={[0, 0.61, 0.334]}>
        <planeGeometry args={[1.12, 0.22]} />
        <meshBasicMaterial color="#e6c455" toneMapped={false} />
      </mesh>
    </group>
  );
}

function InteriorPlant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale} raycast={NO_RAYCAST}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.16, 0.44, 16]} />
        <meshStandardMaterial color="#8e372c" roughness={0.83} />
      </mesh>
      <mesh position={[0, 0.64, 0]} castShadow>
        <coneGeometry args={[0.42, 0.9, 7]} />
        <meshStandardMaterial color="#246b3e" roughness={0.9} />
      </mesh>
    </group>
  );
}

function TrackLighting() {
  const fixtures = [-2.1, -0.72, 0.72, 2.1];
  return (
    <group raycast={NO_RAYCAST}>
      <mesh position={[0, 2.94, -0.55]}>
        <boxGeometry args={[5.1, 0.045, 0.055]} />
        <meshStandardMaterial color="#f5f2e9" roughness={0.52} />
      </mesh>
      {fixtures.map((x, index) => (
        <group key={x} position={[x, 2.83, -0.55]} rotation={[index % 2 ? -0.36 : -0.22, 0, index % 2 ? 0.1 : -0.12]}>
          <mesh>
            <cylinderGeometry args={[0.07, 0.1, 0.28, 12]} />
            <meshStandardMaterial color="#f8f5eb" roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.15, 0]}>
            <circleGeometry args={[0.065, 12]} />
            <meshBasicMaterial color="#ffe7ad" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function InteriorCameraRig({ entity }: { entity: MapEntity }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const animating = useRef(true);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera, gl, invalidate } = useThree();
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const center = useMemo(() => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ), [bounds.centerX, bounds.centerZ, entity.geometry.elevation]);
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
  ), [center, facing]);

  useEffect(() => {
    const start = toWorld(0, 1.62, 7.1);
    targetPosition.current.copy(toWorld(0.12, 1.56, 4.45));
    targetLookAt.current.copy(toWorld(0, 1.35, -0.45));
    camera.position.copy(start);
    camera.near = 0.045;
    camera.updateProjectionMatrix();
    controls.current?.target.copy(toWorld(0, 1.35, 0.15));
    controls.current?.update();
    animating.current = true;
    gl.domElement.style.cursor = 'grab';
    invalidate();
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [camera, gl, invalidate, toWorld]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 4.9);
    camera.position.lerp(targetPosition.current, factor);
    if (controls.current) {
      controls.current.target.lerp(targetLookAt.current, factor);
      controls.current.update();
    }
    if (camera.position.distanceTo(targetPosition.current) < 0.025) {
      camera.position.copy(targetPosition.current);
      controls.current?.target.copy(targetLookAt.current);
      controls.current?.update();
      animating.current = false;
    } else {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.085}
      enablePan={false}
      minDistance={1.35}
      maxDistance={5.3}
      minPolarAngle={0.38}
      maxPolarAngle={Math.PI / 2.02}
      target={toWorld(0, 1.35, -0.35).toArray()}
      onStart={() => { animating.current = false; }}
      onChange={() => invalidate()}
    />
  );
}

export const HeadquartersInteriorScene = memo(function HeadquartersInteriorScene({ entity, reducedGraphics }: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const floorTexture = useMemo(() => createWoodFloorTexture(), []);
  useEffect(() => () => floorTexture?.dispose(), [floorTexture]);

  return (
    <>
      <color attach="background" args={['#ddd8ca']} />
      <fog attach="fog" args={['#ddd8ca', 12, 25]} />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={['#fff7e6', '#624c37', 0.78]} />
      <directionalLight position={[bounds.centerX - 5, 8, bounds.centerZ + 6]} intensity={1.25} color="#fff2d1" castShadow={!reducedGraphics} shadow-mapSize-width={reducedGraphics ? 256 : 1024} shadow-mapSize-height={reducedGraphics ? 256 : 1024} shadow-bias={-0.00015} shadow-normalBias={0.035} />
      <pointLight position={[bounds.centerX, 2.62, bounds.centerZ - 0.5]} intensity={1.25} distance={8} decay={1.7} color="#ffe8b4" />
      <group position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]} rotation={[0, facing, 0]} dispose={null}>
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={NO_RAYCAST}>
          <planeGeometry args={[5.8, 7.1]} />
          <meshStandardMaterial color={floorTexture ? '#ffffff' : '#8b5738'} map={floorTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0, 1.52, -3.48]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[5.8, 3.04, 0.12]} />
          <meshStandardMaterial color="#ded8cc" roughness={0.95} />
        </mesh>
        <mesh position={[-2.84, 1.52, 0]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[0.12, 3.04, 7.08]} />
          <meshStandardMaterial color="#eeeae0" roughness={0.96} />
        </mesh>
        <mesh position={[2.84, 1.52, 0]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[0.12, 3.04, 7.08]} />
          <meshStandardMaterial color="#aca69a" roughness={0.96} />
        </mesh>
        <mesh position={[0, 3.06, 0]} receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[5.8, 0.1, 7.08]} />
          <meshStandardMaterial color="#eee9df" roughness={0.92} />
        </mesh>

        <mesh position={[0, 0.075, -3.39]} raycast={NO_RAYCAST}>
          <boxGeometry args={[5.75, 0.15, 0.13]} />
          <meshStandardMaterial color="#6d4028" roughness={0.78} />
        </mesh>
        <mesh position={[-2.77, 0.075, 0]} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.13, 0.15, 6.9]} />
          <meshStandardMaterial color="#6d4028" roughness={0.78} />
        </mesh>
        <mesh position={[2.77, 0.075, 0]} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.13, 0.15, 6.9]} />
          <meshStandardMaterial color="#6d4028" roughness={0.78} />
        </mesh>

        <PosterWall era="historical" position={[-2.765, 1.53, -0.62]} rotation={[0, Math.PI / 2, 0]} />
        <PosterWall era="contemporary" position={[2.765, 1.53, -0.64]} rotation={[0, -Math.PI / 2, 0]} />
        <FenasojaInteriorIdentity />
        <ReceptionDesk />
        <LoungeFurniture />
        <InteriorPlant position={[-2.34, 0, 2.38]} scale={0.9} />
        <InteriorPlant position={[2.32, 0, -2.65]} scale={0.78} />
        <TrackLighting />

        <group position={[0, 0, 3.15]} raycast={NO_RAYCAST}>
          <mesh position={[-2.12, 1.42, 0]}>
            <boxGeometry args={[1.36, 2.84, 0.12]} />
            <meshStandardMaterial color="#263d3d" roughness={0.72} />
          </mesh>
          <mesh position={[2.12, 1.42, 0]}>
            <boxGeometry args={[1.36, 2.84, 0.12]} />
            <meshStandardMaterial color="#263d3d" roughness={0.72} />
          </mesh>
          {[-1.25, -0.42, 0.42, 1.25].map((x) => (
            <mesh key={x} position={[x, 1.42, 0]}>
              <boxGeometry args={[0.76, 2.72, 0.055]} />
              <meshStandardMaterial color="#5f7778" roughness={0.2} metalness={0.03} transparent opacity={0.25} depthWrite={false} />
            </mesh>
          ))}
          {[-1.65, -0.83, 0.83, 1.65].map((x) => (
            <mesh key={x} position={[x, 1.42, 0.04]}>
              <boxGeometry args={[0.045, 2.82, 0.055]} />
              <meshStandardMaterial color="#eeeae0" roughness={0.5} />
            </mesh>
          ))}
        </group>
      </group>
      <InteriorCameraRig entity={entity} />
    </>
  );
});
