import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EARTH_RADIUS,
  geoJsonBoundaryRings,
  latitudeLongitudeToVector3,
  parseBoundaryGeoJson,
  SANTA_ROSA_COORDINATES,
} from '../geo';
import { useAlvoradaTimeline } from '../TimelineContext';
import { bellCurve, smoothRange } from '../timeline';

interface GeographicBoundaryProps {
  color: string;
  end: number;
  opacity: number;
  radius: number;
  start: number;
  url: string;
}

function GeographicBoundary({ color, end, opacity, radius, start, url }: GeographicBoundaryProps) {
  const source = useLoader(THREE.FileLoader, url) as string;
  const timeline = useAlvoradaTimeline();
  const lines = useMemo(() => (
    geoJsonBoundaryRings(parseBoundaryGeoJson(source), radius).map((points) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.setDrawRange(0, 0);
      const material = new THREE.LineBasicMaterial({
        color,
        depthWrite: false,
        opacity: 0,
        toneMapped: false,
        transparent: true,
      });
      return new THREE.Line(geometry, material);
    })
  ), [color, radius, source]);

  useEffect(() => () => {
    lines.forEach((line) => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
  }, [lines]);

  useFrame(() => {
    const reveal = smoothRange(timeline.current.elapsed, start, end);
    const fade = 1 - smoothRange(timeline.current.elapsed, end + 0.7, end + 1.5);

    lines.forEach((line) => {
      const count = line.geometry.getAttribute('position').count;
      line.geometry.setDrawRange(0, Math.max(0, Math.floor(count * reveal)));
      (line.material as THREE.LineBasicMaterial).opacity = opacity * fade;
    });
  });

  return (
    <group>
      {lines.map((line, index) => (
        <primitive key={`${url}-${index}`} object={line} />
      ))}
    </group>
  );
}

function createMarkerLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(2, 12, 28, 0.82)';
  context.beginPath();
  context.roundRect(20, 18, 600, 124, 62);
  context.fill();
  context.strokeStyle = 'rgba(255, 213, 116, 0.72)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#fff8e8';
  context.font = '700 62px Inter, Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText('Santa Rosa', 82, 82);
  context.fillStyle = '#ff9f43';
  context.beginPath();
  context.arc(51, 80, 11, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function SantaRosaMarker() {
  const timeline = useAlvoradaTimeline();
  const { camera, size } = useThree();
  const mobile = size.width < 760;
  const root = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const labelMaterial = useRef<THREE.SpriteMaterial>(null);
  const labelTexture = useMemo(createMarkerLabelTexture, []);
  const position = useMemo(() => latitudeLongitudeToVector3(
    SANTA_ROSA_COORDINATES.latitude,
    SANTA_ROSA_COORDINATES.longitude,
    EARTH_RADIUS + 0.08,
  ), []);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    position.clone().normalize(),
  ), [position]);

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const reveal = smoothRange(elapsed, 2.72, 3.12);
    const fade = 1 - smoothRange(elapsed, 4.34, 4.82);
    const pulse = bellCurve(elapsed, 3.05, 3.25, 3.62)
      + bellCurve(elapsed, 4.02, 4.18, 4.45) * 0.18;
    const visibility = reveal * fade;

    if (root.current) root.current.visible = visibility > 0.002;
    if (marker.current) {
      const screenSpaceScale = THREE.MathUtils.clamp(
        camera.position.distanceTo(position) * 0.22,
        0.035,
        0.72,
      );
      const scale = Math.max(
        0.001,
        visibility * screenSpaceScale * (1 + pulse * 0.12),
      );
      marker.current.scale.setScalar(scale);
    }
    if (ringMaterial.current) ringMaterial.current.opacity = visibility * (0.72 - pulse * 0.3);
    if (labelMaterial.current) labelMaterial.current.opacity = visibility;
  });

  return (
    <group ref={root} position={position} quaternion={orientation} visible={false}>
      <group ref={marker} scale={0.001}>
        <mesh position={[0, 0, 0.012]}>
          <ringGeometry args={[0.06, 0.086, 48]} />
          <meshBasicMaterial
            ref={ringMaterial}
            color="#ffb24d"
            opacity={0}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <sphereGeometry args={[0.035, 24, 16]} />
          <meshBasicMaterial color="#fff4d1" toneMapped={false} />
        </mesh>
        <sprite
          position={mobile ? [0, 0.29, 0.09] : [0.31, 0.11, 0.09]}
          scale={mobile ? [0.5, 0.125, 1] : [0.58, 0.145, 1]}
        >
          <spriteMaterial
            ref={labelMaterial}
            map={labelTexture}
            opacity={0}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      </group>
    </group>
  );
}

export function BrazilLayer() {
  return (
    <GeographicBoundary
      color="#b9d9ff"
      end={1.15}
      opacity={0.48}
      radius={EARTH_RADIUS + 0.022}
      start={0.35}
      url="/alvorada/brazil-min.geojson"
    />
  );
}

export function RioGrandeDoSulLayer() {
  return (
    <GeographicBoundary
      color="#ffd08a"
      end={2.95}
      opacity={0.96}
      radius={EARTH_RADIUS + 0.045}
      start={2.08}
      url="/alvorada/rio-grande-do-sul-min.geojson"
    />
  );
}
