import { Box3, InstancedMesh, Matrix4, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createChristmasModel } from '@/features/commercial-map/christmas/christmasModel';

describe('Christmas flight formation', () => {
  it.each([false, true])('keeps three separate animated reindeer and stays inside its swept bounds (reduced=%s)', (reduced) => {
    const model = createChristmasModel(reduced);
    try {
      const batches: InstancedMesh[] = [];
      model.root.traverse(part => {
        if (part instanceof InstancedMesh) batches.push(part);
      });
      const reindeer = batches.filter(batch => batch.count === 3);
      const legs = batches.filter(batch => batch.count === 12);
      expect(reindeer).toHaveLength(2); // Reused body and metal batches.
      expect(legs).toHaveLength(2); // Upper and lower joints, each with four legs per animal.

      const matrix = new Matrix4();
      const firstPosition = new Vector3();
      const position = new Vector3();
      reindeer[0].getMatrixAt(0, matrix);
      firstPosition.setFromMatrixPosition(matrix);
      reindeer[0].getMatrixAt(1, matrix);
      position.setFromMatrixPosition(matrix);
      expect(firstPosition.z).toBeGreaterThan(2);
      expect(position.z).toBeLessThan(-2);
      const lastRearX = Math.max(firstPosition.x, position.x);
      reindeer[0].getMatrixAt(2, matrix);
      position.setFromMatrixPosition(matrix);
      expect(position.x).toBeGreaterThan(lastRearX + 3);
      expect(Math.abs(position.z)).toBeLessThan(.5);

      const initialLegs = Array.from({ length: 12 }, (_, index) => {
        const initial = new Matrix4();
        legs[1].getMatrixAt(index, initial);
        return initial;
      });
      model.update(.23, true);
      for (let index = 0; index < initialLegs.length; index++) {
        legs[1].getMatrixAt(index, matrix);
        expect(matrix.equals(initialLegs[index])).toBe(false);
      }

      const bounds = new Box3();
      const currentBounds = new Box3();
      for (let seconds = 0; seconds <= 8; seconds += .25) {
        model.update(seconds, false);
        for (const batch of batches) batch.computeBoundingBox();
        bounds.union(currentBounds.setFromObject(model.root));
      }
      expect(bounds.min.x).toBeGreaterThan(-4.4);
      expect(bounds.min.y).toBeGreaterThan(-2.1);
      expect(bounds.min.z).toBeGreaterThan(-3.4);
      expect(bounds.max.x).toBeLessThan(15.5);
      expect(bounds.max.y).toBeLessThan(4);
      expect(bounds.max.z).toBeLessThan(3.4);

      const raycaster = new Raycaster(new Vector3(0, 1, 8), new Vector3(0, 0, -1));
      expect(raycaster.intersectObject(model.root)).toEqual([]);
    } finally {
      model.dispose();
    }
    expect(model.root.children).toHaveLength(0);
  });
});
