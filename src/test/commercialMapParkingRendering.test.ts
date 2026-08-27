import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createParkingSpatialIndex,
  parkingBounds,
  parkingBoundsCenter,
  parkingBoundsPolygon,
  parkingContainsPoint,
  parkingConvexHull,
  parkingDistanceToPolygon,
  parkingPointSegmentDistance,
  parkingPolygonArea,
  type ParkingPoint,
  type ParkingPolygon,
} from '@/features/commercial-map/utils/parkingGeometry';
import {
  createParkingArrowGeometry,
  createParkingFeatherGeometry,
  createParkingLineBatch,
  createParkingSurfaceGeometry,
} from '@/features/commercial-map/components/canvas/parkingMeshes';
import {
  createParkingMaterialSet,
  PARKING_MATERIAL_BUDGET,
  PARKING_SURFACE_PROFILES,
} from '@/features/commercial-map/components/canvas/parkingMaterials';
import { EXPORURAL_MAP_UNITS_PER_METER } from '@/features/commercial-map/data/exporuralReference2026';

const resources = new Set<{ dispose(): void }>();
function own<T extends { dispose(): void }>(resource: T): T {
  resources.add(resource);
  return resource;
}
afterEach(() => {
  resources.forEach((resource) => resource.dispose());
  resources.clear();
});

