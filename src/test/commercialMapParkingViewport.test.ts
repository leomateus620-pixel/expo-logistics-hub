import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  isParkingPortraitViewport,
  resolveParkingCameraFrame,
  type ParkingCameraFrameInput,
  type ParkingCameraView,
  type ParkingWorldBounds,
} from '@/features/commercial-map/utils/parkingViewport';
import { COMMERCIAL_MAP_MIN_POLAR_ANGLE } from '@/features/commercial-map/utils/viewport';

const footprint: ParkingWorldBounds = { minX: -58, maxX: 54, minZ: -46, maxZ: 3 };
const narrowStrip: ParkingWorldBounds = { minX: 10, maxX: 54, minZ: -44, maxZ: -38 };
const narrowLateral: ParkingWorldBounds = { minX: -56, maxX: -54, minZ: -25, maxZ: 3 };
const individualSpace: ParkingWorldBounds = { minX: -42, maxX: -41.625, minZ: -33, maxZ: -32.25 };
const views: ParkingCameraView[] = ['overview', 'aerial', 'rear', 'lateral', 'detail'];

function projectFrame(input: ParkingCameraFrameInput) {
  const frame = resolveParkingCameraFrame(input);
  const camera = new PerspectiveCamera(
    frame.fov, input.viewportWidth / input.viewportHeight, frame.near, frame.far,
  );
  camera.position.set(...frame.position);
  camera.lookAt(new Vector3(...frame.target));
  camera.updateMatrixWorld(true);
  const corners = [input.bounds.minX, input.bounds.maxX].flatMap((x) => (
    [input.bounds.minZ, input.bounds.maxZ].map((z) => (
      new Vector3(x, input.groundY ?? 0.12, z).project(camera)
    ))
  ));
  return { frame, camera, corners };
}

