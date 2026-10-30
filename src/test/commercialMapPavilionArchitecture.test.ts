import { describe, expect, it } from 'vitest';
import { Box3, Euler, Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PAVILION_ARCHITECTURE_RENDER_BUDGET, PHOTOGRAPHED_PAVILION_IDS, resolvePavilionArchitecture2026 } from '@/features/commercial-map/data/pavilionArchitecture2026';
import { createPavilionArchitectureLayout, pavilionArchitectureEaveY, pavilionArchitectureHeight, pavilionArchitectureSignPose } from '@/features/commercial-map/utils/pavilionArchitectureLayout';
import { COMMERCIAL_PAVILION_DEFINITIONS, commercialPavilionModelBounds, createCommercialPavilionLayout } from '@/features/commercial-map/utils/commercialPavilions';
import { resolveCommercialPavilionModulePlan } from '@/features/commercial-map/utils/commercialPavilionModules';
import { strategicLandmarkBounds } from '@/features/commercial-map/utils/landmarks';

function officialLayout(id: typeof PHOTOGRAPHED_PAVILION_IDS[number]) {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(candidate => candidate.publicIdentifier === id)!;
  const definition = COMMERCIAL_PAVILION_DEFINITIONS[id];
  const bounds = commercialPavilionModelBounds(strategicLandmarkBounds(entity), definition.facingRadians);
  return createCommercialPavilionLayout(bounds, definition, undefined, resolveCommercialPavilionModulePlan(entity));
}

