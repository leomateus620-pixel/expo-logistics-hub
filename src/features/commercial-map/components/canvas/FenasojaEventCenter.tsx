import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FENASOJA_EVENT_CENTER_REVISION, type EventCenterFootprint } from '../../utils/eventCenter';
import { createEventCenterArchitecture, type EventCenterSurface } from '../../utils/eventCenterArchitecture';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { NIGHT_LIGHTING_CONFIG } from '../../utils/nightLighting';
import { buildEventCenterGeometry } from './EventCenterGeometry';
import { EventCenterIdentityPanel } from './EventCenterIdentityPanel';

const NO_RAYCAST = () => undefined;
type BaseSurface = Exclude<EventCenterSurface, 'interior' | 'light' | 'wash'>;
interface Props {
  bounds: EventCenterFootprint;
  height: number;
  materials: Record<BaseSurface, THREE.MeshStandardMaterial>;
  showDetail: boolean;
  showFocusDetail: boolean;
  toneDown: number;
}

export function FenasojaEventCenter({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
  toneDown,
}: Props) {
  const layout = useMemo(() => createEventCenterArchitecture(bounds, height), [bounds, height]);
  const detail = showFocusDetail ? 'focus' : showDetail ? 'detail' : 'base';
  const geometry = useMemo(() => buildEventCenterGeometry(layout.parts, detail), [layout, detail]);
  const night = useCommercialMapStore((state) => state.nightModeActive);
  const invalidate = useThree((state) => state.invalidate);
  const reveal = useRef(night ? 1 : 0);
  const lightingDirty = useRef(true);
  const washRef = useRef<THREE.Mesh>(null);
  // Compact procedural glazing and feathered pools: no texture download, no
  // dynamic lights, no extra shadows. Intensity remains below shared bloom.
  const owned = useMemo(
    () => ({
      interior: new THREE.ShaderMaterial({
        uniforms: { night: { value: 0 }, fade: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv; uniform float night; uniform float fade;
        void main(){
          float edge=smoothstep(0.,.07,vUv.x)*smoothstep(0.,.07,1.-vUv.x)*smoothstep(0.,.06,vUv.y)*smoothstep(0.,.08,1.-vUv.y);
          // A shallow perspective room behind actual transparent glass. The
          // ceiling, back wall and floor remain a single opaque receiver.
          float ceiling=smoothstep(.72,.87,vUv.y);
          float floorMask=1.-smoothstep(.06,.32,vUv.y);
          float wall=1.-smoothstep(.08,.23,min(vUv.x,1.-vUv.x));
          vec3 room=mix(vec3(.16,.125,.085),vec3(.24,.225,.18),ceiling);
          room=mix(room,vec3(.105,.12,.112),floorMask);
          room=mix(room,vec3(.09,.075,.055),wall*.65);
          float panel=step(.12,fract(vUv.x*4.))*smoothstep(.32,.38,vUv.y)*(1.-smoothstep(.63,.68,vUv.y));
          room=mix(room,vec3(.08,.12,.09),panel*.58);
          float pendant=exp(-pow((vUv.y-.77)*46.,2.))*step(.35,fract(vUv.x*3.));
          vec3 warm=room*vec3(1.4,.98,.55)+vec3(.42,.25,.10)*pendant;
          gl_FragColor=vec4(mix(room*.75,warm,night)*mix(.42,1.,edge)*fade,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
      light: new THREE.MeshStandardMaterial({
        color: '#d5c4a6',
        emissive: '#ffd5a0',
        roughness: 0.65,
        emissiveIntensity: 0,
      }),
      wash: new THREE.ShaderMaterial({
        uniforms: { night: { value: 0 }, fade: { value: 1 } },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv;uniform float night;uniform float fade;
        void main(){vec2 p=abs(vUv*2.-1.);float falloff=pow(max(0.,1.-p.x*p.x),2.)*pow(max(0.,1.-p.y*p.y),2.);
          gl_FragColor=vec4(vec3(.80,.54,.25),falloff*.22*night*fade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => Object.values(owned).forEach((m) => m.dispose()), [owned]);
  useEffect(() => {
    lightingDirty.current = true;
    invalidate();
  }, [night, toneDown, invalidate]);
  useFrame((_state, delta) => {
    const target = night ? 1 : 0;
    if (!lightingDirty.current && reveal.current === target) return;
    lightingDirty.current = false;
    const lambda = night ? NIGHT_LIGHTING_CONFIG.revealLambdaIn : NIGHT_LIGHTING_CONFIG.revealLambdaOut;
    reveal.current = THREE.MathUtils.damp(reveal.current, target, lambda, Math.min(delta, 0.05));
    if (Math.abs(reveal.current - target) < 0.002) reveal.current = target;
    else invalidate();
    const fade = 1 - toneDown * 0.65;
    owned.interior.uniforms.night.value = reveal.current;
    owned.interior.uniforms.fade.value = fade;
    owned.light.emissiveIntensity = reveal.current * 0.85 * fade;
    owned.wash.uniforms.night.value = reveal.current;
    owned.wash.uniforms.fade.value = fade;
    if (washRef.current) washRef.current.visible = reveal.current > 0;
  });
  return (
    <group
      name="centro-eventos-fenasoja-c1"
      userData={{
        classification: 'EVENT_VENUE',
        featureType: 'FENASOJA_EVENT_CENTER',
        referenceRevision: FENASOJA_EVENT_CENTER_REVISION,
        detail,
      }}
      dispose={null}
    >
      {[...geometry.surfaces].map(([surface, buffer]) => (
        <mesh
          key={surface}
          name={`c1-${surface}`}
          ref={surface === 'wash' ? washRef : undefined}
          geometry={buffer}
          material={
            surface in owned ? owned[surface as keyof typeof owned] : materials[surface as BaseSurface]
          }
          castShadow={!['interior', 'glass', 'light', 'wash', 'metal'].includes(surface)}
          receiveShadow={!['interior', 'light', 'wash'].includes(surface)}
          raycast={NO_RAYCAST}
          dispose={null}
        />
      ))}
      <EventCenterIdentityPanel position={layout.sign.position} size={layout.sign.size} />
    </group>
  );
}
