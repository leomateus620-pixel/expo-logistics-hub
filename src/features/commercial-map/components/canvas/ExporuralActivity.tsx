import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  C4_CREW_COUNT,
  C4_SMOKE_COUNT,
  advanceC4Activity,
} from '../../utils/exporuralMotion';
import { useC4MotionPreference, c4ObjectVisible } from './useC4Motion';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
/** One persistent crew batch and one bounded emitter. Nothing is mounted on each click. */
export function ExporuralActivity({
  selected,
  reducedGraphics,
  kitchen,
  roof,
  roofMaterial,
}: {
  selected: boolean;
  reducedGraphics: boolean;
  kitchen: { x: number; z: number; floor: number; chimneyY: number };
  roof: RefObject<THREE.Group>;
  roofMaterial: THREE.MeshStandardMaterial;
}) {
  const root = useRef<THREE.Group>(null),
    crew = useRef<THREE.InstancedMesh>(null),
    smoke = useRef<THREE.InstancedMesh>(null);
  const state = useRef({ amount: 0, time: 0, updates: 0 });
  const reducedMotion = useC4MotionPreference();
  const { invalidate, gl } = useThree();
  const resources = useMemo(() => {
    const body = new THREE.SphereGeometry(0.5, 8, 6);
    const cloth = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.88,
      transparent: true,
      opacity: 0,
      depthWrite: true,
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute(
      'smokeSeed',
      new THREE.InstancedBufferAttribute(
        Float32Array.from(
          { length: C4_SMOKE_COUNT },
          (_, i) => i / C4_SMOKE_COUNT,
        ),
        1,
      ),
    );
    const vapor = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, amount: { value: 0 } },
      vertexShader: `attribute float smokeSeed; uniform float time; varying vec2 vUv; varying float vLife;
        void main(){vUv=uv; float life=fract(time*.48+smokeSeed);vLife=life;
          vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
          center.xyz+=(viewMatrix*modelMatrix*vec4(sin(smokeSeed*25.+life*2.)*.025*life,life*.28,life*.024,0.)).xyz;
          center.xy+=position.xy*(.035+life*.09);gl_Position=projectionMatrix*center;}`,
      fragmentShader: `uniform float amount;varying vec2 vUv;varying float vLife;
        void main(){float r=length(vUv-.5)*2.;float a=(1.-smoothstep(.12,1.,r))*sin(vLife*3.14159265)*.075*amount;
          if(a<.002)discard;gl_FragColor=vec4(.67,.69,.68,a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return {
      body,
      cloth,
      plane,
      vapor,
      dummy: new THREE.Object3D(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      color: new THREE.Color(),
      scratch: {
        frustum: new THREE.Frustum(),
        matrix: new THREE.Matrix4(),
        sphere: new THREE.Sphere(),
      },
    };
  }, []);
  useEffect(() => {
    const m = smoke.current;
    if (!m) return;
    const matrix = new THREE.Matrix4().makeTranslation(
      kitchen.x + 0.18,
      kitchen.chimneyY + 0.027,
      kitchen.z,
    );
    for (let i = 0; i < C4_SMOKE_COUNT; i++) m.setMatrixAt(i, matrix);
    m.instanceMatrix.needsUpdate = true;
  }, [kitchen]);
  useEffect(() => {
    const c = crew.current,
      m = smoke.current;
    return () => {
      disposeInstancedMesh(c);
      disposeInstancedMesh(m);
    };
  }, []);
  useEffect(
    () => () => {
      resources.body.dispose();
      resources.cloth.dispose();
      resources.plane.dispose();
      resources.vapor.dispose();
    },
    [resources],
  );
  useEffect(() => {
    invalidate();
  }, [selected, reducedMotion, invalidate]);
  useFrame(({ camera }, delta) => {
    const s = state.current,
      g = root.current,
      c = crew.current;
    if (!g || !c) return;
    // Exit finishes even when panned away, then no buffer updates or invalidations.
    if (!selected && s.amount === 0) return;
    const visible = c4ObjectVisible(g, camera, resources.scratch, 3);
    s.amount = advanceC4Activity(s.amount, selected, delta);
    resources.cloth.opacity = s.amount;
    resources.vapor.uniforms.amount.value = reducedMotion ? 0 : s.amount;
    if (roof.current) {
      const wasVisible = roof.current.visible;
      roof.current.visible = s.amount < 1;
      roofMaterial.opacity = 1 - s.amount;
      if (wasVisible !== roof.current.visible) gl.shadowMap.needsUpdate = true;
    }
    // Do not put characters into the scene until there is an active selection.
    c.visible = s.amount > 0;
    if (smoke.current) smoke.current.visible = s.amount > 0 && !reducedMotion;
    if (s.amount === 0) {
      g.userData.activity = {
        selected: false,
        amount: 0,
        updates: s.updates,
        crew: 0,
        particles: 0,
      };
      return;
    }
    if (!visible && selected) return;
    if (!reducedMotion) s.time += Math.min(delta, 0.1);
    const { dummy, a, b, up, color } = resources;
    let index = 0;
    const part = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      tint: string,
      angle = 0,
    ) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(angle, 0, 0);
      dummy.updateMatrix();
      c.setMatrixAt(index, dummy.matrix);
      color.set(tint);
      c.setColorAt(index++, color);
    };
    const limb = (
      from: number[],
      to: number[],
      width: number,
      tint: string,
    ) => {
      a.set(from[0], from[1], from[2]);
      b.set(to[0], to[1], to[2]);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      b.sub(a);
      dummy.scale.set(width, b.length() + width * 0.25, width);
      dummy.quaternion.setFromUnitVectors(up, b.normalize());
      dummy.updateMatrix();
      c.setMatrixAt(index, dummy.matrix);
      color.set(tint);
      c.setColorAt(index++, color);
    };
    for (let i = 0; i < C4_CREW_COUNT; i++) {
      const x = kitchen.x - 0.095,
        z = kitchen.z + (i - 1) * 0.205,
        y = kitchen.floor;
      const phase = s.time * (0.82 + i * 0.07) + i * 2.13,
        sway = Math.sin(phase) * 0.0015;
      const shirt = ['#c8bda7', '#c0c5c0', '#adb4bb'][i],
        skin = ['#b98666', '#d0a180', '#97694f'][i];
      part(x + sway, y + 0.174, z, 0.063, 0.105, 0.092, shirt);
      part(x + 0.027 + sway, y + 0.163, z, 0.01, 0.11, 0.076, '#ece6d8');
      part(x + 0.004 + sway, y + 0.245, z, 0.047, 0.052, 0.049, skin);
      part(x + 0.002 + sway, y + 0.27, z, 0.053, 0.014, 0.055, '#e3ded2');
      for (const sign of [-1, 1]) {
        part(x, y + 0.064, z + sign * 0.025, 0.027, 0.125, 0.034, '#343b40');
        part(
          x + 0.015,
          y + 0.012,
          z + sign * 0.025,
          0.053,
          0.022,
          0.032,
          '#343332',
        );
        const reach = 0.005 * Math.sin(phase + sign * 0.7),
          handX = kitchen.x + 0.035 + reach,
          handY = y + 0.153 + 0.005 * Math.cos(phase),
          handZ = z + sign * 0.054;
        const elbow = [x + 0.034, y + 0.165, z + sign * 0.062];
        limb([x, y + 0.214, z + sign * 0.038], elbow, 0.026, shirt);
        limb(elbow, [handX, handY, handZ], 0.02, skin);
        part(handX, handY, handZ, 0.023, 0.019, 0.02, skin);
      }
      // Each cook slowly turns one skewer. Uneven meat profiles make the turn legible.
      part(kitchen.x + 0.115, y + 0.155, z, 0.245, 0.004, 0.004, '#777d7c');
      for (const offset of [-0.035, 0.04])
        part(
          kitchen.x + 0.14 + offset,
          y + 0.158,
          z,
          0.036,
          0.026,
          0.02,
          '#714f36',
          Math.sin(phase) * 0.65,
        );
    }
    c.count = index;
    c.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
    resources.vapor.uniforms.time.value = s.time;
    if (smoke.current)
      smoke.current.count = reducedGraphics ? 4 : C4_SMOKE_COUNT;
    s.updates++;
    // Small DEV-only telemetry has no per-frame DOM writes in production.
    if (import.meta.env.DEV)
      g.userData.activity = {
        selected,
        amount: s.amount,
        updates: s.updates,
        crew: C4_CREW_COUNT,
        particles: reducedMotion ? 0 : reducedGraphics ? 4 : C4_SMOKE_COUNT,
      };
    if ((visible && !reducedMotion) || (s.amount > 0 && s.amount < 1))
      invalidate();
  });
  return (
    <group ref={root} name="atividade-contextual-churrascaria" dispose={null}>
      <instancedMesh
        ref={crew}
        name="tres-churrasqueiros"
        args={[resources.body, resources.cloth, 64]}
        visible={false}
        frustumCulled={false}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <instancedMesh
        ref={smoke}
        name="fumaca-leve-saida-coifa"
        args={[resources.plane, resources.vapor, C4_SMOKE_COUNT]}
        visible={false}
        frustumCulled={false}
        raycast={NO_RAYCAST}
        dispose={null}
      />
    </group>
  );
}
