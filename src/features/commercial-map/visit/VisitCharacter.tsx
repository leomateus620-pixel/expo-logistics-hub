import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import type { VisitCharacterController } from './VisitCharacterController';

export interface VisitCharacterHandle { update(character: VisitCharacterController, visible: boolean): void }
const NO_PICK = () => undefined;
/** Small neutral architectural scale figure; shared scene lighting, no new lights. */
export const VisitCharacter = forwardRef<VisitCharacterHandle>(function VisitCharacter(_, ref) {
  const group = useRef<Group>(null); const left = useRef<Group>(null); const right = useRef<Group>(null);
  useImperativeHandle(ref, () => ({ update(c, visible) {
    if (!group.current) return;
    group.current.visible = visible; group.current.position.set(c.position.x,c.position.y + .001,c.position.z);
    group.current.rotation.y = -c.bodyYaw;
    const swing = c.movement === 'idle' ? 0 : Math.sin(c.distance / .15 * 5.4) * .38;
    if (left.current) left.current.rotation.x = swing;
    if (right.current) right.current.rotation.x = -swing;
  } }), []);
  return <group ref={group} name="VisitCharacter" visible={false} scale={.15}>
    <mesh position={[0,.9,0]} raycast={NO_PICK}><capsuleGeometry args={[.18,.47,3,7]}/><meshStandardMaterial color="#597368" roughness={.88}/></mesh>
    <mesh position={[0,1.48,0]} raycast={NO_PICK}><sphereGeometry args={[.145,8,6]}/><meshStandardMaterial color="#c5b5a0" roughness={1}/></mesh>
    <group ref={left} position={[-.105,.67,0]}><mesh position={[0,-.37,0]} raycast={NO_PICK}><capsuleGeometry args={[.075,.45,3,6]}/><meshStandardMaterial color="#394943" roughness={1}/></mesh></group>
    <group ref={right} position={[.105,.67,0]}><mesh position={[0,-.37,0]} raycast={NO_PICK}><capsuleGeometry args={[.075,.45,3,6]}/><meshStandardMaterial color="#394943" roughness={1}/></mesh></group>
    <mesh position={[-.245,.96,0]} rotation={[0,0,-.12]} raycast={NO_PICK}><capsuleGeometry args={[.065,.43,3,6]}/><meshStandardMaterial color="#597368" roughness={1}/></mesh>
    <mesh position={[.245,.96,0]} rotation={[0,0,.12]} raycast={NO_PICK}><capsuleGeometry args={[.065,.43,3,6]}/><meshStandardMaterial color="#597368" roughness={1}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.005,0]} raycast={NO_PICK}><circleGeometry args={[.32,12]}/><meshBasicMaterial color="#142c23" transparent opacity={.14} depthWrite={false}/></mesh>
  </group>;
});
