import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ResidentialBatchKind, ResidentialSurface } from './lateralResidentialGeometry';

/** Unit meshes shared by every property; all upward surfaces use +Y winding. */
export function createResidentialRoof(hip: boolean) {
  const vertices = hip
    ? [[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5], [-.24, 1, 0], [.24, 1, 0]]
    : [[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5], [-.5, 1, 0], [.5, 1, 0]];
  const faces = [[0, 4, 5], [0, 5, 1], [1, 5, 2], [2, 5, 4], [2, 4, 3], [3, 4, 0]];
  const geometry = new THREE.BufferGeometry();
  const points = faces.flatMap((face) => face.flatMap((index) => vertices[index]));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(faces.flatMap((face) => face.flatMap((index) => [vertices[index][0] + .5, vertices[index][2] + .5])), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function poolGeometry(rounded: boolean, kidney: boolean) {
  const shape = new THREE.Shape();
  if (kidney) {
    shape.moveTo(-.5, 0);
    shape.bezierCurveTo(-.5, -.4, -.28, -.52, .02, -.47);
    shape.bezierCurveTo(.5, -.58, .65, -.18, .34, .03);
    shape.bezierCurveTo(.2, .2, .54, .36, .25, .48);
    shape.bezierCurveTo(-.15, .6, -.5, .36, -.5, 0);
  } else {
    const r = rounded ? .22 : .035;
    shape.moveTo(-.5 + r, -.5); shape.lineTo(.5 - r, -.5);
    shape.quadraticCurveTo(.5, -.5, .5, -.5 + r); shape.lineTo(.5, .5 - r);
    shape.quadraticCurveTo(.5, .5, .5 - r, .5); shape.lineTo(-.5 + r, .5);
    shape.quadraticCurveTo(-.5, .5, -.5, .5 - r); shape.lineTo(-.5, -.5 + r);
    shape.quadraticCurveTo(-.5, -.5, -.5 + r, -.5);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 10 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -.5, 0);
  return geometry;
}

export function createResidentialPalm(detailed: boolean) {
  const positions: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => {
    positions.push(...a, ...b, ...c, ...c, ...b, ...a); // opaque two-sided fronds without alpha sorting
  };
  const fronds = detailed ? 22 : 12;
  for (let leaf = 0; leaf < fronds; leaf++) {
    const angle = leaf * 2.399963;
    const length = .36 + (leaf % 4) * .04;
    const segments = detailed ? 7 : 3;
    const point = (u: number, side = 0): number[] => {
      const radius = length * u;
      const width = Math.sin(Math.PI * u) * (detailed ? .037 : .063) * side;
      return [Math.cos(angle) * radius - Math.sin(angle) * width,
        .17 + Math.sin(u * Math.PI * .94) * (.2 + leaf % 3 * .025) - u * u * .31,
        Math.sin(angle) * radius + Math.cos(angle) * width];
    };
    for (let n = 0; n < segments; n++) {
      const u = n / segments, v = (n + 1) / segments;
      triangle(point(u, -1), point(v, -1), point(v, 1));
      triangle(point(u, -1), point(v, 1), point(u, 1));
      if (detailed && n > 0) {
        for (const side of [-1, 1]) {
          const center = point(u);
          const tip = point(Math.min(1, u + .18), side * 2.5);
          triangle(center, tip, point(Math.min(1, u + .105), side * .35));
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((_value, i) => i % 3 === 0 ? [positions[i] + .5, positions[i + 2] + .5] : []), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function crownGeometry() {
  const parts = [[0, .02, 0, .38], [-.21, -.03, .03, .27], [.2, -.05, -.09, .29], [.03, .18, .09, .27]]
    .map(([x, y, z, radius]) => {
      const geometry = new THREE.IcosahedronGeometry(radius, 1);
      geometry.translate(x, y, z);
      return geometry;
    });
  const merged = mergeGeometries(parts)!;
  parts.forEach((geometry) => geometry.dispose());
  return merged;
}

export function createResidentialSharedAssets() {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  const geometries: Record<ResidentialBatchKind, THREE.BufferGeometry> = {
    masonry: box, hipRoof: createResidentialRoof(true), gableRoof: createResidentialRoof(false), flatRoof: box,
    trunk: new THREE.CylinderGeometry(.5, .6, 1, 7), canopy: crownGeometry(), palm: createResidentialPalm(true),
    detail: box, glass: box, solar: box, poolRect: poolGeometry(false, false),
    poolRounded: poolGeometry(true, false), poolKidney: poolGeometry(false, true), lamp: box, lightPool: plane,
  };
  const farPalm = createResidentialPalm(false);
  const materials = Object.fromEntries<THREE.Material>(Object.keys(geometries).map((key) => {
    const kind = key as ResidentialBatchKind;
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: kind.startsWith('pool') ? .42 : .88,
      metalness: kind === 'solar' ? .15 : 0, name: `district-${kind}` });
    if (kind.startsWith('pool')) {
      // Water alone receives a restrained night tint; coping/decks stay opaque.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance *= step(diffuseColor.r * 1.3, diffuseColor.b);');
      };
      material.customProgramCacheKey = () => 'district-pool-water-v1';
    }
    if (kind === 'solar' || kind === 'hipRoof' || kind === 'gableRoof') {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec2 grid = fract(vUv * vec2(${kind === 'solar' ? '8.0, 12.0' : '24.0, 18.0'}));
          float aa = max(fwidth(grid.x), fwidth(grid.y));
          float seam = smoothstep(0.025, 0.075 + aa, min(grid.x, grid.y));
          diffuseColor.rgb *= mix(${kind === 'solar' ? '1.3, 0.85' : '0.80, 1.0'}, seam);`);
      };
      material.defines = { USE_UV: '' };
      material.customProgramCacheKey = () => `district-surface-${kind}-v1`;
    }
    return [kind, material];
  })) as Record<ResidentialBatchKind, THREE.Material>;
  materials.lightPool.dispose();
  materials.lightPool = new THREE.ShaderMaterial({
    name: 'district-lamp-ground', transparent: true, depthWrite: false, depthTest: true,
    uniforms: { brightness: { value: 0 } },
    vertexShader: 'varying vec2 vPool; void main(){vPool=uv*2.0-1.0;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vPool; uniform float brightness; void main(){float r=length(vPool); float a=pow(max(0.0,1.0-r),2.0)*brightness;gl_FragColor=vec4(1.0,0.79,0.43,a);}',
  });
  return { geometries, farPalm, materials, dispose() {
    new Set([...Object.values(geometries), farPalm]).forEach((geometry) => geometry.dispose());
    Object.values(materials).forEach((material) => material.dispose());
  } };
}

export function createResidentialGround(surfaces: readonly ResidentialSurface[]) {
  const parts = surfaces.map((surface) => {
    const shape = new THREE.Shape(surface.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, surface.elevation, 0);
    const color = new THREE.Color(surface.color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
}
