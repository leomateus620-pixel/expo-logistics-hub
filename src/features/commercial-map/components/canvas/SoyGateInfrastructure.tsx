import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  buildSoyRestroomParts,
  buildGateNineTankParts,
} from '../../utils/soyGateArchitecture';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';
import type { LactalisStageMaterialSet } from './LactalisCulturalStage';

const NO_RAYCAST = () => undefined;
function Signage() {
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#24493e';
    ctx.fillRect(0, 0, 1024, 128);
    ['MASCULINO', 'FEMININO'].forEach((label, i) => {
      const x = i * 512;
      ctx.strokeStyle = '#d5d3b5';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 5, 5, 502, 118);
      ctx.fillStyle = '#f3f0df';
      ctx.beginPath();
      ctx.arc(x + 51, 30, 10, 0, Math.PI * 2);
      ctx.fill();
      if (i === 1) {
        ctx.beginPath();
        ctx.moveTo(x + 51, 44);
        ctx.lineTo(x + 30, 86);
        ctx.lineTo(x + 72, 86);
        ctx.fill();
      } else ctx.fillRect(x + 37, 45, 28, 37);
      ctx.fillRect(x + 37, 80, 10, 28);
      ctx.fillRect(x + 55, 80, 10, 28);
      ctx.font = 'bold 49px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 296, 66, 395);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.88,
      metalness: 0,
      name: 'E07:physical-signs',
    });
    return { texture, material };
  }, []);
  useEffect(
    () => () => {
      resources.texture.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  const geometry = useMemo(() => {
    const parts = [-1, 1].map((side, index) => {
      const g = new THREE.PlaneGeometry(0.57, 0.075);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) + index) / 2);
      g.translate(side * 0.34, 0.417, 0.922);
      return g;
    });
    const merged = mergeBufferGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      name="E07:Masculino-left-Feminino-right"
      geometry={geometry}
      material={resources.material}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

export function SoyRestroom({
  materials,
}: {
  materials: LactalisStageMaterialSet;
}) {
  const parts = useMemo(buildSoyRestroomParts, []);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return (
    <group name="soy-restroom-E07" dispose={null}>
      {parts.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={materials[p.key]}
          castShadow={p.key !== 'metal'}
          receiveShadow
          raycast={NO_RAYCAST}
        />
      ))}
      <Signage />
    </group>
  );
}

export function GateNineTanks({
  bounds,
  materials,
}: {
  bounds: StrategicLandmarkBounds;
  materials: LactalisStageMaterialSet;
}) {
  const parts = useMemo(() => buildGateNineTankParts(bounds), [bounds]);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return (
    <group name="gate9-three-reservoirs" dispose={null}>
      {parts.map((p) => (
        <mesh
          key={p.key}
          geometry={p.geometry}
          material={materials[p.key]}
          castShadow
          receiveShadow
          raycast={NO_RAYCAST}
        />
      ))}
    </group>
  );
}
