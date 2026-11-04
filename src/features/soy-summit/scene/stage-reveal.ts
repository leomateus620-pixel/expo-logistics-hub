import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { REVEAL_DURATION, revealPose } from '../reveal-timeline';

const FLOOR = .65, CLOTH_Z = -32.84, TOP = 6.58, BOTTOM = .70, WIDTH = 9.6;
type Pose = ReturnType<typeof revealPose>;

/** Analytic two-bone IK: hands follow the actual cloth edge, not a guessed pose. */
class Limb {
  private a = new THREE.Vector3(); private b = new THREE.Vector3(); private c = new THREE.Vector3();
  private axis = new THREE.Vector3(); private bend = new THREE.Vector3(); private elbow = new THREE.Vector3();
  private from = new THREE.Vector3(); private to = new THREE.Vector3();
  private delta = new THREE.Quaternion(); private world = new THREE.Quaternion(); private parent = new THREE.Quaternion();
  readonly restEnd = new THREE.Quaternion();
  constructor(readonly upper: THREE.Bone, readonly lower: THREE.Bone, readonly end: THREE.Bone) { end.getWorldQuaternion(this.restEnd); }
  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.getWorldPosition(this.a); child.getWorldPosition(this.b);
    this.from.subVectors(this.b, this.a).normalize(); this.to.subVectors(target, this.a).normalize();
    this.delta.setFromUnitVectors(this.from, this.to); bone.getWorldQuaternion(this.world); this.world.premultiply(this.delta);
    bone.parent!.getWorldQuaternion(this.parent).invert(); bone.quaternion.copy(this.parent).multiply(this.world);
    bone.updateWorldMatrix(false, true);
  }
  solve(target: THREE.Vector3, pole: THREE.Vector3) {
    this.upper.getWorldPosition(this.a); this.lower.getWorldPosition(this.b); this.end.getWorldPosition(this.c);
    const first = this.a.distanceTo(this.b), second = this.b.distanceTo(this.c);
    const distance = THREE.MathUtils.clamp(this.a.distanceTo(target), .01, first + second - .002);
    this.axis.subVectors(target, this.a).normalize(); this.bend.subVectors(pole, this.a);
    this.bend.addScaledVector(this.axis, -this.bend.dot(this.axis)).normalize();
    const along = (first * first - second * second + distance * distance) / (2 * distance);
    this.elbow.copy(this.a).addScaledVector(this.axis, along).addScaledVector(this.bend, Math.sqrt(Math.max(0, first * first - along * along)));
    this.aim(this.upper, this.lower, this.elbow); this.aim(this.lower, this.end, target);
  }
  orientEnd(world: THREE.Quaternion) { this.end.parent!.getWorldQuaternion(this.parent).invert(); this.end.quaternion.copy(this.parent).multiply(world); this.end.updateWorldMatrix(false, true); }
}

