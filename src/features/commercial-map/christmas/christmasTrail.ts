import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { sampleChristmasFlight, type ChristmasFlight } from './christmasFlight';

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float opacity;
  attribute float kind;
  varying float vOpacity;
  varying float vKind;
  uniform float pixels;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(size * pixels / max(1.0, -view.z), 1.0, 112.0);
    vOpacity = opacity;
    vKind = kind;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vOpacity;
  varying float vKind;
  uniform float night;
  void main() {
    vec2 point = abs(gl_PointCoord - 0.5) * 2.0;
    float radius = length(point);
    float light = pow(max(0.0, 1.0 - radius), 2.3);
    if (vKind > 0.5 && vKind < 1.5) {
      float crossShape = min(point.x, point.y) * 1.8 + pow(point.x * point.y, 0.48) * 1.8;
      light = max(light, (1.0 - smoothstep(0.07, 0.24, crossShape)) * (1.0 - smoothstep(0.2, 1.0, radius)));
    }
    vec3 color = mix(vec3(0.86, 0.29, 0.038), vec3(1.0, 0.91, 0.51), smoothstep(0.08, 0.76, light));
    color *= mix(1.15, 0.92, night);
    gl_FragColor = vec4(color, light * vOpacity);
    #include <colorspace_fragment>
  }
`;

function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function createChristmasTrail(reduced: boolean) {
  const particles = reduced ? 44 : 88;
  const count = particles + 1;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const kinds = new Float32Array(count);
  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const sizeAttribute = new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage);
  const opacityAttribute = new BufferAttribute(opacities, 1).setUsage(DynamicDrawUsage);
  const kindAttribute = new BufferAttribute(kinds, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('size', sizeAttribute);
  geometry.setAttribute('opacity', opacityAttribute);
  geometry.setAttribute('kind', kindAttribute);
  const material = new ShaderMaterial({
    uniforms: { pixels: { value: 1 }, night: { value: 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.raycast = () => {};
  const point = new Vector3();
  const glow = new Vector3();
  const rate = reduced ? 33 : 66;

  return {
    points,
    update(flight: ChristmasFlight, seconds: number, model: Group, night: boolean, pixels: number) {
      material.uniforms.pixels.value = pixels;
      material.uniforms.night.value = Number(night);
      const last = Math.floor(Math.min(seconds, 6.85) * rate);
      for (let index = 0; index < particles; index++) {
        const seed = last - index;
        const born = seed / rate;
        const age = seconds - born;
        const lifetime = 0.53 + random(seed + 5) * 0.60;
        if (seed < 0 || age >= lifetime) {
          opacities[index] = 0;
          continue;
        }
        sampleChristmasFlight(flight, born, point);
        const lateral = (random(seed + 3) - 0.5) * (0.65 + age * 2.1);
        const vertical = (random(seed + 7) - 0.62) * (0.4 + age * 1.25);
        positions[index * 3] = point.x - 1.85 - age * (0.3 + random(seed) * 1.3);
        positions[index * 3 + 1] = point.y - 0.46 + vertical - age * 0.5;
        positions[index * 3 + 2] = point.z + lateral;
        const star = seed % (reduced ? 9 : 13) === 0;
        kinds[index] = star ? 1 : 0;
        const life = 1 - age / lifetime;
        sizes[index] = (star ? 0.74 : 0.24) * (0.58 + random(seed + 13) * 0.70) * (0.36 + life * 0.64);
        opacities[index] = (star ? 1 : 0.98) * life;
      }
      glow.set(-2.8, -1.1, 0).multiplyScalar(model.scale.x).applyQuaternion(model.quaternion).add(model.position);
      positions[particles * 3] = glow.x;
      positions[particles * 3 + 1] = glow.y;
      positions[particles * 3 + 2] = glow.z;
      sizes[particles] = 2.2;
      kinds[particles] = 2;
      opacities[particles] = 0.52 * Math.max(0, 1 - Math.max(0, seconds - 6.15) / 1.15);
      positionAttribute.needsUpdate = sizeAttribute.needsUpdate = opacityAttribute.needsUpdate = kindAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
