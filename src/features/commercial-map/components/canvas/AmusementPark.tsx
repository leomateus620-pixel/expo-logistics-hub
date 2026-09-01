import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

/** Local design frame: the park is authored in a ~7.3 x 6 module and scaled
 * so the official J footprint [930, 2450, 1600, 3000] stays the terrain and
 * interaction boundary. */
const PARK_MODULE_WIDTH = 7.3;
const PARK_MODULE_DEPTH = 6;

const KAMIKAZE_REST_RADIANS = 0.16;
const KAMIKAZE_APEX_RADIANS = 2.48;

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

/**
 * One instanced string of LED bulbs sharing a single emissive colour, so lit
 * bulbs really glow in their own hue (per-instance colours cannot tint the
 * emissive term). Peak intensities are HDR values that clear the shared bloom
 * threshold — night lighting never adds point lights.
 */
function LedString({
  positions,
  color,
  parkActive,
  size = 0.038,
  peak = 7,
}: {
  positions: ReadonlyArray<readonly [number, number, number]>;
  color: string;
  parkActive: boolean;
  size?: number;
  peak?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    positions.forEach((position, index) => {
      dummy.position.set(position[0], position[1], position[2]);
      dummy.scale.setScalar(index % 3 === 0 ? 1.15 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [dummy, positions]);

  if (!positions.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, positions.length]}
      raycast={NO_RAYCAST}
      frustumCulled={false}
    >
      <sphereGeometry args={[size, 6, 4]} />
      <meshStandardMaterial
        color={parkActive ? color : '#c5b9a2'}
        emissive={parkActive ? color : '#000000'}
        emissiveIntensity={parkActive ? peak : 0}
        roughness={0.32}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function ledColumn(
  count: number,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): Array<[number, number, number]> {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
  });
}

/** Green-brown terrain: grass with worn dirt under the rides and a walking
 * path from the entrance gate, replacing the old flat single-tone planes. */
function ParkTerrain({
  width,
  depth,
  parkActive,
  reducedGraphics,
}: {
  width: number;
  depth: number;
  parkActive: boolean;
  reducedGraphics: boolean;
}) {
  const geometry = useMemo(() => {
    const columns = reducedGraphics ? 14 : 26;
    const rows = reducedGraphics ? 12 : 22;
    const grass = new THREE.Color('#66764a');
    const grassDry = new THREE.Color('#7d8050');
    const dirt = new THREE.Color('#8a704e');
    const dirtDark = new THREE.Color('#6b563c');
    const wornSpots: ReadonlyArray<{ x: number; z: number; radius: number }> = [
      { x: -2.05, z: 0, radius: 1.5 },
      { x: 1.82, z: -0.28, radius: 1.25 },
      { x: 0.35, z: 1.62, radius: 1.7 },
      { x: 0, z: -depth * 0.4, radius: 0.9 },
      { x: 0, z: -depth * 0.14, radius: 0.85 },
    ];
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
    const colors = new Float32Array((columns + 1) * (rows + 1) * 3);
    const scratch = new THREE.Color();
    let vertex = 0;
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = (column / columns - 0.5) * width;
        const z = (row / rows - 0.5) * depth;
        const noise = Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1;
        scratch.lerpColors(grass, grassDry, noise * 0.8);
        let worn = 0;
        for (const spot of wornSpots) {
          const distance = Math.hypot(x - spot.x, z - spot.z);
          worn = Math.max(worn, 1 - Math.min(1, distance / spot.radius));
        }
        if (worn > 0) {
          const soil = new THREE.Color().lerpColors(dirt, dirtDark, noise * 0.7);
          scratch.lerp(soil, Math.min(1, worn * 1.4));
        }
        positions.set([x, worn > 0.5 ? 0 : noise * 0.014, z], vertex * 3);
        colors.set([scratch.r, scratch.g, scratch.b], vertex * 3);
        vertex += 1;
      }
    }
    const indices: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    result.computeBoundingSphere();
    return result;
  }, [depth, reducedGraphics, width]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0.035, 0]} receiveShadow raycast={NO_RAYCAST}>
      <meshStandardMaterial
        vertexColors
        color={parkActive ? '#3d4763' : '#ffffff'}
        roughness={0.98}
      />
    </mesh>
  );
}

