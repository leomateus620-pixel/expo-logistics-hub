import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { REAR_PARK_GATE_5, buildGate5Geometry } from '../../data/rearParkGate5';

interface RearParkGate5Props {
  reducedGraphics: boolean;
  visible?: boolean;
}

const NO_RAYCAST = () => undefined;

/**
 * Portão 5: apron pavimentado contínuo com a Rua Brasília, guaritas discretas,
 * cancelas e sinalização. Faz parte da circulação viária — o pavimento do
 * portão e o da via estão na mesma cota, sem degrau nem corte.
 */
export const RearParkGate5 = memo(function RearParkGate5({
  reducedGraphics,
  visible = true,
}: RearParkGate5Props) {
  const gate = useMemo(() => buildGate5Geometry(), []);

  if (!visible) return null;

  return (
    <group name="rear-park-gate-5" renderOrder={1}>
      <mesh
        position={[gate.apron.centerX, REAR_PARK_GATE_5.roadElevation - 0.002, gate.apron.centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={NO_RAYCAST}
        receiveShadow={!reducedGraphics}
      >
        <planeGeometry args={[gate.apron.width, gate.apron.depth]} />
        <meshStandardMaterial
          color="#5f635f"
          roughness={0.97}
          metalness={0}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {gate.booths.map((booth, index) => (
        <group key={`gate5-booth-${index}`}>
          <mesh
            position={[booth.x, booth.height / 2, booth.z]}
            raycast={NO_RAYCAST}
            castShadow={!reducedGraphics}
          >
            <boxGeometry args={[booth.width, booth.height, booth.depth]} />
            <meshStandardMaterial color="#e8e6df" roughness={0.72} metalness={0.05} />
          </mesh>
          <mesh position={[booth.x, booth.height + 0.035, booth.z]} raycast={NO_RAYCAST}>
            <boxGeometry args={[booth.width * 1.16, 0.07, booth.depth * 1.2]} />
            <meshStandardMaterial color="#0f5132" roughness={0.6} metalness={0.1} />
          </mesh>
        </group>
      ))}

      {gate.barriers.map((barrier, index) => (
        <mesh
          key={`gate5-barrier-${index}`}
          position={[barrier.x, 0.24, barrier.z]}
          rotation={[0, 0, Math.PI / 2]}
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry args={[0.018, 0.018, barrier.length, 6]} />
          <meshStandardMaterial color="#d94b3a" roughness={0.5} metalness={0.15} />
        </mesh>
      ))}

      <mesh position={[gate.signPost.x, gate.signPost.height / 2, gate.signPost.z]} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.017, 0.02, gate.signPost.height, 6]} />
        <meshStandardMaterial color="#9aa0a2" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh
        position={[gate.signPost.x, gate.signPost.height + 0.06, gate.signPost.z]}
        raycast={NO_RAYCAST}
      >
        <boxGeometry args={[0.34, 0.13, 0.02]} />
        <meshStandardMaterial color="#0f5132" roughness={0.6} metalness={0.08} />
      </mesh>
    </group>
  );
});