const CONCAVE: ParkingPolygon = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
const TRIANGLE: ParkingPolygon = [[7, 0], [10, 0], [8, 3]];
const rectangle = (x: number, z: number, width: number, depth: number): ParkingPolygon => (
  [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
);

function faces(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  return Array.from({ length: count / 3 }, (_, faceIndex) => {
    const vertex = (offset: number) => new THREE.Vector3().fromBufferAttribute(
      position,
      index ? index.getX(faceIndex * 3 + offset) : faceIndex * 3 + offset,
    );
    const a = vertex(0), b = vertex(1), c = vertex(2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    return { area: cross.length() / 2, normal: cross.clone().normalize(), centroid: a.clone().add(b).add(c).divideScalar(3) };
  });
}

function textureImage(texture: THREE.Texture) {
  return texture.image as { width: number; height: number; data: Uint8Array };
}

function materialTextures(set: ReturnType<typeof createParkingMaterialSet>) {
  return [...new Set(Object.values(set.solid).flatMap((material) => (
    [material.map!, material.normalMap].filter((texture): texture is THREE.Texture => Boolean(texture))
  )))];
}

describe('geometria de superfície e marcações do estacionamento', () => {
  it.each([false, true])('triangula contornos côncavos e separados sem preencher o vazio, invertido=%s', (reversed) => {
    const polygons = [CONCAVE, TRIANGLE].map((polygon) => reversed ? [...polygon].reverse() : polygon);
    const geometry = own(createParkingSurfaceGeometry(polygons, 0.037));
    const triangles = faces(geometry);
    expect(triangles.reduce((sum, face) => sum + face.area, 0)).toBeCloseTo(11.5, 5);
    expect(parkingPolygonArea(CONCAVE) + parkingPolygonArea(TRIANGLE)).toBe(11.5);
    triangles.forEach(({ area, normal, centroid }) => {
      expect(area).toBeGreaterThan(1e-8);
      expect(normal.y).toBeCloseTo(1, 5);
      expect(centroid.y).toBeCloseTo(0.037, 6);
      expect(polygons.some((polygon) => parkingContainsPoint([centroid.x, centroid.z], polygon))).toBe(true);
    });
    expect(geometry.boundingBox!.min.toArray()).toEqual([0, expect.closeTo(0.037, 6), 0]);
    expect(geometry.boundingBox!.max.toArray()).toEqual([10, expect.closeTo(0.037, 6), 4]);
    expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
  });

  it('mantém UV ancorado no mundo, sem espelhar Z nem esticar a textura por bloco', () => {
    const tileWorld = PARKING_SURFACE_PROFILES.gravel.tileMeters * EXPORURAL_MAP_UNITS_PER_METER;
    const first = own(createParkingSurfaceGeometry([rectangle(-1.8, -0.9, 2.7, 1.8)], 0.04));
    const shifted = own(createParkingSurfaceGeometry([rectangle(0.9, -2.7, 2.7, 1.8)], 0.04));
    [first, shifted].forEach((geometry) => {
      const position = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < position.count; i += 1) {
        expect(uv.getX(i) * tileWorld).toBeCloseTo(position.getX(i), 5);
        expect(uv.getY(i) * tileWorld).toBeCloseTo(position.getZ(i), 5);
      }
    });
    const before = first.getAttribute('uv'), after = shifted.getAttribute('uv');
    for (let i = 0; i < before.count; i += 1) {
      expect(after.getX(i) - before.getX(i)).toBeCloseTo(3, 5);
      expect(after.getY(i) - before.getY(i)).toBeCloseTo(-2, 5);
    }
  });

  it.each([false, true])('cria ombro externo com normais para cima e alpha contínuo, invertido=%s', (reversed) => {
    const polygon = reversed ? [...CONCAVE].reverse() : CONCAVE;
    const geometry = own(createParkingFeatherGeometry([polygon], 0.035, 0.08));
    const position = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const alpha = geometry.getAttribute('parkingAlpha');
    const uv = geometry.getAttribute('uv');
    const tileWorld = PARKING_SURFACE_PROFILES.gravel.tileMeters * EXPORURAL_MAP_UNITS_PER_METER;
    for (let i = 0; i < position.count; i += 1) {
      const point: ParkingPoint = [position.getX(i), position.getZ(i)];
      expect(position.getY(i)).toBeCloseTo(0.035, 6);
      expect(normals.getY(i)).toBeCloseTo(1, 5);
      expect(alpha.getX(i)).toBe(i % 2 === 0 ? 1 : 0);
      expect(parkingContainsPoint(point, polygon)).toBe(i % 2 === 0);
      expect(uv.getX(i) * tileWorld).toBeCloseTo(point[0], 5);
      expect(uv.getY(i) * tileWorld).toBeCloseTo(point[1], 5);
    }
    faces(geometry).forEach((face) => {
      expect(face.area).toBeGreaterThan(1e-8);
      expect(face.normal.y).toBeCloseTo(1, 5);
    });
  });

  it('aceita o fechamento explícito do anel sem triângulos nulos ou normais indefinidas no ombro', () => {
    const closed = [...CONCAVE, CONCAVE[0]];
    const openGeometry = own(createParkingFeatherGeometry([CONCAVE], 0.04, 0.08));
    const closedGeometry = own(createParkingFeatherGeometry([closed], 0.04, 0.08));
    const openFaces = faces(openGeometry), closedFaces = faces(closedGeometry);
    expect(closedFaces.every(({ area, normal }) => area > 1e-8 && normal.y > 0.99)).toBe(true);
    expect(closedFaces.reduce((sum, face) => sum + face.area, 0))
      .toBeCloseTo(openFaces.reduce((sum, face) => sum + face.area, 0), 5);
  });

  it('deduplica divisórias invertidas e repetidas em um lote de instâncias com bounds válidos', () => {
    const first = rectangle(-2, -1, 2, 1), second = rectangle(0, -1, 2, 1);
    const batch = own(createParkingLineBatch([first, second, [...first].reverse(), [...second, second[0]]], 0.057));
    const geometry = batch.object.geometry;
    const starts = geometry.getAttribute('instanceStart'), ends = geometry.getAttribute('instanceEnd');
    expect(batch.segmentCount).toBe(7);
    expect(starts.count).toBe(7);
    expect(ends.count).toBe(7);
    for (let i = 0; i < starts.count; i += 1) {
      const a = new THREE.Vector3().fromBufferAttribute(starts, i);
      const b = new THREE.Vector3().fromBufferAttribute(ends, i);
      expect(a.distanceTo(b)).toBeGreaterThan(0);
      expect(geometry.boundingBox!.containsPoint(a)).toBe(true);
      expect(geometry.boundingBox!.containsPoint(b)).toBe(true);
      expect(a.y).toBeCloseTo(0.057, 6);
    }
    expect(geometry.boundingBox!.min.x).toBe(-2);
    expect(geometry.boundingBox!.max.x).toBe(2);
    expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
    const hits: THREE.Intersection[] = [];
    batch.object.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
  });

  it('não fecha polilinhas abertas, não desenha entradas vazias e libera ambos os recursos de linha', () => {
    const path = own(createParkingLineBatch([[[0, 0], [1, 0], [1, 2]]], 0.05, { closed: false }));
    const empty = own(createParkingLineBatch([[[3, 4], [3, 4]]], 0.05));
    expect(path.segmentCount).toBe(2);
    expect(empty.segmentCount).toBe(0);
    expect(empty.object.visible).toBe(false);
    const geometryDisposed = vi.fn(), materialDisposed = vi.fn();
    path.object.geometry.addEventListener('dispose', geometryDisposed);
    path.material.addEventListener('dispose', materialDisposed);
    path.dispose();
    resources.delete(path);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
  });

  it('mantém a seta no plano X/Z com a ponta para -Z e faces visíveis de cima', () => {
    const arrow = own(createParkingArrowGeometry());
    arrow.computeBoundingBox();
    const box = arrow.boundingBox!;
    expect(box.min.x).toBeCloseTo(-0.23, 6);
    expect(box.max.x).toBeCloseTo(0.23, 6);
    expect(box.min.z).toBeCloseTo(-0.42, 6);
    expect(box.max.z).toBeCloseTo(0.42, 6);
    const position = arrow.getAttribute('position');
    const tip = Array.from({ length: position.count }, (_, index) => (
      new THREE.Vector3().fromBufferAttribute(position, index)
    )).filter((point) => Math.abs(point.z - box.min.z) < 1e-6);
    expect(tip).toHaveLength(1);
    expect(tip[0].x).toBeCloseTo(0, 6);
    faces(arrow).forEach(({ area, normal, centroid }) => {
      expect(area).toBeGreaterThan(0);
      expect(normal.y).toBeCloseTo(1, 6);
      expect(centroid.y).toBeCloseTo(0, 6);
    });
  });
});

describe('consulta espacial do estacionamento', () => {
  it('preserva o hull sob permutações/duplicatas sem substituir a geometria côncava de origem', () => {
    const input: ParkingPolygon = [...CONCAVE, CONCAVE[0], [0, 2], [0.5, 0.5]];
    const original = structuredClone(input);
    const hull = parkingConvexHull(input);
    expect(parkingConvexHull([...input].reverse())).toEqual(hull);
    expect(input).toEqual(original);
    expect(hull).toEqual([[0, 0], [4, 0], [4, 1], [1, 4], [0, 4]]);
    expect(parkingPolygonArea(hull)).toBeGreaterThan(parkingPolygonArea(CONCAVE));
    expect(parkingContainsPoint([2, 2], CONCAVE)).toBe(false);
    const bounds = parkingBounds(input, 0.5);
    expect(parkingBoundsCenter(bounds)).toEqual([2, 2]);
    expect(parkingPolygonArea(parkingBoundsPolygon(bounds))).toBe(25);
    expect(parkingConvexHull([[2, 1], [0, 1], [1, 1], [2, 1]])).toEqual([[0, 1], [2, 1]]);
  });

  it('seleciona bordas/vértices em células negativas e resolve divisória compartilhada pela ordem estável', () => {
    const items = [
      { id: 'west', polygon: rectangle(-2, -1, 2, 2) },
      { id: 'east', polygon: rectangle(0, -1, 2, 2) },
    ];
    const index = createParkingSpatialIndex(items, 1);
    for (const point of [[-2, -1], [-1, 0], [0, 0], [2, 1], [3, 0]] as const) {
      expect(index.pick(point)?.id ?? null).toBe(items.find((item) => parkingContainsPoint(point, item.polygon))?.id ?? null);
    }
    expect(index.pick([0, 0])?.id).toBe('west');
    expect(parkingPointSegmentDistance([2, 1], [0, 0], [0, 0])).toBeCloseTo(Math.sqrt(5));
    expect(parkingDistanceToPolygon([5, 1], items[1].polygon)).toBe(3);
    expect(parkingDistanceToPolygon([1, 0], items[1].polygon)).toBe(0);
  });

  it('mantém o mesmo hit inclusivo da consulta geométrica ao cruzar uma borda de célula por tolerância', () => {
    const items = [{ id: 'near-grid-edge', polygon: rectangle(0, 0, 1 - 4e-7, 1) }];
    const point: ParkingPoint = [1, 0.5];
    expect(parkingContainsPoint(point, items[0].polygon)).toBe(true);
    expect(createParkingSpatialIndex(items, 1).pick(point)?.id).toBe(items[0].id);
  });

  it('retorna todos os símbolos sobrepostos uma única vez em ordem estável para desempate por centro', () => {
    const items = [
      { id: 'left-symbol', polygon: rectangle(-2, -1, 2.5, 2) },
      { id: 'right-symbol', polygon: rectangle(-0.5, -1, 2.5, 2) },
      { id: 'far-symbol', polygon: rectangle(8, 3, 2, 1) },
    ];
    const index = createParkingSpatialIndex(items, 0.5);
    for (const point of [[-0.5, -1], [0, 0], [0.5, 1]] as const) {
      expect(index.candidates(point)).toEqual(items.slice(0, 2));
      expect(new Set(index.candidates(point).map((item) => item.id)).size).toBe(2);
      expect(index.pick(point)).toBe(items[0]);
    }
    expect(index.candidates([8.5, 3.5])).toEqual([items[2]]);
    expect(index.candidates([4, 0])).toEqual([]);
  });
});

describe('materiais procedurais do estacionamento em Three r170', () => {
  it('gera albedo opaco não uniforme e normais unitárias sem tratar dados lineares como sRGB', () => {
    const set = own(createParkingMaterialSet(4, false));
    for (const kind of ['gravel', 'soil', 'grass'] as const) {
      const material = set.solid[kind];
      const albedo = material.map!, normal = material.normalMap!;
      const colorImage = textureImage(albedo), normalImage = textureImage(normal);
      expect(set.feather[kind].map).toBe(albedo);
      expect(set.feather[kind].normalMap).toBe(normal);
      expect(albedo.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(normal.colorSpace).toBe(THREE.NoColorSpace);
      expect(new Set(colorImage.data.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(10);
      const sums = [0, 0, 0];
      let opaque = true, maximumNormalError = 0, minimumNormalZ = 1;
      for (let i = 0; i < colorImage.data.length; i += 4) {
        opaque &&= colorImage.data[i + 3] === 255;
        sums.forEach((_, channel) => { sums[channel] += colorImage.data[i + channel]; });
        const x = normalImage.data[i] / 255 * 2 - 1;
        const y = normalImage.data[i + 1] / 255 * 2 - 1;
        const z = normalImage.data[i + 2] / 255 * 2 - 1;
        maximumNormalError = Math.max(maximumNormalError, Math.abs(Math.hypot(x, y, z) - 1));
        minimumNormalZ = Math.min(minimumNormalZ, z);
      }
      expect(opaque).toBe(true);
      expect(maximumNormalError).toBeLessThan(0.012);
      expect(minimumNormalZ).toBeGreaterThan(0);
      const expected = new THREE.Color(PARKING_SURFACE_PROFILES[kind].color).convertLinearToSRGB().toArray();
      sums.forEach((sum, channel) => {
        expect(Math.abs(sum / (colorImage.width * colorImage.height) / 255 - expected[channel])).toBeLessThan(0.04);
      });
      for (const texture of [albedo, normal]) {
        expect(texture.wrapS).toBe(THREE.RepeatWrapping);
        expect(texture.wrapT).toBe(THREE.RepeatWrapping);
        expect(texture.anisotropy).toBe(4);
        expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(texture.magFilter).toBe(THREE.LinearFilter);
        expect(texture.generateMipmaps).toBe(true);
      }
    }
  });

  it('reduz memória real de texturas pela metade sem mudar o albedo entre qualidades', () => {
    const full = own(createParkingMaterialSet(64, false));
    const reduced = own(createParkingMaterialSet(0, true));
    const fullTextures = materialTextures(full), reducedTextures = materialTextures(reduced);
    const bytes = (textures: THREE.Texture[]) => textures.reduce((sum, texture) => sum + textureImage(texture).data.byteLength, 0);
    expect(fullTextures.length).toBeLessThanOrEqual(PARKING_MATERIAL_BUDGET.maximumTextureCount);
    expect(bytes(reducedTextures)).toBe(bytes(fullTextures) / 2);
    expect(bytes(fullTextures) * 4 / 3).toBeLessThanOrEqual(2 * 1024 * 1024);
    for (const kind of ['gravel', 'soil', 'grass'] as const) {
      expect(reduced.solid[kind].normalMap).toBeNull();
      const reducedPixels = textureImage(reduced.solid[kind].map!).data;
      const fullPixels = textureImage(full.solid[kind].map!).data;
      expect(reducedPixels.byteLength).toBe(fullPixels.byteLength);
      expect(reducedPixels.every((value, index) => value === fullPixels[index])).toBe(true);
      expect(full.solid[kind].map!.anisotropy).toBe(PARKING_MATERIAL_BUDGET.maximumAnisotropy);
      expect(reduced.solid[kind].map!.anisotropy).toBe(1);
    }
  });

  it('injeta os efeitos nos chunks presentes do r170 preservando iluminação, normais e projeção', () => {
    const set = own(createParkingMaterialSet(1, false));
    const material = set.feather.gravel;
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('vParkingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz');
    expect(shader.vertexShader).toContain('#include <project_vertex>');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= clamp(vParkingAlpha');
    expect(shader.fragmentShader.indexOf('float parkingPatch =')).toBeLessThan(shader.fragmentShader.indexOf('roughnessFactor = clamp'));
  });

  it('libera cada material/textura compartilhada uma vez sem invalidar outro conjunto montado', () => {
    const first = own(createParkingMaterialSet(2, false)), second = own(createParkingMaterialSet(2, false));
    const firstResources = [...Object.values(first.solid), ...Object.values(first.feather), ...materialTextures(first)];
    const callbacks = firstResources.map((resource) => {
      const callback = vi.fn();
      resource.addEventListener('dispose', callback);
      return callback;
    });
    const otherOwnerDisposed = vi.fn();
    materialTextures(second).forEach((texture) => texture.addEventListener('dispose', otherOwnerDisposed));
    expect(materialTextures(first).every((texture) => !materialTextures(second).includes(texture))).toBe(true);
    first.dispose();
    resources.delete(first);
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(otherOwnerDisposed).not.toHaveBeenCalled();
  });
});
