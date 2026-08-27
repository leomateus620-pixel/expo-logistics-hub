import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  GATE_FOUR_DISTRICT_LAYOUT,
  GATE_FOUR_DISTRICT_RENDER_BUDGET,
  resolveCrioulosArchitectureEnvelope,
} from '@/features/commercial-map/data/gateFourDistrict';
import {
  createGateFourMappedMaterial,
  createGateFourSurfaceTexture,
  createHipRoofGeometry,
  createPavilionNineSideOpenings,
} from '@/features/commercial-map/components/canvas/GateFourLandmarks';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';

// Pure material/geometry factories do not need a renderer or a WebGL context.
vi.mock('@react-three/fiber', () => ({ useThree: vi.fn() }));

describe('modelos arquitetônicos do distrito do Portão 4', () => {
  it('mantém texturas pequenas, zero animação contínua e draw calls dentro do plano', () => {
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.district.textureMaxResolution).toBeLessThanOrEqual(512);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.district.animatedDrawCalls).toBe(0);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.pavilion9.detailedDrawCalls).toBeLessThanOrEqual(17);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.crioulos.detailedDrawCalls).toBeLessThanOrEqual(24);
    expect(GATE_FOUR_DISTRICT_RENDER_BUDGET.gate4.detailedDrawCalls).toBeLessThanOrEqual(9);
  });

  it.each(['brick', 'ceramic-roof', 'metal-roof'] as const)(
    'usa somente modulação neutra no mapa %s, preservando a cor do host nos mipmaps',
    (surface) => {
      const texture = createGateFourSurfaceTexture(surface, 8);
      const pixels = texture.image.data;
      let coloredPixels = 0;
      let transparentPixels = 0;
      let sum = 0;
      let minimum = 255;
      let maximum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const value = pixels[index];
        if (value !== pixels[index + 1] || value !== pixels[index + 2]) coloredPixels += 1;
        if (pixels[index + 3] !== 255) transparentPixels += 1;
        sum += value;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }

      expect(coloredPixels).toBe(0);
      expect(transparentPixels).toBe(0);
      // Averaging to the coarsest mip must not introduce another material hue
      // or turn the tile near-black; close-range relief still needs variation.
      expect(sum / (pixels.length / 4)).toBeGreaterThan(200);
      expect(maximum - minimum).toBeGreaterThan(20);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      texture.dispose();
    },
  );

  it('sincroniza emissão de repouso, hover e seleção sem capturar a intensidade inicial 1 do Three', () => {
    const source = new THREE.MeshStandardMaterial({ color: '#a85f3f' });
    const texture = createGateFourSurfaceTexture('brick', 8);
    const mapped = createGateFourMappedMaterial(source, texture, 0.97, 0);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const object = new THREE.Mesh(geometry, mapped);
    const group = new THREE.Group();

    expect(source.emissiveIntensity).toBe(1);
    expect(mapped.emissiveIntensity).toBe(0);
    expect(mapped.color).toBe(source.color);
    expect(mapped.emissive).toBe(source.emissive);
    expect(mapped.map).toBe(texture);

    [0, 0.012, 0.04, 0].forEach((intensity, index) => {
      // These mutations mirror the shared landmark host's post-render effect.
      source.color.set(index === 2 ? '#ae6948' : '#a85f3f');
      source.emissive.copy(source.color);
      source.emissiveIntensity = intensity;
      mapped.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, geometry, object, group);
      expect(mapped.emissiveIntensity).toBe(intensity);
      expect(mapped.color.equals(source.color)).toBe(true);
      expect(mapped.emissive.equals(source.emissive)).toBe(true);
    });

    geometry.dispose();
    mapped.dispose();
    texture.dispose();
    source.dispose();
  });

  it('centra exatamente dez aberturas por lateral do P9 dentro das baias, sem sobreposição ou avanço das molduras', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.pavilion9;
    const [width, height, depth] = plan.bodyScale;
    const bayCount = plan.facade.longSideBayCount;
    const openings = createPavilionNineSideOpenings(width, depth, height, bayCount);
    const bayWidth = depth / bayCount;

    expect(bayCount).toBe(10);
    expect(openings).toHaveLength(20);
    [-1, 1].forEach((side) => {
      const facade = openings.filter((opening) => Math.sign(opening.position[0]) === side);
      expect(facade).toHaveLength(10);
      facade.forEach((opening, index) => {
        const bayStart = -depth / 2 + index * bayWidth;
        const bayEnd = bayStart + bayWidth;
        const halfFrameWidth = opening.scale[2] * 1.1 / 2;
        expect(opening.position[2]).toBeCloseTo((bayStart + bayEnd) / 2, 10);
        expect(opening.position[2] - halfFrameWidth).toBeGreaterThan(bayStart);
        expect(opening.position[2] + halfFrameWidth).toBeLessThan(bayEnd);
        if (index > 0) {
          const previous = facade[index - 1];
          expect(previous.position[2] + previous.scale[2] * 1.1 / 2)
            .toBeLessThan(opening.position[2] - halfFrameWidth);
        }
      });
    });
  });

  it('mantém D5 térreo e longitudinal, com parede, cobertura, chaminé e mastros proporcionais às fotos', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    const envelope = resolveCrioulosArchitectureEnvelope();
    const [bodyWidth, wallHeight, bodyDepth] = plan.bodyScale;

    expect(bodyWidth / bodyDepth).toBeGreaterThan(1.6);
    expect(wallHeight / bodyWidth).toBeGreaterThanOrEqual(0.2);
    expect(wallHeight / bodyWidth).toBeLessThanOrEqual(0.26);
    expect(plan.roof.ridgeHeight / bodyWidth).toBeLessThan(0.2);
    expect(envelope.roof.ridgeY / bodyWidth).toBeLessThan(0.51);
    expect(plan.chimney.heightAboveRoof).toBeGreaterThanOrEqual(0.25);
    expect(plan.chimney.heightAboveRoof).toBeLessThanOrEqual(0.32);
    expect(envelope.chimney.baseY).toBeLessThan(envelope.roof.eaveY);
    expect(envelope.chimney.capTopY).toBeLessThan(envelope.mastTopY);
    expect(plan.veranda.pillarWidth).toBeGreaterThanOrEqual(0.09);
    expect(plan.veranda.pillarWidth).toBeLessThanOrEqual(0.11);
    expect(plan.flagpoles.every((pole) => pole.height >= 1.55 && pole.height <= 1.75)).toBe(true);
  });

  it('gera quatro águas sobre toda a varanda sul/oeste e desloca a cumeeira para o centro coberto', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    const { floor, roof } = resolveCrioulosArchitectureEnvelope();
    const geometry = createHipRoofGeometry(roof.width, roof.depth, plan.roof.ridgeHeight);
    geometry.translate(roof.center[0], roof.eaveY, roof.center[1]);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;

    expect(floor.minX).toBeCloseTo(-plan.bodyScale[0] / 2 - plan.veranda.depth);
    expect(floor.maxZ).toBeCloseTo(plan.bodyScale[2] / 2 + plan.veranda.depth);
    expect(floor.minX - bounds.min.x).toBeCloseTo(0.12, 6);
    expect(bounds.max.x - floor.maxX).toBeCloseTo(0.12, 6);
    expect(floor.minZ - bounds.min.z).toBeCloseTo(0.12, 6);
    expect(bounds.max.z - floor.maxZ).toBeCloseTo(0.12, 6);
    expect(roof.center[0]).toBeCloseTo(-plan.veranda.depth / 2, 10);
    expect(roof.center[1]).toBeCloseTo(plan.veranda.depth / 2, 10);

    const positions = geometry.getAttribute('position');
    const ridgeVertices = Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index))
      .filter((point) => Math.abs(point.y - roof.ridgeY) < 1e-6);
    expect(ridgeVertices.length).toBeGreaterThanOrEqual(4);
    ridgeVertices.forEach((point) => {
      expect(point.z).toBeCloseTo(roof.center[1], 6);
      expect(Math.abs(point.x - roof.center[0])).toBeCloseTo(roof.ridgeHalfLength, 6);
    });
    const uvs = geometry.getAttribute('uv');
    expect(uvs.count).toBe(positions.count);
    expect(Array.from(uvs.array).every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)).toBe(true);
    geometry.dispose();
  });

  it('apoia pilares no piso, vigas nos pilares e forro nas vigas, todos dentro dos beirais', () => {
    const { floor, roof, columns, beams, stairs } = resolveCrioulosArchitectureEnvelope();
    const halfPillar = columns.width / 2;
    const columnCenters = [...columns.front, ...columns.west];

    expect(columnCenters).toHaveLength(8);
    expect(new Set(columnCenters.map((point) => point.join(','))).size).toBe(8);
    columnCenters.forEach(([x, z]) => {
      expect(x - halfPillar - roof.minX).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(roof.maxX - x - halfPillar).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(z - halfPillar - roof.minZ).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(roof.maxZ - z - halfPillar).toBeGreaterThanOrEqual(0.12 - 1e-9);
    });
    expect(columns.centerY - columns.height / 2).toBeCloseTo(floor.topY, 10);
    expect(columns.centerY + columns.height / 2).toBeCloseTo(beams.bottomY, 10);
    expect(beams.topY).toBeCloseTo(roof.soffitBottomY, 10);
    expect(roof.eaveY - roof.soffitBottomY).toBeCloseTo(GATE_FOUR_DISTRICT_LAYOUT.crioulos.roof.soffitThickness, 10);
    expect(floor.topY - floor.baseY).toBeLessThan(0.1);
    expect(floor.baseY + stairs.count * stairs.riserHeight).toBeCloseTo(floor.topY, 10);
  });

  it('preserva a implantação D5 e deixa o beiral leste antes do footprint e da Rua Buenos Aires', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    const { roof } = resolveCrioulosArchitectureEnvelope();
    const eastEave = plan.center[0] + roof.maxX;
    const footprintEast = Math.max(...plan.footprint.map(([x]) => x));
    const roadWest = Math.min(...GATE_FOUR_DISTRICT_LAYOUT.connectorRoad.polygon.map(([x]) => x));

    expect(plan.sourcePdfAnchor).toEqual([1545, 2241]);
    expect(plan.sourcePdfCenter).toEqual([1540, 2240]);
    expect(plan.facingRadians).toBe(0);
    expect(eastEave).toBeLessThan(footprintEast);
    expect(eastEave).toBeLessThan(roadWest);
    expect(roof.center[0]).toBeLessThan(0);
    expect(roof.center[1]).toBeGreaterThan(0);
  });

  it('deriva foco, label e seleção D5 da ponta dos mastros sem recuperar a antiga altura de torre', () => {
    const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
    const envelope = resolveCrioulosArchitectureEnvelope();
    const entity = OFFICIAL_REFERENCE_ENTITIES.find((candidate) => candidate.publicIdentifier === 'D5')!;
    const originalGeometry = JSON.stringify(entity.geometry);

    expect(envelope.mastTopY).toBeCloseTo(plan.groundElevation + Math.max(...plan.flagpoles.map((pole) => pole.height)));
    expect(envelope.visualHeight).toBeCloseTo(envelope.mastTopY + 0.17);
    expect(strategicLandmarkVisualHeight(entity)).toBeCloseTo(envelope.visualHeight);
    expect(envelope.visualHeight).toBeGreaterThan(1.8);
    expect(envelope.visualHeight).toBeLessThan(1.9);
    expect(JSON.stringify(entity.geometry)).toBe(originalGeometry);
  });

  it('usa o renderer compartilhado, instancing, mipmaps e descarte explícito sem useFrame', () => {
    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/GateFourLandmarks.tsx',
    ), 'utf8');
    const landmarkHost = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
    ), 'utf8');

    expect(renderer).toContain('new THREE.DataTexture');
    expect(renderer).toContain('textureSize: 64');
    expect(renderer).toContain('GATE_FOUR_DISTRICT_RENDER_BUDGET.pavilion9.baseDrawCalls');
    expect(renderer).toContain('THREE.LinearMipmapLinearFilter');
    expect(renderer).toContain('THREE.RepeatWrapping');
    expect(renderer).toContain('disposeInstancedMesh(previous)');
    expect(renderer).toContain('raycast={NO_RAYCAST}');
    expect(renderer).toContain('createHipRoofGeometry');
    expect(renderer).toContain('createGabledBodyGeometry');
    expect(renderer).toContain('const sideOpenings = useMemo(() => createPavilionNineSideOpenings(');
    expect(renderer).not.toMatch(/\buseFrame\b/);
    expect(renderer).not.toMatch(/https?:\/\//);

    expect(landmarkHost).toContain("kind === 'pavilion-nine' && <PavilionNineLandmark");
    expect(landmarkHost).toContain("kind === 'crioulos-center' && <CrioulosCenterLandmark");
    expect(landmarkHost).toContain("kind === 'gate-four' && <GateFourLandmark");
    expect(landmarkHost).toContain('GATE_FOUR_DISTRICT_LAYOUT.gate4.visualOffset');
  });
});
