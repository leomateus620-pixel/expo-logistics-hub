import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { BumperCarBody, bumperCarSpawn } from './BumperCarModel';
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

export default function PhysicsBumperCars({
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
