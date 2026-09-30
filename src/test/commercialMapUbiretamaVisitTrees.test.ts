import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '../features/commercial-map/data/exporuralReference2028';
import { buildRearTreeInstances } from '../features/commercial-map/data/rearParkEnvironment';
import * as rearEnvironment from '../features/commercial-map/data/rearParkEnvironment';
import { buildUbiretamaRoadPresentation, ubiretamaPresentationDistance } from '../features/commercial-map/utils/ubiretamaRoadPresentation';
import { buildVisitWorld } from '../features/commercial-map/visit/VisitWorld';

const proceduralTrees = buildRearTreeInstances(false);
const idFor = (tree: typeof proceduralTrees[number]) => `rear-tree:${tree.x}:${tree.z}`;
const proceduralIds = new Set(proceduralTrees.map(idFor));

describe('Ubiretama procedural tree colliders follow the rendered inventory', () => {
  for (const [revision, data] of [['2026', OFFICIAL_REFERENCE_DATA], ['2028', createExporural2028Preview()]] as const) {
    it(`uses the same snapshot clearance as the renderer in ${revision}`, () => {
      const presentation = buildUbiretamaRoadPresentation(data.entities)!;
      const retained = proceduralTrees.filter(tree => ubiretamaPresentationDistance([tree.x, tree.z], presentation) > tree.scale * .5);
      const removed = proceduralTrees.filter(tree => !retained.includes(tree));
      const world = buildVisitWorld({ entities: data.entities, trees: [], includeContext: true });
      const actualIds = new Set(world.collisions.colliders.map(collider => collider.id));
      expect(world.collisions.colliders.filter(collider => proceduralIds.has(collider.id)).map(collider => collider.id))
        .toEqual(retained.map(idFor));
      for (const tree of removed) {
        expect(actualIds.has(idFor(tree))).toBe(false);
        expect(actualIds.has(`${idFor(tree)}:crown`)).toBe(false);
        expect(actualIds.has(`${idFor(tree)}:scrub`)).toBe(false);
      }
      expect(world.ground.surfaces.some(surface => surface.id.startsWith('ubiretama-presentation:'))).toBe(true);
    }, 15000);
  }

  it('removes physical trunks, camera crowns and scrub parts if a supplied procedural tree crosses the new road', () => {
    const data = createExporural2028Preview();
    const presentation = buildUbiretamaRoadPresentation(data.entities)!;
    const asphalt = officialPdfPointToLocal([5937, 1500]), grass = officialPdfPointToLocal([5987, 1500]);
    const asphaltTree = { ...proceduralTrees[0], x: asphalt[0], z: asphalt[1], scale: .04, species: 'scrub' as const };
    const grassTree = { ...asphaltTree, x: grass[0], z: grass[1] };
    expect(ubiretamaPresentationDistance(asphalt, presentation)).toBeLessThan(0);
    expect(ubiretamaPresentationDistance(grass, presentation)).toBeGreaterThan(grassTree.scale * .5);
    const source = vi.spyOn(rearEnvironment, 'buildRearTreeInstances').mockReturnValue([asphaltTree, grassTree]);
    try {
      const world = buildVisitWorld({ entities: data.entities, trees: [], includeContext: true });
      const ids = new Set(world.collisions.colliders.map(collider => collider.id));
      for (const suffix of ['', ':crown', ':scrub']) {
        expect(ids.has(`${idFor(asphaltTree)}${suffix}`)).toBe(false);
        expect(ids.has(`${idFor(grassTree)}${suffix}`)).toBe(true);
      }
    } finally { source.mockRestore(); }
  }, 15000);

  it('retains the former procedural collider inventory when no usable road exists in the snapshot', () => {
    const world = buildVisitWorld({ entities: [], trees: [], includeContext: true });
    expect(world.collisions.colliders.filter(collider => proceduralIds.has(collider.id)).map(collider => collider.id))
      .toEqual(proceduralTrees.map(idFor));
    expect(world.ground.surfaces.some(surface => surface.id.startsWith('ubiretama-presentation:'))).toBe(false);
  }, 15000);
});
