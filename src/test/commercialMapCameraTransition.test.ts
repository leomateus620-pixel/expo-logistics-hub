import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Quaternion, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import {
  expandCommercialMapControlAngles,
  prepareOrbitControlsForTransitionHandoff,
  stabilizeCameraTransitionUp,
  type CommercialMapControlAngles,
} from '@/features/commercial-map/utils/cameraTransition';

const UP = new Vector3(0, 1, 0);

function lookQuaternion(position: Vector3, target: Vector3) {
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, target, UP));
}

describe('entrega da transição para o OrbitControls real', () => {
  it.each([
    { fromTheta: 2.8, toTheta: -1.8, minimum: -2.65, maximum: -0.9 },
    { fromTheta: -2.8, toTheta: 1.8, minimum: 0.9, maximum: 2.65 },
  ])('não salta ao cancelar o arco $fromTheta → $toTheta através de ±π', ({
    fromTheta,
    toTheta,
    minimum,
    maximum,
  }) => {
    const desired: CommercialMapControlAngles = {
      minPolarAngle: 0.025,
      maxPolarAngle: Math.PI / 2.08,
      minAzimuthAngle: minimum,
      maxAzimuthAngle: maximum,
    };
    const fromTarget = new Vector3(-20, 0, 35);
    const toTarget = new Vector3(50, 2, -25);
    const fromPosition = fromTarget.clone().add(new Vector3().setFromSpherical(new Spherical(100, 0.8, fromTheta)));
    const toPosition = toTarget.clone().add(new Vector3().setFromSpherical(new Spherical(100, 0.7, toTheta)));
    const fromQuaternion = lookQuaternion(fromPosition, fromTarget);
    const toQuaternion = lookQuaternion(toPosition, toTarget);

    for (const progress of [0.1, 0.2, 0.3, 0.5, 0.75]) {
      const camera = new PerspectiveCamera(38, 1, 0.05, 1200);
      const controls = new OrbitControls(camera);
      const scratch = { direction: new Vector3(), spherical: new Spherical(), matrix: new Matrix4() };
      Object.assign(controls, expandCommercialMapControlAngles(desired, 0.8, fromTheta));
      controls.minDistance = 10;
      controls.maxDistance = 200;
      camera.position.lerpVectors(fromPosition, toPosition, progress);
      camera.quaternion.slerpQuaternions(fromQuaternion, toQuaternion, progress);
      controls.target.lerpVectors(fromTarget, toTarget, progress);

      const interpolatedDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      stabilizeCameraTransitionUp(camera.quaternion, camera.up, scratch.direction, scratch.matrix);
      expect(new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).distanceTo(interpolatedDirection)).toBeLessThan(1e-10);
      const beforePosition = camera.position.clone();
      const beforeQuaternion = camera.quaternion.clone();

      const handoff = prepareOrbitControlsForTransitionHandoff(camera, controls, desired, 10, 200, scratch);
      expect(handoff.angles.minAzimuthAngle).toBeGreaterThanOrEqual(-Math.PI);
      expect(handoff.angles.maxAzimuthAngle).toBeLessThanOrEqual(Math.PI);
      controls.enabled = true;
      controls.enableDamping = true;
      controls.update();

      expect(camera.position.distanceTo(beforePosition)).toBeLessThan(1e-9);
      expect(camera.quaternion.angleTo(beforeQuaternion)).toBeLessThan(1e-7);
      controls.dispose();
    }
  });

  it('preserva também a distância intermediária abaixo do limite final', () => {
    const camera = new PerspectiveCamera();
    const controls = new OrbitControls(camera);
    const desired: CommercialMapControlAngles = {
      minPolarAngle: 0.025,
      maxPolarAngle: 1.5,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
    };
    camera.position.set(0, 5, 5);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    const beforePosition = camera.position.clone();
    const beforeQuaternion = camera.quaternion.clone();
    const handoff = prepareOrbitControlsForTransitionHandoff(camera, controls, desired, 20, 200, {
      direction: new Vector3(), spherical: new Spherical(),
    });

    expect(handoff.limits.minDistance).toBeCloseTo(Math.sqrt(50), 10);
    controls.update();
    expect(camera.position.distanceTo(beforePosition)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(beforeQuaternion)).toBeLessThan(1e-7);
    controls.dispose();
  });

  it('mantém os limites expandidos canônicos junto à descontinuidade angular', () => {
    const desired: CommercialMapControlAngles = {
      minPolarAngle: 0.025,
      maxPolarAngle: 1.5,
      minAzimuthAngle: -2.65,
      maxAzimuthAngle: -0.9,
    };
    expect(expandCommercialMapControlAngles(desired, 0.8, -Math.PI).minAzimuthAngle).toBe(-Math.PI);
    expect(expandCommercialMapControlAngles(desired, 0.8, Math.PI).maxAzimuthAngle).toBe(Math.PI);
  });

  it('libera o voo comum antes de capturar a pose inicial do retorno lunar', () => {
    const canvas = readFileSync('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx', 'utf8');
    const returnStart = canvas.indexOf('!lunarLaunchReturning');
    const returnEnd = canvas.indexOf('const signature = [', returnStart);
    const returnEffect = canvas.slice(returnStart, returnEnd);
    const cancellation = returnEffect.indexOf('cancelCameraTransition(false)');

    expect(returnStart).toBeGreaterThan(-1);
    expect(cancellation).toBeGreaterThan(-1);
    expect(cancellation).toBeLessThan(returnEffect.indexOf('path.returnPosition.copy(camera.position)'));
    expect(cancellation).toBeLessThan(returnEffect.indexOf('lockLunarCamera()'));
    expect(returnEffect).toContain('cancelCameraTransition,');
    const cancelStart = canvas.indexOf('const cancelCameraTransition = useCallback');
    const cancelEnd = canvas.indexOf('const interruptTransition', cancelStart);
    const cancelEffect = canvas.slice(cancelStart, cancelEnd);
    expect(cancelEffect).toContain('transition.active = false');
    expect(cancelEffect).toContain('setTransitionControlsLocked(false)');
  });
});
