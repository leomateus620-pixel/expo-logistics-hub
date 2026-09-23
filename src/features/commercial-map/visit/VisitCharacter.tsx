import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import type { VisitCharacterController } from './VisitCharacterController';
import { VisitSojinhaModel } from './VisitSojinhaModel';

export interface VisitCharacterHandle { update(character: VisitCharacterController, visible: boolean): void }
/** Visual adapter only. Movement, collision and heading remain in the existing controller. */
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
    <VisitSojinhaModel leftLeg={left} rightLeg={right}/>
  </group>;
});