class Attendant {
  readonly group = new THREE.Group();
  private bones: { bone: THREE.Bone; rest: THREE.Quaternion }[] = [];
  private arms: Limb[]; private legs: Limb[];
  private grips: THREE.Quaternion[];
  private target = new THREE.Vector3(); private idle = new THREE.Vector3(); private pole = new THREE.Vector3();
  private orientation = new THREE.Quaternion(); private joint = new THREE.Vector3();
  private fingers: { bone: THREE.Bone; rest: THREE.Quaternion }[];
  private curl = new THREE.Quaternion(); private axis = new THREE.Vector3(1, 0, 0);
  handError = 0;
  constructor(model: THREE.Group, readonly side: number) {
    const box = new THREE.Box3().setFromObject(model), height = box.max.y - box.min.y;
    model.scale.multiplyScalar((side < 0 ? 1.81 : 1.78) / height);
    model.position.y -= box.min.y * model.scale.y;
    this.group.add(model); this.group.updateMatrixWorld(true);
    const lookup = new Map<string, THREE.Bone>();
    model.traverse(object => {
      if (object instanceof THREE.Bone) { lookup.set(object.name.replace(/^mixamorig[:_]?/, ''), object); this.bones.push({ bone: object, rest: object.quaternion.clone() }); }
      if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = true; }
      if (object instanceof THREE.SkinnedMesh) {
        object.computeBoundingSphere();
        // Conservative rig envelope covers arm lift and lateral steps without
        // recomputing skinned vertex bounds each frame. Especially useful on portrait.
        object.boundingSphere!.radius += .65 / model.scale.y;
      }
    });
    const bone = (name: string) => { const result = lookup.get(name); if (!result) throw new Error(`Personagem incompleto: ${name}`); return result; };
    this.arms = ['Left', 'Right'].map(s => new Limb(bone(s + 'Arm'), bone(s + 'ForeArm'), bone(s + 'Hand')));
    this.legs = ['Left', 'Right'].map(s => new Limb(bone(s + 'UpLeg'), bone(s + 'Leg'), bone(s + 'Foot')));
    this.grips = ['Left', 'Right'].map((s, index) => {
      const wrist = bone(s + 'Hand').getWorldPosition(new THREE.Vector3());
      const direction = bone(s + 'HandMiddle1').getWorldPosition(new THREE.Vector3()).sub(wrist).normalize();
      return new THREE.Quaternion().setFromUnitVectors(direction, new THREE.Vector3(0, -1, .08).normalize()).multiply(this.arms[index].restEnd);
    });
    this.fingers = this.bones.filter(({ bone }) => bone.name.includes((side < 0 ? 'Left' : 'Right') + 'Hand') && /[123]$/.test(bone.name));
  }
  update(pose: Pose) {
    for (const { bone, rest } of this.bones) bone.quaternion.copy(rest);
    this.group.position.set(this.side * pose.actorX, FLOOR, -32.50);
    this.group.rotation.y = this.side * Math.PI / 4 * pose.turn;
    this.group.updateMatrixWorld(true);
    // Small lateral steps, with stance and swing phases. No head shake.
    const approaching = pose.phase === 'approach';
    const travel = approaching ? .63 * pose.approach : pose.gap, stride = .66;
    const direction = approaching ? -this.side : this.side;
    const amplitude = approaching ? Math.sin(pose.approach * Math.PI) : pose.walking ? Math.min(1, pose.pull * 15, (1 - pose.pull) * 15) : 0;
    for (let index = 0; index < 2; index++) {
      const anatomical = index === 0 ? 1 : -1;
      const phase = (travel / stride + index * .5) % 1;
      const swing = phase < .6 ? 0 : Math.sin((phase - .6) / .4 * Math.PI);
      const offset = (phase < .6 ? .5 - phase / .6 : -.5 + (phase - .6) / .4) * stride * .6 * amplitude;
      this.target.set(anatomical * .12, .095, .025); this.group.localToWorld(this.target);
      this.target.x += direction * offset; this.target.y += swing * .085 * amplitude;
      this.pole.set(anatomical * .18, .6, .8); this.group.localToWorld(this.pole);
      this.legs[index].solve(this.target, this.pole);
      this.orientation.copy(this.group.quaternion).multiply(this.legs[index].restEnd); this.legs[index].orientEnd(this.orientation);
    }
    for (let index = 0; index < 2; index++) {
      const anatomical = index === 0 ? 1 : -1;
      const pulling = (this.side < 0 ? index === 0 : index === 1);
      this.idle.set(anatomical * .25, .87, .055); this.group.localToWorld(this.idle);
      this.target.copy(this.idle);
      // Wrist stays in front of the cloth; curled fingers overlap its seam.
      if (pulling) { this.target.set(this.side * (pose.gap + .07), this.side < 0 ? 2.30 : 2.19, CLOTH_Z + .10).lerp(this.idle, 1 - pose.grasp); }
      this.pole.set(anatomical * .55, 1.02, .55); this.group.localToWorld(this.pole);
      this.arms[index].solve(this.target, this.pole);
      if (pulling) {
        this.arms[index].end.getWorldQuaternion(this.orientation); this.orientation.slerp(this.grips[index], pose.grasp);
        this.arms[index].orientEnd(this.orientation);
      }
      if (pulling && pose.grasp > .99) { this.arms[index].end.getWorldPosition(this.joint); this.handError = this.joint.distanceTo(this.target); }
    }
    this.curl.setFromAxisAngle(this.axis, -.65 * pose.grasp);
    for (const { bone, rest } of this.fingers) bone.quaternion.copy(rest).multiply(this.curl);
  }
}

function velvet() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!; const pixels = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = 120 + ((x * 17 + y * 29) % 13) + (x % 2) * 5, i = (y * 128 + x) * 4;
    pixels.data.set([n, n, n, 255], i);
  }
  ctx.putImageData(pixels, 0, 0); const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(30, 16);
  return new THREE.MeshPhysicalMaterial({ color: '#0b4035', roughness: .94, metalness: 0, sheen: .65, sheenColor: '#779084', sheenRoughness: .85, bumpMap: map, bumpScale: .009, side: THREE.DoubleSide });
}

