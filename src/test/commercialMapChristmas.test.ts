import { Box3, Euler, PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';
import { CHRISTMAS_FLIGHT_MS, createChristmasClock } from '@/features/commercial-map/christmas/christmasClock';
import {
  CHRISTMAS_CAMERA_FOV,
  CHRISTMAS_MODEL_SCALE,
  resolveChristmasFlight,
  sampleChristmasCamera,
  sampleChristmasFlight,
} from '@/features/commercial-map/christmas/christmasFlight';
import { isChristmasCameraOwned, registerChristmasCamera, useChristmasSession } from '@/features/commercial-map/christmas/christmasSession';

afterEach(() => useChristmasSession.getState().close(useChristmasSession.getState().id));

describe('Christmas session', () => {
  it('uses visible monotonic time from the first passage frame, independent of frame rate', () => {
    const clock = createChristmasClock();
    clock.setVisible(false, 15);
    clock.setVisible(true, 200);
    expect(clock.frame(700)).toBe(0);
    expect(clock.frame(901)).toBe(201);
    clock.setVisible(false, 2700);
    clock.setVisible(false, 3100);
    clock.setVisible(true, 6700);
    expect(clock.frame(12699)).toBe(7999);
    expect(clock.frame(12705)).toBe(CHRISTMAS_FLIGHT_MS);
  });

  it('owns the camera through preparation, flight and return and ignores stale work', () => {
    const acquire = vi.fn(() => true);
    const release = vi.fn((_id: number, animate: boolean) => animate);
    const unregister = registerChristmasCamera({ acquire, release });
    const session = useChristmasSession.getState();
    try {
      expect(session.start(false)).toBe(true);
      const first = useChristmasSession.getState().id;
      expect(session.start(false)).toBe(false);
      expect(isChristmasCameraOwned()).toBe(true);
      session.fly(first);
      session.greet(first, true);
      session.greet(first, true);
      expect(release).toHaveBeenCalledTimes(1);
      expect(isChristmasCameraOwned()).toBe(true);
      session.finishReturn(first);
      expect(isChristmasCameraOwned()).toBe(false);
      session.close(first);
      expect(session.start(false)).toBe(true);
      const second = useChristmasSession.getState().id;
      session.greet(first);
      session.close(first);
      expect(useChristmasSession.getState()).toMatchObject({ id: second, phase: 'preparing' });
    } finally {
      unregister();
    }
  });

  it('can open the greeting with no renderer and without acquiring a camera', () => {
    const acquire = vi.fn(() => false);
    const unregister = registerChristmasCamera({ acquire, release: () => false });
    try {
      const session = useChristmasSession.getState();
      expect(session.start(true)).toBe(true);
      expect(acquire).not.toHaveBeenCalled();
      expect(useChristmasSession.getState().phase).toBe('greeting');
      expect(isChristmasCameraOwned()).toBe(false);
    } finally {
      unregister();
    }
  });
});

describe('Rua Argentina Christmas route', () => {
  const { entities, lots } = OFFICIAL_REFERENCE_DATA;
  const flight = resolveChristmasFlight(entities, selectCommercialTreesForScene(entities, lots));
  const envelope = new Box3(new Vector3(-4.1, -1.9, -3.2), new Vector3(15, 3.9, 3.2));
  const sides = [envelope.min, envelope.max];

  it.each([0.46, 0.66, 1.48])('frames the complete formation throughout the main shot at aspect %s', (aspect) => {
    expect(flight).not.toBeNull();
    const camera = new PerspectiveCamera(CHRISTMAS_CAMERA_FOV, aspect, 0.25, 300);
    const root = new Vector3();
    const tangent = new Vector3();
    const target = new Vector3();
    const point = new Vector3();
    for (let seconds = 1.2; seconds <= 5.8; seconds += 0.2) {
      sampleChristmasCamera(flight, seconds, aspect, camera.position, target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      sampleChristmasFlight(flight, seconds, root);
      sampleChristmasFlight(flight, seconds + 0.03, tangent).sub(root);
      const rotation = new Euler(
        0.085 * Math.sin(seconds * 1.62), -Math.atan2(tangent.z, tangent.x),
        Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)), 'YXZ',
      );
      for (const x of sides) for (const y of sides) for (const z of sides) {
        point.set(x.x, y.y, z.z).multiplyScalar(CHRISTMAS_MODEL_SCALE).applyEuler(rotation).add(root).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(0.86);
        expect(Math.abs(point.y)).toBeLessThan(0.86);
      }
    }
  });
});
