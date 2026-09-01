import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import gsap from 'gsap';
import * as THREE from 'three';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const CABIN_COLORS = ['#ef3f45', '#1c8cca', '#f5c638', '#7b45b7', '#ef762f', '#2f9d69'];
const CAR_COLORS = ['#e64045', '#1687be', '#f0b930', '#7149b4', '#e76f31', '#15916c'];

interface AmusementParkProps {
  bounds: StrategicLandmarkBounds;
  parkActive: boolean;
  reducedGraphics: boolean;
}

function ParkMaterial({
  color,
  activeColor = color,
  parkActive,
  metalness = 0.05,
  roughness = 0.62,
}: {
  color: string;
  activeColor?: string;
  parkActive: boolean;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <meshStandardMaterial
      color={parkActive ? activeColor : color}
      metalness={metalness}
      roughness={roughness}
      envMapIntensity={parkActive ? 0.18 : 0.7}
    />
  );
}

function LedBulbs({
  parkActive,
  reducedGraphics,
}: {
  parkActive: boolean;
  reducedGraphics: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transforms = useMemo(() => {
    const result: Array<[number, number, number]> = [];
    const wheelCount = reducedGraphics ? 24 : 40;
    for (let index = 0; index < wheelCount; index += 1) {
      const angle = (index / wheelCount) * Math.PI * 2;
      result.push([
        -2.05 + Math.cos(angle) * 1.05,
        1.65 + Math.sin(angle) * 1.05,
        0.18,
      ]);
    }
    const towerCount = reducedGraphics ? 10 : 18;
    for (let index = 0; index < towerCount; index += 1) {
      const t = index / Math.max(1, towerCount - 1);
      result.push([1.63, 0.42 + t * 2.45, 0.12]);
      result.push([2.03, 0.42 + t * 2.45, 0.12]);
    }
    return result;
  }, [reducedGraphics]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = parkActive ? '#ff315f' : '#c5b9a2';

  useLayoutEffect(() => {
    if (!mesh.current) return;
    transforms.forEach((position, index) => {
      dummy.position.set(...position);
      dummy.scale.setScalar(index % 3 === 0 ? 1.15 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
      mesh.current!.setColorAt(index, new THREE.Color(index % 4 === 0 ? '#42d9ff' : color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [color, dummy, transforms]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, transforms.length]}
      raycast={NO_RAYCAST}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.038, 6, 4]} />
      <meshStandardMaterial
        color={parkActive ? '#ff5676' : '#b5a98e'}
        emissive={parkActive ? '#ff174f' : '#000000'}
        emissiveIntensity={parkActive ? 7 : 0}
        roughness={0.32}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function FerrisWheel({ parkActive, reducedGraphics }: { parkActive: boolean; reducedGraphics: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  const cabins = useRef<Array<THREE.Group | null>>([]);
  const invalidate = useThree((state) => state.invalidate);
  const cabinCount = reducedGraphics ? 8 : 12;

  useEffect(() => {
    if (parkActive) invalidate();
  }, [invalidate, parkActive]);

  useFrame((_state, delta) => {
    if (!parkActive || !wheel.current) return;
    wheel.current.rotation.z = (wheel.current.rotation.z + delta * 0.24) % (Math.PI * 2);
    cabins.current.forEach((cabin) => {
      if (cabin) cabin.rotation.z = -wheel.current!.rotation.z;
    });
    invalidate();
  });

  return (
    <group position={[-2.05, 0.14, 0]}>
      <mesh position={[-0.65, 0.7, 0]} rotation={[0, 0, -0.23]} castShadow>
        <boxGeometry args={[0.11, 1.55, 0.13]} />
        <meshStandardMaterial color="#d8d6c9" metalness={0.65} roughness={0.32} />
      </mesh>
      <mesh position={[0.65, 0.7, 0]} rotation={[0, 0, 0.23]} castShadow>
        <boxGeometry args={[0.11, 1.55, 0.13]} />
        <meshStandardMaterial color="#d8d6c9" metalness={0.65} roughness={0.32} />
      </mesh>
      <group ref={wheel} position={[0, 1.51, 0]}>
        <mesh castShadow>
          <torusGeometry args={[1.05, 0.055, 8, reducedGraphics ? 24 : 48]} />
          <meshStandardMaterial color="#f0eee3" metalness={0.56} roughness={0.35} />
        </mesh>
        {Array.from({ length: cabinCount }, (_, index) => {
          const angle = (index / cabinCount) * Math.PI * 2;
          return (
            <group
              key={index}
              ref={(node) => { cabins.current[index] = node; }}
              position={[Math.cos(angle) * 1.05, Math.sin(angle) * 1.05, 0]}
            >
              <mesh position={[0, -0.11, 0]} castShadow>
                <boxGeometry args={[0.32, 0.25, 0.3]} />
                <meshStandardMaterial
                  color={CABIN_COLORS[index % CABIN_COLORS.length]}
                  roughness={0.48}
                  metalness={0.1}
                />
              </mesh>
              <mesh position={[0, 0.07, 0]}>
                <boxGeometry args={[0.24, 0.09, 0.24]} />
                <meshStandardMaterial color="#f4eee0" roughness={0.55} />
              </mesh>
            </group>
          );
        })}
        {Array.from({ length: cabinCount / 2 }, (_, index) => {
          const angle = (index / (cabinCount / 2)) * Math.PI;
          return (
            <mesh key={index} rotation={[0, 0, angle]}>
              <boxGeometry args={[2.02, 0.025, 0.025]} />
              <meshStandardMaterial color="#ef434c" roughness={0.42} />
            </mesh>
          );
        })}
        <mesh>
          <cylinderGeometry args={[0.14, 0.14, 0.34, 16]} />
          <meshStandardMaterial color="#f0b72c" metalness={0.38} roughness={0.38} />
        </mesh>
      </group>
    </group>
  );
}

function Kamikaze({ parkActive }: { parkActive: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    if (!arm.current) return;
    const rotation = arm.current.rotation;
    rotation.z = -1.08;
    if (!parkActive) {
      invalidate();
      return undefined;
    }
    const timeline = gsap.timeline({
      repeat: -1,
      onUpdate: invalidate,
    });
    timeline
      .to(rotation, { z: 0, duration: 2.5, ease: 'power2.inOut' })
      .to({}, { duration: 0.65 })
      .to(rotation, { z: -1.08, duration: 2.35, ease: 'power2.inOut' })
      .to({}, { duration: 0.4 });
    return () => {
      timeline.kill();
      rotation.z = -1.08;
      invalidate();
    };
  }, [invalidate, parkActive]);

  return (
    <group position={[1.82, 0.14, -0.28]}>
      <mesh position={[-0.24, 1.42, 0]} castShadow>
        <boxGeometry args={[0.13, 2.85, 0.16]} />
        <meshStandardMaterial color="#d8d9d1" metalness={0.67} roughness={0.3} />
      </mesh>
      <mesh position={[0.24, 1.42, 0]} castShadow>
        <boxGeometry args={[0.13, 2.85, 0.16]} />
        <meshStandardMaterial color="#d8d9d1" metalness={0.67} roughness={0.3} />
      </mesh>
      <group ref={arm} position={[0, 2.75, 0.02]}>
        <mesh position={[0, -0.86, 0]} castShadow>
          <boxGeometry args={[0.16, 1.72, 0.18]} />
          <meshStandardMaterial color="#e33d49" metalness={0.42} roughness={0.34} />
        </mesh>
        <mesh position={[0, -1.72, 0]} castShadow>
          <boxGeometry args={[1.05, 0.25, 0.38]} />
          <meshStandardMaterial color="#255a9b" metalness={0.25} roughness={0.4} />
        </mesh>
        {[-0.38, -0.13, 0.13, 0.38].map((x) => (
          <mesh key={x} position={[x, -1.72, 0.24]}>
            <boxGeometry args={[0.17, 0.19, 0.13]} />
            <meshStandardMaterial color={x < 0 ? '#f3bd2e' : '#eb5359'} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function BumperCar({
  index,
  parkActive,
  position,
}: {
  index: number;
  parkActive: boolean;
  position: [number, number, number];
}) {
  const body = useRef<RapierRigidBody>(null);
  const nextImpulseAt = useRef(index * 0.17);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (parkActive) {
      nextImpulseAt.current = 0;
      body.current?.wakeUp();
      invalidate();
    } else {
      body.current?.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.current?.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.current?.sleep();
    }
  }, [invalidate, parkActive]);

  useFrame(({ clock }) => {
    if (!parkActive || !body.current) return;
    const elapsed = clock.elapsedTime;
    if (elapsed >= nextImpulseAt.current) {
      const heading = elapsed * (0.72 + index * 0.06) + index * 1.73;
      body.current.applyImpulse({
        x: Math.cos(heading) * 0.048,
        y: 0,
        z: Math.sin(heading) * 0.048,
      }, true);
      body.current.applyTorqueImpulse({ x: 0, y: Math.sin(heading * 0.7) * 0.006, z: 0 }, true);
      nextImpulseAt.current = elapsed + 0.55 + (index % 3) * 0.12;
    }
    invalidate();
  });

  return (
    <RigidBody
      ref={body}
      position={position}
      colliders={false}
      linearDamping={1.45}
      angularDamping={2.2}
      enabledRotations={[false, true, false]}
      canSleep
      mass={0.72}
    >
      <CuboidCollider args={[0.24, 0.1, 0.18]} restitution={0.78} friction={0.22} />
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.2, 0.38]} />
        <meshStandardMaterial
          color={CAR_COLORS[index % CAR_COLORS.length]}
          metalness={0.28}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.15, -0.02]}>
        <boxGeometry args={[0.28, 0.16, 0.23]} />
        <meshStandardMaterial color="#22292c" metalness={0.18} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.025, 6, 12]} />
        <meshStandardMaterial color="#f2d34f" roughness={0.42} />
      </mesh>
    </RigidBody>
  );
}

function BumperCars({ parkActive, reducedGraphics }: { parkActive: boolean; reducedGraphics: boolean }) {
  const carCount = reducedGraphics ? 4 : 7;
  return (
    <group position={[0.35, 0.13, 1.62]}>
      <mesh receiveShadow>
        <boxGeometry args={[2.55, 0.12, 1.7]} />
        <meshStandardMaterial
          color={parkActive ? '#242936' : '#72776f'}
          roughness={0.58}
          metalness={0.32}
        />
      </mesh>
      <mesh position={[0, 0.1, 0]} raycast={NO_RAYCAST}>
        <boxGeometry args={[2.72, 0.08, 1.87]} />
        <meshStandardMaterial color="#e8d9b0" wireframe roughness={0.6} />
      </mesh>
      <Physics paused={!parkActive} gravity={[0, -9.81, 0]} timeStep="vary">
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider position={[0, 0.12, 0]} args={[1.26, 0.08, 0.83]} />
          <CuboidCollider position={[-1.29, 0.33, 0]} args={[0.06, 0.25, 0.9]} />
          <CuboidCollider position={[1.29, 0.33, 0]} args={[0.06, 0.25, 0.9]} />
          <CuboidCollider position={[0, 0.33, -0.86]} args={[1.28, 0.25, 0.06]} />
          <CuboidCollider position={[0, 0.33, 0.86]} args={[1.28, 0.25, 0.06]} />
        </RigidBody>
        {Array.from({ length: carCount }, (_, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          return (
            <BumperCar
              key={index}
              index={index}
              parkActive={parkActive}
              position={[-0.72 + column * 0.72, 0.34, -0.43 + row * 0.56]}
            />
          );
        })}
      </Physics>
    </group>
  );
}

export function AmusementPark({ bounds, parkActive, reducedGraphics }: AmusementParkProps) {
  const scale = Math.min(bounds.width / 7.3, bounds.depth / 6);
  const terrainWidth = bounds.width / scale;
  const terrainDepth = bounds.depth / scale;

  return (
    <group scale={scale} name="amusement-park" dispose={null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <planeGeometry args={[terrainWidth, terrainDepth]} />
        <ParkMaterial
          color="#66764a"
          activeColor="#283a2e"
          parkActive={parkActive}
          roughness={0.98}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0.12]} receiveShadow>
        <planeGeometry args={[terrainWidth * 0.84, 0.72]} />
        <ParkMaterial
          color="#8a704e"
          activeColor="#514231"
          parkActive={parkActive}
          roughness={0.94}
        />
      </mesh>
      <FerrisWheel parkActive={parkActive} reducedGraphics={reducedGraphics} />
      <Kamikaze parkActive={parkActive} />
      <BumperCars parkActive={parkActive} reducedGraphics={reducedGraphics} />
      <LedBulbs parkActive={parkActive} reducedGraphics={reducedGraphics} />
      <group position={[0, 0.08, -terrainDepth * 0.46]}>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0.5, 0]} castShadow>
            <boxGeometry args={[0.12, 1, 0.12]} />
            <meshStandardMaterial color="#efe5cc" roughness={0.58} />
          </mesh>
        ))}
        <mesh position={[0, 0.94, 0]} castShadow>
          <boxGeometry args={[1.42, 0.25, 0.15]} />
          <meshStandardMaterial
            color="#d9444d"
            emissive={parkActive ? '#b81739' : '#000000'}
            emissiveIntensity={parkActive ? 4.5 : 0}
            toneMapped={!parkActive}
            roughness={0.42}
          />
        </mesh>
      </group>
    </group>
  );
}