export function disposeRevealResources(group: THREE.Group) {
  const materials = new Set<THREE.Material>(), maps = new Set<THREE.Texture>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose(); if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  materials.forEach(material => { Object.values(material).forEach(value => { if (value instanceof THREE.Texture) maps.add(value); }); material.dispose(); });
  maps.forEach(map => map.dispose()); group.clear();
}

export async function createStageReveal() {
  const loader = new GLTFLoader();
  // allSettled lets us dispose a successful half when the other asset fails.
  const loaded = await Promise.allSettled(['left', 'right'].map(side => loader.loadAsync(`/soy-summit/people/usher-${side}.glb`)));
  if (loaded.some(result => result.status === 'rejected')) {
    loaded.forEach(result => { if (result.status === 'fulfilled') disposeRevealResources(result.value.scene); });
    throw new Error('Não foi possível carregar os personagens da apresentação. Tente novamente.');
  }
  const group = new THREE.Group(); group.name = 'Abertura do Soy Summit';
  const attendants = loaded.map((result, index) => new Attendant((result as PromiseFulfilledResult<Awaited<ReturnType<GLTFLoader['loadAsync']>>>).value.scene, index ? 1 : -1));
  attendants.forEach(actor => group.add(actor.group));
  const material = velvet(), gold = new THREE.MeshStandardMaterial({ color: '#bea05e', roughness: .51, metalness: .5 });
  const nx = 96, ny = 28;
  const halves = [-1, 1].map(side => {
    const geometry = new THREE.PlaneGeometry(WIDTH, TOP - BOTTOM, nx, ny);
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.receiveShadow = true; group.add(mesh);
    const seam = new THREE.Mesh(new THREE.CylinderGeometry(.023, .023, TOP - BOTTOM, 8), gold); group.add(seam);
    const hem = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, .07, nx, 1), gold); hem.frustumCulled = false; group.add(hem);
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(.085, .016, 6, 10), gold, 23); rings.frustumCulled = false; group.add(rings);
    return { side, geometry, seam, hem, rings };
  });
  // Soft floor contact and a pair of stage fills; no extra shadow maps.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, '#0007'); gradient.addColorStop(1, '#0000'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  for (const actor of attendants) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.9, .7), shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .006; actor.group.add(shadow);
    const light = new THREE.PointLight('#fff1dc', 30, 13, 2); light.position.set(actor.side * 5, 4.6, -29); group.add(light);
  }
  const transform = new THREE.Object3D(); let lastTime = -1; let current = revealPose(0);
  function update(seconds: number) {
    if (seconds === lastTime) return; lastTime = seconds; current = revealPose(seconds);
    for (const half of halves) {
      const positions = half.geometry.getAttribute('position') as THREE.BufferAttribute;
      const hemPositions = half.hem.geometry.getAttribute('position') as THREE.BufferAttribute;
      const remaining = WIDTH - current.gap;
      const depth = .12 + current.pull * .13;
      for (let row = 0; row <= ny; row++) for (let column = 0; column <= nx; column++) {
        const u = column / nx, v = 1 - row / ny;
        const wave = Math.sin(u * Math.PI * 28) * depth;
        const motion = Math.sin(u * 17 - seconds * 3) * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * .045 * Math.sin(current.pull * Math.PI);
        const x = half.side * (current.gap + remaining * u - .035 * (1 - current.pull));
        const y = BOTTOM + (TOP - BOTTOM) * v + Math.sin(u * Math.PI * 28) * .025 * (1 - v);
        const z = CLOTH_Z + wave + motion;
        positions.setXYZ(row * (nx + 1) + column, x, y, z);
        if (row === ny) for (let h = 0; h < 2; h++) hemPositions.setXYZ(h * (nx + 1) + column, x, y + .045 - h * .07, z + .015);
      }
      positions.needsUpdate = true; half.geometry.computeVertexNormals();
      hemPositions.needsUpdate = true; half.hem.geometry.computeVertexNormals();
      half.seam.position.set(half.side * (current.gap - .035 * (1 - current.pull)), (TOP + BOTTOM) / 2, CLOTH_Z + .02);
      for (let index = 0; index < 23; index++) { transform.position.set(half.side * (current.gap + remaining * index / 22), TOP, CLOTH_Z); transform.updateMatrix(); half.rings.setMatrixAt(index, transform.matrix); }
      half.rings.instanceMatrix.needsUpdate = true;
    }
    attendants.forEach(actor => actor.update(current));
  }
  update(0);
  return { group, update, duration: REVEAL_DURATION,
    diagnostics: () => ({ ...current, handErrors: attendants.map(actor => actor.handError) }),
    dispose: () => disposeRevealResources(group),
  };
}