/** Instanced perimeter fence with an opening at the entrance gate. */
function ParkFence({
  width,
  depth,
  reducedGraphics,
}: {
  width: number;
  depth: number;
  reducedGraphics: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transforms = useMemo(() => {
    const inset = 0.14;
    const halfWidth = width / 2 - inset;
    const halfDepth = depth / 2 - inset;
    const gateEdgeZ = -halfDepth;
    const gateHalfWidth = 0.85;
    const spacing = reducedGraphics ? 0.9 : 0.55;
    const result: Array<{ position: [number, number, number]; yaw: number; length: number }> = [];
    const edges = [
      { from: [-halfWidth, gateEdgeZ] as const, to: [halfWidth, gateEdgeZ] as const, gate: true },
      { from: [halfWidth, -halfDepth] as const, to: [halfWidth, halfDepth] as const },
      { from: [halfWidth, halfDepth] as const, to: [-halfWidth, halfDepth] as const },
      { from: [-halfWidth, halfDepth] as const, to: [-halfWidth, -halfDepth] as const },
    ];
    for (const edge of edges) {
      const length = Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]);
      const segments = Math.max(2, Math.round(length / spacing));
      const yaw = Math.atan2(edge.to[1] - edge.from[1], edge.to[0] - edge.from[0]);
      for (let index = 0; index <= segments; index += 1) {
        const t = index / segments;
        const x = edge.from[0] + (edge.to[0] - edge.from[0]) * t;
        const z = edge.from[1] + (edge.to[1] - edge.from[1]) * t;
        if (edge.gate && Math.abs(x) < gateHalfWidth) continue;
        result.push({ position: [x, 0.11, z], yaw, length: length / segments });
      }
    }
    return result;
  }, [depth, reducedGraphics, width]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    transforms.forEach((item, index) => {
      dummy.position.set(...item.position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [dummy, transforms]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, transforms.length]}
      raycast={NO_RAYCAST}
      frustumCulled={false}
    >
      <boxGeometry args={[0.05, 0.22, 0.05]} />
      <meshStandardMaterial color="#efe5cc" roughness={0.62} />
    </instancedMesh>
  );
}

function FerrisWheel({ parkActive, reducedGraphics }: { parkActive: boolean; reducedGraphics: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  const cabins = useRef<Array<THREE.Group | null>>([]);
  const invalidate = useThree((state) => state.invalidate);
  const cabinCount = reducedGraphics ? 8 : 12;
  const ringLedCount = reducedGraphics ? 24 : 40;

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

  const ringLeds = useMemo(() => {
    const even: Array<[number, number, number]> = [];
    const odd: Array<[number, number, number]> = [];
    for (let index = 0; index < ringLedCount; index += 1) {
      const angle = (index / ringLedCount) * Math.PI * 2;
      const bulb: [number, number, number] = [
        Math.cos(angle) * 1.16,
        Math.sin(angle) * 1.16,
        0.06,
      ];
      (index % 2 === 0 ? even : odd).push(bulb);
    }
    return { even, odd };
  }, [ringLedCount]);

  return (
    <group position={[-2.05, 0.14, 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[1.9, 0.09, 1.1]} />
        <meshStandardMaterial color="#75664d" roughness={0.94} />
      </mesh>
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
        {/* The LED ring lives inside the rotating group, so at night the lit
            rim visibly spins with the wheel instead of hanging as an overlay. */}
        <LedString positions={ringLeds.even} color="#ff315f" parkActive={parkActive} />
        <LedString positions={ringLeds.odd} color="#42d9ff" parkActive={parkActive} />
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

/** One Kamikaze pendulum arm: shaft, passenger row and its onboard LEDs. */
function KamikazeArm({
  armRef,
  restRadians,
  zOffset,
  mirrored,
  parkActive,
}: {
  armRef: React.RefObject<THREE.Group>;
  restRadians: number;
  zOffset: number;
  mirrored: boolean;
  parkActive: boolean;
}) {
  const armLeds = useMemo(
    () => ledColumn(8, [0.1, -0.32, 0.1], [0.1, -1.5, 0.1]),
    [],
  );
  return (
    <group ref={armRef} position={[0, 2.75, zOffset]} rotation={[0, 0, restRadians]}>
      <mesh position={[0, -0.86, 0]} castShadow>
        <boxGeometry args={[0.16, 1.72, 0.18]} />
        <meshStandardMaterial color="#e33d49" metalness={0.42} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.22, 0.52, 0.2]} />
        <meshStandardMaterial color="#33393f" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.72, 0]} castShadow>
        <boxGeometry args={[1.05, 0.25, 0.34]} />
        <meshStandardMaterial color="#255a9b" metalness={0.25} roughness={0.4} />
      </mesh>
      {[-0.38, -0.13, 0.13, 0.38].map((x) => (
        <mesh key={x} position={[x, -1.72, mirrored ? -0.21 : 0.21]}>
          <boxGeometry args={[0.17, 0.19, 0.11]} />
          <meshStandardMaterial color={x < 0 ? '#f3bd2e' : '#eb5359'} roughness={0.5} />
        </mesh>
      ))}
      <LedString positions={armLeds} color="#42d9ff" parkActive={parkActive} size={0.032} />
    </group>
  );
}