describe('enquadramento responsivo do estacionamento posterior', () => {
  it.each([
    [1440, 900], [1366, 768], [1920, 1080],
    [393, 852], [390, 660], [320, 568], [844, 390],
  ])('mantém todas as vistas e os limites visíveis fora do painel em %i×%i', (width, height) => {
    for (const bounds of [footprint, narrowStrip, narrowLateral, individualSpace]) {
      for (const view of views) {
        const { frame, corners } = projectFrame({
          bounds, view, viewportWidth: width, viewportHeight: height,
        });
        for (const corner of corners) {
          const pixelX = (corner.x + 1) * width / 2;
          const pixelY = (1 - corner.y) * height / 2;
          expect(pixelX, `${view}: esquerda`).toBeGreaterThanOrEqual(frame.insets.left - 0.01);
          expect(pixelX, `${view}: direita`).toBeLessThanOrEqual(width - frame.insets.right + 0.01);
          expect(pixelY, `${view}: topo`).toBeGreaterThanOrEqual(frame.insets.top - 0.01);
          expect(pixelY, `${view}: base`).toBeLessThanOrEqual(height - frame.insets.bottom + 0.01);
          expect(corner.z).toBeGreaterThan(-1);
          expect(corner.z).toBeLessThan(1);
        }
        expect(frame.target[1]).toBe(0.12);
        expect(frame.position[1]).toBeGreaterThan(frame.target[1]);
      }
    }
  });

  it('usa o eixo vertical disponível no retrato sem afastar a faixa longa como no desktop', () => {
    const portrait = projectFrame({
      bounds: narrowStrip, view: 'overview', viewportWidth: 393, viewportHeight: 852,
    });
    const landscape = projectFrame({
      bounds: narrowStrip, view: 'overview', viewportWidth: 1440, viewportHeight: 900,
    });
    const portraitDirection = new Vector3(...portrait.frame.position).sub(new Vector3(...portrait.frame.target));
    const landscapeDirection = new Vector3(...landscape.frame.position).sub(new Vector3(...landscape.frame.target));
    const portraitWidth = Math.max(...portrait.corners.map((p) => p.x)) - Math.min(...portrait.corners.map((p) => p.x));
    const portraitHeight = Math.max(...portrait.corners.map((p) => p.y)) - Math.min(...portrait.corners.map((p) => p.y));

    expect(Math.abs(portraitDirection.x)).toBeGreaterThan(Math.abs(portraitDirection.z) * 5);
    expect(Math.abs(landscapeDirection.z)).toBeGreaterThan(Math.abs(landscapeDirection.x) * 3);
    expect(portraitHeight * 852).toBeGreaterThan(portraitWidth * 393 * 2);
    expect(portrait.frame.fov).toBe(landscape.frame.fov);
  });

  it('compensa painéis laterais e safe areas mantendo a origem e o alvo no terreno', () => {
    const { frame, camera, corners } = projectFrame({
      bounds: footprint,
      view: 'rear',
      viewportWidth: 1366,
      viewportHeight: 768,
      groundY: 0.18,
      insets: { left: 32, right: 370, top: 84, bottom: 168 },
    });
    const center = new Vector3(-2, 0.18, -21.5).project(camera);
    expect((center.x + 1) * 1366 / 2).toBeCloseTo((32 + 1366 - 370) / 2, 5);
    expect((1 - center.y) * 768 / 2).toBeCloseTo((84 + 768 - 168) / 2, 5);
    expect(frame.target[1]).toBe(0.18);
    expect(frame.insets).toEqual({ left: 32, right: 370, top: 84, bottom: 168 });
    for (const corner of corners) {
      expect((corner.x + 1) * 1366 / 2).toBeGreaterThan(32);
      expect((corner.x + 1) * 1366 / 2).toBeLessThan(996);
    }
  });

  it('preserva as vistas dos fundos e de Crioulos e respeita o clamp polar do controle', () => {
    for (const [width, height] of [[1440, 900], [393, 852]]) {
      const base = { bounds: footprint, viewportWidth: width, viewportHeight: height };
      const rear = resolveParkingCameraFrame({ ...base, view: 'rear' });
      const lateral = resolveParkingCameraFrame({ ...base, view: 'lateral' });
      const aerial = resolveParkingCameraFrame({ ...base, view: 'aerial' });
      const aerialDirection = new Vector3(...aerial.position).sub(new Vector3(...aerial.target)).normalize();
      expect(rear.position[2]).toBeLessThan(rear.target[2]);
      expect(lateral.position[0]).toBeLessThan(lateral.target[0]);
      expect(Math.acos(aerialDirection.y)).toBeGreaterThanOrEqual(COMMERCIAL_MAP_MIN_POLAR_ANGLE);
    }
  });

  it('mantém uma vaga inspecionável sem alterar a escala de coordenadas', () => {
    const frame = resolveParkingCameraFrame({
      bounds: individualSpace, view: 'detail', viewportWidth: 393, viewportHeight: 852,
    });
    expect(frame.distance).toBeGreaterThanOrEqual(1.8);
    expect(frame.distance).toBeLessThan(6);
    expect(frame.target[0]).toBeGreaterThan(-44);
    expect(frame.target[0]).toBeLessThan(-40);
    expect(frame.minDistance).toBeLessThan(frame.distance);
    expect(frame.maxDistance).toBeGreaterThan(frame.distance);
  });

  it('tolera resize transitório, bounds invertidos e entradas não finitas sem NaN', () => {
    const frame = resolveParkingCameraFrame({
      bounds: { minX: 12, maxX: -12, minZ: Number.NaN, maxZ: Number.POSITIVE_INFINITY },
      view: 'overview', viewportWidth: 0, viewportHeight: Number.NaN,
      insets: { top: Number.POSITIVE_INFINITY, right: -100 },
    });
    expect([...frame.position, ...frame.target, frame.distance, frame.near, frame.far].every(Number.isFinite)).toBe(true);
    expect(frame.usableViewport.width).toBeGreaterThan(0);
    expect(frame.usableViewport.height).toBeGreaterThan(0);
    expect(isParkingPortraitViewport(393, 852)).toBe(true);
    expect(isParkingPortraitViewport(852, 393)).toBe(false);
  });
});