describe('arquitetura fotográfica dos cinco pavilhões', () => {
  it('identifica exatamente as placas e exclui os landmarks B12/B13 e os outros pavilhões', () => {
    expect(PHOTOGRAPHED_PAVILION_IDS.map(id => [id, resolvePavilionArchitecture2026(id)?.pavilionNumber]))
      .toEqual([['B1', 1], ['B3', 12], ['B4', 8], ['B5', 13], ['B6', 3]]);
    for (const id of ['B2', 'B8', 'B10', 'B12', 'B13', 'B1-extra']) expect(resolvePavilionArchitecture2026(id)).toBeNull();
    expect(Object.values(PHOTOGRAPHED_PAVILION_IDS).every(id => !resolvePavilionArchitecture2026(id)!.photos.includes('WhatsApp Image 2026-10-30 at 10.39.51 (1).jpeg'))).toBe(true);
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s não modifica planta, orientação, acessos nem cota do piso', id => {
    const layout = officialLayout(id);
    const before = JSON.stringify(layout);
    const plan = resolveCommercialPavilionModulePlan({ publicIdentifier: id })!;
    const planBefore = JSON.stringify(plan);
    const detailed = createPavilionArchitectureLayout(layout, true)!;
    const reduced = createPavilionArchitectureLayout(layout, false)!;
    expect(JSON.stringify(layout)).toBe(before);
    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(detailed.floorY).toBe(layout.interior.floorY);
    expect(detailed.frontZ).toBe(layout.exterior.shell.frontZ);
    expect(detailed.eaveY).toBe(pavilionArchitectureEaveY(layout));
    expect(reduced.batches.roof).toEqual(detailed.batches.roof);
    expect(reduced.batches.wall).toEqual(detailed.batches.wall);
    expect(reduced.batches.cladding).toEqual(detailed.batches.cladding);
    expect(reduced.triangles).toEqual(detailed.triangles);
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s usa lotes de desenho finitos e mantém estrutura fora do conteúdo comercial', id => {
    const layout = officialLayout(id);
    const architecture = createPavilionArchitectureLayout(layout)!;
    expect(Object.keys(architecture.batches).length + new Set(architecture.triangles.map(item => item.material)).size).toBeLessThanOrEqual(PAVILION_ARCHITECTURE_RENDER_BUDGET.maxBatchesPerPavilion);
    expect(architecture.boxCount).toBeLessThan(PAVILION_ARCHITECTURE_RENDER_BUDGET.maxBoxesPerPavilion);
    for (const [material, instances] of Object.entries(architecture.batches)) for (const instance of instances) {
      expect(instance.position.every(Number.isFinite)).toBe(true);
      expect(instance.scale.every(value => value > 0 && Number.isFinite(value))).toBe(true);
      expect((instance.rotation ?? []).every(Number.isFinite)).toBe(true);
      // Low wall/column/gate boxes belong to the perimeter, never to the module floor.
      if (material !== 'platform' && instance.position[1] + instance.scale[1] / 2 < architecture.eaveY * 0.8) {
        expect(Math.abs(instance.position[0]) >= layout.interior.clearWidth / 2
          || Math.abs(instance.position[2]) >= layout.interior.clearDepth / 2).toBe(true);
      }
    }
    for (const triangle of architecture.triangles) {
      expect(triangle.vertices).toHaveLength(3);
      expect(triangle.vertices.flat().every(Number.isFinite)).toBe(true);
    }
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s recorta alvenaria nas esquadrias sem sobrepor portões e janelas', id => {
    const layout = officialLayout(id);
    const architecture = createPavilionArchitectureLayout(layout)!;
    const holes = architecture.facadeOpenings;
    expect(holes.every(hole => hole.y + hole.height / 2 < architecture.eaveY)).toBe(true);
    for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i], b = holes[j];
      expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 - 1e-8
        || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - 1e-8).toBe(true);
    }
    for (const material of ['wall', 'brick', 'cladding', 'accent'] as const) for (const piece of architecture.batches[material] ?? []) {
      if (Math.abs(piece.position[2] - architecture.frontZ) > 0.1 || piece.rotation) continue;
      for (const hole of holes) {
        const intersects = Math.abs(piece.position[0] - hole.x) < (piece.scale[0] + hole.width) / 2 - 1e-8
          && Math.abs(piece.position[1] - hole.y) < (piece.scale[1] + hole.height) / 2 - 1e-8;
        expect(intersects).toBe(false);
      }
    }
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s usa altura de fachada e placa proporcionais, sem mudar a cota do piso', id => {
    const layout = officialLayout(id);
    const profile = resolvePavilionArchitecture2026(id)!;
    expect(pavilionArchitectureHeight(layout)).toBe(layout.exterior.shell.width * profile.facadeHeightToWidth);
    const sign = pavilionArchitectureSignPose(layout);
    expect(sign.width / layout.exterior.shell.width).toBeLessThan(0.23);
    expect(sign.height).toBeLessThanOrEqual(pavilionArchitectureHeight(layout) * .12);
    expect(sign.width / sign.height).toBe(4);
    expect(sign.position[2] - sign.supportDepth).toBeCloseTo(sign.supportSurfaceZ, 12);
    expect(sign.supportDepth).toBeGreaterThan(sign.height * .085);
    expect(sign.supportSurfaceZ).toBeGreaterThanOrEqual(layout.exterior.shell.frontZ);
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s fixa os dois suportes da placa em superfícies físicas existentes', id => {
    const layout = officialLayout(id), sign = pavilionArchitectureSignPose(layout);
    const architecture = createPavilionArchitectureLayout(layout)!;
    const box = new Box3(new Vector3(-.500001, -.500001, -.500001), new Vector3(.500001, .500001, .500001));
    for (const side of [-1, 1]) {
      const attachment = new Vector3(side * sign.width * .34, sign.supportAnchorY, -sign.supportDepth)
        .applyEuler(new Euler(...sign.rotation)).add(new Vector3(...sign.position));
      const attached = Object.values(architecture.batches).flat().some(part => {
        const matrix = new Matrix4().compose(new Vector3(...part.position),
          new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))), new Vector3(...part.scale));
        return box.containsPoint(attachment.clone().applyMatrix4(matrix.invert()));
      });
      expect(attached).toBe(true);
    }
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s deixa o centro e todos os cantos da placa sem corte pela própria arquitetura', id => {
    const layout = officialLayout(id);
    const sign = pavilionArchitectureSignPose(layout);
    const architecture = createPavilionArchitectureLayout(layout)!;
    const box = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));
    const transforms = Object.values(architecture.batches).flat().map(part => {
      const matrix = new Matrix4().compose(new Vector3(...part.position),
        new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))), new Vector3(...part.scale));
      return { matrix, inverse: matrix.clone().invert() };
    });
    for (const [x, y] of [[0, 0], [-.5, -.5], [-.5, .5], [.5, -.5], [.5, .5]]) {
      const origin = new Vector3(x * sign.width, y * sign.height, 0).applyEuler(new Euler(...sign.rotation)).add(new Vector3(...sign.position));
      for (const direction of [new Vector3(0, 0, 1), new Vector3(-.55, .16, 1).normalize(), new Vector3(.55, .16, 1).normalize(), new Vector3(0, .6, 1).normalize()]) {
        const ray = new Ray(origin, direction);
        for (const transform of transforms) expect(ray.clone().applyMatrix4(transform.inverse).intersectBox(box, new Vector3())).toBeNull();
        for (const triangle of architecture.triangles) expect(ray.intersectTriangle(...triangle.vertices.map(point => new Vector3(...point)) as [Vector3, Vector3, Vector3], false, new Vector3())).toBeNull();
      }
    }
  });

  it.each(PHOTOGRAPHED_PAVILION_IDS)('%s mantém nervuras e travessas dos portões na família escura opaca', id => {
    const architecture = createPavilionArchitectureLayout(officialLayout(id))!;
    const gates = architecture.facadeOpenings.filter(opening => opening.kind === 'gate');
    const gateFacesAndRibs = architecture.batches.dark ?? [];
    expect(gateFacesAndRibs).toHaveLength(gates.length * 11);
  });

  it('mantém platibanda no 1 e troca as coberturas sem evidência de 8 e 13 por duas águas', () => {
    const one = createPavilionArchitectureLayout(officialLayout('B1'))!;
    expect(one.profile.roof).toBe('concealed-low-gable');
    expect(one.triangles).toHaveLength(0);
    expect(one.canopyFrontZ).toBeNull();
    for (const id of ['B4', 'B5'] as const) {
      const architecture = createPavilionArchitectureLayout(officialLayout(id))!;
      expect(architecture.profile.roof).toBe('gable');
      expect(architecture.triangles).toHaveLength(2);
      expect(architecture.canopyFrontZ).toBeGreaterThan(architecture.frontZ);
      expect(architecture.facadeOpenings.filter(opening => opening.kind === 'gate')).toHaveLength(2);
    }
  });
});
