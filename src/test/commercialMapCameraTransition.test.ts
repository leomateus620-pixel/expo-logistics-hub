import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix4, PerspectiveCamera, Quaternion, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import {
  expandCommercialMapControlAngles,
  prepareOrbitControlsForTransitionHandoff,
  registerCommercialMapNavigationCancellation,
  stabilizeCameraTransitionUp,
  stopCommercialMapOrbitMotion,
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

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
  }
}

describe('recuperação de navegação interrompida', () => {
  const disposers: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });
  afterEach(() => {
    disposers.splice(0).reverse().forEach((dispose) => dispose());
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createControls() {
    const element = document.createElement('div');
    const canvas = document.createElement('canvas');
    element.append(canvas);
    document.body.append(element);
    Object.defineProperties(element, {
      clientHeight: { value: 300 },
      clientWidth: { value: 400 },
    });
    element.releasePointerCapture = vi.fn();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 20, 30);
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = true;
    controls.update();
    disposers.push(() => controls.dispose());
    return { element, canvas, camera, controls };
  }

  function pointer(target: EventTarget, type: string, pointerId: number, init: PointerEventInit = {}) {
    target.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', clientX: pointerId * 20, clientY: 20, bubbles: true, ...init,
    }));
  }

  it('encerra todos os dedos pelo OrbitControls real no blur e permite o próximo gesto', () => {
    const { element, canvas, camera, controls } = createControls();
    const onCancel = vi.fn();
    const onStart = vi.fn();
    const cancelled: number[] = [];
    controls.addEventListener('start', onStart);
    element.addEventListener('pointercancel', (event) => cancelled.push(event.pointerId));
    disposers.push(registerCommercialMapNavigationCancellation({ canvas, controlsElement: element, onCancel }));
    pointer(canvas, 'pointerdown', 1);
    pointer(canvas, 'pointerdown', 2);
    const position = camera.position.clone();
    const target = controls.target.clone();

    window.dispatchEvent(new Event('blur'));

    expect(cancelled).toEqual([1, 2]);
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('blur');
    expect(camera.position.equals(position)).toBe(true);
    expect(controls.target.equals(target)).toBe(true);
    onStart.mockClear();
    pointer(canvas, 'pointerdown', 3);
    expect(onStart).toHaveBeenCalledTimes(1);
    pointer(document, 'pointerup', 3);
    expect(element.style.touchAction).toBe('none');
  });

  it('cancela um pinch inteiro sem reentrância ao receber pointercancel nativo', () => {
    const { element, canvas } = createControls();
    const onCancel = vi.fn();
    disposers.push(registerCommercialMapNavigationCancellation({ canvas, controlsElement: element, onCancel }));
    pointer(canvas, 'pointerdown', 1);
    pointer(canvas, 'pointerdown', 2);
    pointer(canvas, 'pointercancel', 1);
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('pointercancel');
    // No stale pointer remains to cancel when the browser subsequently blurs.
    const onPointerCancel = vi.fn();
    element.addEventListener('pointercancel', onPointerCancel);
    window.dispatchEvent(new Event('blur'));
    expect(onPointerCancel).not.toHaveBeenCalled();
  });

  it('só cancela ao ocultar a aba e também libera a navegação na perda de contexto', () => {
    const { element, canvas } = createControls();
    const onCancel = vi.fn();
    disposers.push(registerCommercialMapNavigationCancellation({ canvas, controlsElement: element, onCancel }));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onCancel).not.toHaveBeenCalled();
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onCancel).toHaveBeenLastCalledWith('hidden');
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(onCancel).toHaveBeenLastCalledWith('context-lost');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('remove listeners de forma idempotente antes de registrar a próxima instância', () => {
    const { element, canvas } = createControls();
    const oldCancel = vi.fn();
    const dispose = registerCommercialMapNavigationCancellation({ canvas, controlsElement: element, onCancel: oldCancel });
    dispose();
    dispose();
    const onCancel = vi.fn();
    disposers.push(registerCommercialMapNavigationCancellation({ canvas, controlsElement: element, onCancel }));
    window.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(oldCancel).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('drena damping sem mover câmera ou alvo e sem movimento residual nos próximos frames', () => {
    const { canvas, camera, controls } = createControls();
    pointer(canvas, 'pointerdown', 1, { pointerType: 'mouse', button: 0, clientX: 20 });
    pointer(document, 'pointermove', 1, { pointerType: 'mouse', button: 0, clientX: 120 });
    pointer(document, 'pointerup', 1, { pointerType: 'mouse', button: 0, clientX: 120 });
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const target = controls.target.clone();
    stopCommercialMapOrbitMotion(camera, controls);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(quaternion)).toBe(true);
    expect(controls.target.equals(target)).toBe(true);
    expect(controls.enableDamping).toBe(true);
    expect(controls.autoRotate).toBe(false);
    for (let frame = 0; frame < 4; frame += 1) controls.update();
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-7);
    expect(controls.target.distanceTo(target)).toBeLessThan(1e-9);
  });

  it('preserva locks lunares e estado comercial enquanto libera somente navegação transitória', () => {
    const canvas = readFileSync('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx', 'utf8');
    const start = canvas.indexOf('const cancelTransientNavigation = useCallback');
    const end = canvas.indexOf('const captureLunarCamera', start);
    const recovery = canvas.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(recovery.indexOf('if (lunarCameraLockedRef.current) return')).toBeLessThan(recovery.indexOf('cancelCameraTransition(true)'));
    expect(recovery).toContain('stopCommercialMapOrbitMotion(camera, controls)');
    expect(recovery).toContain('setTransitionControlsLocked(false)');
    expect(recovery).toContain('setCameraNavigating(false)');
    expect(recovery).toContain('controlsRef.current?.domElement ?? gl.domElement');
    expect(recovery).not.toMatch(/setSelected|setInterior|setHydrological|queuePreset|camera\.position\.set\(/);
  });
});