/**
 * Kamikaze with the two mirrored pendulum arms of the reference ride. A GSAP
 * timeline — created only while the park is active — drives the signature
 * rise-pause-descend loop past vertical, exactly like the real machine.
 */
function Kamikaze({ parkActive }: { parkActive: boolean }) {
  const armA = useRef<THREE.Group>(null);
  const armB = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const applyLift = (lift: number) => {
      const angle = KAMIKAZE_REST_RADIANS
        + (KAMIKAZE_APEX_RADIANS - KAMIKAZE_REST_RADIANS) * lift;
      if (armA.current) armA.current.rotation.z = angle;
      if (armB.current) armB.current.rotation.z = -angle;
      invalidate();
    };
    applyLift(0);
    if (!parkActive) return undefined;
    const proxy = { lift: 0 };
    const onUpdate = () => applyLift(proxy.lift);
    const timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.85 });
    timeline
      .to(proxy, { lift: 1, duration: 3.1, ease: 'power2.inOut', onUpdate })
      // Hold at the apex before the drop — the signature Kamikaze pause.
      .to({}, { duration: 0.9 })
      .to(proxy, { lift: 0, duration: 2.55, ease: 'power2.inOut', onUpdate })
      .to({}, { duration: 0.4 });
    return () => {
      timeline.kill();
      applyLift(0);
    };
  }, [invalidate, parkActive]);

  const towerLeds = useMemo(() => [
    ...ledColumn(9, [-0.24, 0.42, 0.12], [-0.24, 2.62, 0.12]),
    ...ledColumn(9, [0.24, 0.42, 0.12], [0.24, 2.62, 0.12]),
  ], []);

  return (
    <group position={[1.82, 0.14, -0.28]}>
      <mesh position={[0, 0.02, 0]} receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[1.5, 0.09, 1.2]} />
        <meshStandardMaterial color="#75664d" roughness={0.94} />
      </mesh>
      <mesh position={[-0.24, 1.42, 0]} castShadow>
        <boxGeometry args={[0.13, 2.85, 0.16]} />
        <meshStandardMaterial color="#d8d9d1" metalness={0.67} roughness={0.3} />
      </mesh>
      <mesh position={[0.24, 1.42, 0]} castShadow>
        <boxGeometry args={[0.13, 2.85, 0.16]} />
        <meshStandardMaterial color="#d8d9d1" metalness={0.67} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.72, 10]} />
        <meshStandardMaterial color="#2c3237" metalness={0.5} roughness={0.35} />
      </mesh>
      <LedString positions={towerLeds} color="#ff315f" parkActive={parkActive} />
      <KamikazeArm
        armRef={armA}
        restRadians={KAMIKAZE_REST_RADIANS}
        zOffset={0.2}
        mirrored={false}
        parkActive={parkActive}
      />
      <KamikazeArm
        armRef={armB}
        restRadians={-KAMIKAZE_REST_RADIANS}
        zOffset={-0.2}
        mirrored
        parkActive={parkActive}
      />
    </group>
  );
}

function BumperCarBody({ index }: { index: number }) {
  return (
    <>
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
    </>
  );
}

function bumperCarSpawn(index: number): [number, number, number] {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return [-0.72 + column * 0.72, 0.34, -0.43 + row * 0.56];
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
      <BumperCarBody index={index} />
    </RigidBody>
  );
}

/** Static stand-ins shown before the Rapier world has ever been needed. */
function ParkedBumperCars({ carCount }: { carCount: number }) {
  return (
    <>
      {Array.from({ length: carCount }, (_, index) => {
        const [x, , z] = bumperCarSpawn(index);
        return (
          <group key={index} position={[x, 0.2, z]} rotation={[0, index * 1.21, 0]}>
            <BumperCarBody index={index} />
          </group>
        );
      })}
    </>
  );
}

function PhysicsBumperCars({
  parkActive,
  carCount,
}: {
  parkActive: boolean;
  carCount: number;
}) {
  return (
    <Physics paused={!parkActive} gravity={[0, -9.81, 0]} timeStep="vary">
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider position={[0, 0.12, 0]} args={[1.26, 0.08, 0.83]} />
        <CuboidCollider position={[-1.29, 0.33, 0]} args={[0.06, 0.25, 0.9]} />
        <CuboidCollider position={[1.29, 0.33, 0]} args={[0.06, 0.25, 0.9]} />
        <CuboidCollider position={[0, 0.33, -0.86]} args={[1.28, 0.25, 0.06]} />
        <CuboidCollider position={[0, 0.33, 0.86]} args={[1.28, 0.25, 0.06]} />
      </RigidBody>
      {Array.from({ length: carCount }, (_, index) => (
        <BumperCar
          key={index}
          index={index}
          parkActive={parkActive}
          position={bumperCarSpawn(index)}
        />
      ))}
    </Physics>
  );
}

function BumperCars({ parkActive, reducedGraphics }: { parkActive: boolean; reducedGraphics: boolean }) {
  const carCount = reducedGraphics ? 4 : 7;
  // The Rapier world (and its WASM payload) boots lazily on the first
  // activation and stays mounted afterwards; until then the pad shows cheap
  // parked meshes, keeping the dormant park free of physics work.
  const [physicsBooted, setPhysicsBooted] = useState(false);
  useEffect(() => {
    if (parkActive) setPhysicsBooted(true);
  }, [parkActive]);

  const canopyLeds = useMemo(() => {
    const halfWidth = 1.36;
    const halfDepth = 0.93;
    const perimeter = 4 * (halfWidth + halfDepth);
    const count = reducedGraphics ? 18 : 30;
    const bulbs: Array<[number, number, number]> = [];
    for (let index = 0; index < count; index += 1) {
      let distance = (index / count) * perimeter;
      let x = -halfWidth;
      let z = -halfDepth;
      if (distance < halfWidth * 2) {
        x += distance;
      } else if ((distance -= halfWidth * 2) < halfDepth * 2) {
        x = halfWidth;
        z += distance;
      } else if ((distance -= halfDepth * 2) < halfWidth * 2) {
        x = halfWidth - distance;
        z = halfDepth;
      } else {
        x = -halfWidth;
        z = halfDepth - (distance - halfWidth * 2);
      }
      bulbs.push([x, 0.86, z]);
    }
    return bulbs;
  }, [reducedGraphics]);

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
      {/* Perimeter walls matching the fixed Rapier colliders. */}
      {[-0.86, 0.86].map((z) => (
        <mesh key={`wall-z-${z}`} position={[0, 0.2, z]} raycast={NO_RAYCAST}>
          <boxGeometry args={[2.56, 0.16, 0.1]} />
          <ParkMaterial color="#c8574e" activeColor="#8a3b38" parkActive={parkActive} roughness={0.5} />
        </mesh>
      ))}
      {[-1.29, 1.29].map((x) => (
        <mesh key={`wall-x-${x}`} position={[x, 0.2, 0]} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.1, 0.16, 1.82]} />
          <ParkMaterial color="#c8574e" activeColor="#8a3b38" parkActive={parkActive} roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => (
        <mesh
          key={`post-${sideX}-${sideZ}`}
          position={[sideX * 1.3, 0.5, sideZ * 0.87]}
          castShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[0.07, 0.86, 0.07]} />
          <meshStandardMaterial color="#8a9292" metalness={0.5} roughness={0.4} />
        </mesh>
      )))}
      <mesh position={[0, 0.95, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[2.82, 0.07, 1.96]} />
        <ParkMaterial color="#26669f" activeColor="#1c3a63" parkActive={parkActive} roughness={0.55} />
      </mesh>
      <LedString positions={canopyLeds} color="#ffd784" parkActive={parkActive} peak={5.5} />
      {physicsBooted ? (
        <Suspense fallback={<ParkedBumperCars carCount={carCount} />}>
          <PhysicsBumperCars parkActive={parkActive} carCount={carCount} />
        </Suspense>
      ) : (
        <ParkedBumperCars carCount={carCount} />
      )}
    </group>
  );
}

function EntranceGate({ parkActive, depth }: { parkActive: boolean; depth: number }) {
  const archLeds = useMemo(
    () => ledColumn(9, [-0.62, 1.12, 0.09], [0.62, 1.12, 0.09]),
    [],
  );
  return (
    <group position={[0, 0.08, -depth * 0.46]}>
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
      <LedString positions={archLeds} color="#f5c638" parkActive={parkActive} peak={6} />
    </group>
  );
}

export function AmusementPark({ bounds, parkActive, reducedGraphics }: AmusementParkProps) {
  const scale = Math.min(bounds.width / PARK_MODULE_WIDTH, bounds.depth / PARK_MODULE_DEPTH);
  const terrainWidth = bounds.width / scale;
  const terrainDepth = bounds.depth / scale;

  return (
    <group scale={scale} name="amusement-park" dispose={null}>
      <ParkTerrain
        width={terrainWidth}
        depth={terrainDepth}
        parkActive={parkActive}
        reducedGraphics={reducedGraphics}
      />
      <ParkFence width={terrainWidth} depth={terrainDepth} reducedGraphics={reducedGraphics} />
      <FerrisWheel parkActive={parkActive} reducedGraphics={reducedGraphics} />
      <Kamikaze parkActive={parkActive} />
      <BumperCars parkActive={parkActive} reducedGraphics={reducedGraphics} />
      <EntranceGate parkActive={parkActive} depth={terrainDepth} />
    </group>
  );
}
