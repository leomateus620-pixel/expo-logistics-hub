import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapPresentation } from '@/features/commercial-map/components/canvas/CommercialMapPresentation';
import { useCommercialMapPresentationVisible } from '@/features/commercial-map/components/canvas/CommercialMapPresentationContext';
import { COMMERCIAL_MAP_ANIMATION, COMMERCIAL_MAP_PRESENTATION_EVENT, commercialMapFrameActivity,
  isCommercialMapPresentationVisible, requestCommercialMapAnimationFrame } from '@/features/commercial-map/utils/frameActivity';

const runtime = vi.hoisted(() => {
  const internal = { frames: 0 };
  return {
    gl: { domElement: document.createElement('canvas') },
    clock: { elapsedTime: 0 },
    internal,
    get: () => ({ internal }),
    setEvents: vi.fn(), invalidate: vi.fn(), frame: null as null | ((state: { frameloop: string }) => void),
  };
});
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime) => unknown) => selector(runtime),
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = callback; },
}));

function PresentationConsumer() {
  const visible = useCommercialMapPresentationVisible();
  return <output>{visible ? 'visible' : 'covered'}</output>;
}

describe('suspensão da apresentação coberta do mapa', () => {
  beforeEach(() => {
    runtime.clock.elapsedTime = 0;
    runtime.internal.frames = 2;
    runtime.invalidate.mockClear(); runtime.setEvents.mockClear();
  });
  afterEach(cleanup);

  it('interrompe picking e pedidos decorativos, retomando o mesmo renderer', () => {
    const view = render(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    expect(screen.getByText('visible')).toBeInTheDocument();
    requestCommercialMapAnimationFrame(runtime.gl, runtime.invalidate, COMMERCIAL_MAP_ANIMATION.rain);
    expect(commercialMapFrameActivity(runtime.gl).requested).toBe(COMMERCIAL_MAP_ANIMATION.rain);
    view.rerender(<CommercialMapPresentation visible={false}><PresentationConsumer /></CommercialMapPresentation>);
    runtime.invalidate.mockClear();
    expect(screen.getByText('covered')).toBeInTheDocument();
    expect(runtime.setEvents).toHaveBeenLastCalledWith({ enabled: false });
    requestCommercialMapAnimationFrame(runtime.gl, runtime.invalidate, COMMERCIAL_MAP_ANIMATION.rain);
    requestCommercialMapAnimationFrame(runtime.gl, runtime.invalidate, COMMERCIAL_MAP_ANIMATION.rides);
    expect(runtime.invalidate).not.toHaveBeenCalled();
    expect(commercialMapFrameActivity(runtime.gl).requested).toBe(0);
    expect(isCommercialMapPresentationVisible(runtime.gl)).toBe(false);
    view.rerender(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    expect(runtime.setEvents).toHaveBeenLastCalledWith({ enabled: true });
    expect(runtime.invalidate).toHaveBeenCalledOnce();
    requestCommercialMapAnimationFrame(runtime.gl, runtime.invalidate, COMMERCIAL_MAP_ANIMATION.environment);
    expect(runtime.invalidate).toHaveBeenCalledTimes(2);
  });

  it('preserva a fase do relógio quando R3F reinicia o frameloop e publica a pausa da câmera', () => {
    const listener = vi.fn();
    runtime.gl.domElement.addEventListener(COMMERCIAL_MAP_PRESENTATION_EVENT, listener);
    const view = render(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    act(() => { runtime.clock.elapsedTime = 24.5; runtime.frame?.({ frameloop: 'demand' }); });
    act(() => { runtime.clock.elapsedTime = 99999; runtime.frame?.({ frameloop: 'never' }); });
    expect(runtime.clock.elapsedTime).toBe(24.5); // No manual-timestamp phase jump.
    runtime.clock.elapsedTime = 0; // R3F setFrameloop('never').
    view.rerender(<CommercialMapPresentation visible={false}><PresentationConsumer /></CommercialMapPresentation>);
    expect(runtime.clock.elapsedTime).toBe(24.5);
    expect(runtime.internal.frames).toBe(0);
    runtime.clock.elapsedTime = 0; // R3F setFrameloop('demand').
    view.rerender(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    expect(runtime.clock.elapsedTime).toBe(24.5);
    expect(runtime.gl.domElement.dataset.commercialMapPresentationVisible).toBe('true');
    expect(listener).toHaveBeenCalledTimes(3);
    runtime.gl.domElement.removeEventListener(COMMERCIAL_MAP_PRESENTATION_EVENT, listener);
  });

  it('mantém os listeners de recuperação ativos enquanto a apresentação está coberta', () => {
    const lost = vi.fn(), restored = vi.fn();
    runtime.gl.domElement.addEventListener('webglcontextlost', lost);
    runtime.gl.domElement.addEventListener('webglcontextrestored', restored);
    const view = render(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    view.rerender(<CommercialMapPresentation visible={false}><PresentationConsumer /></CommercialMapPresentation>);
    runtime.invalidate.mockClear();
    runtime.gl.domElement.dispatchEvent(new Event('webglcontextlost'));
    runtime.gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
    expect(lost).toHaveBeenCalledOnce(); expect(restored).toHaveBeenCalledOnce();
    expect(isCommercialMapPresentationVisible(runtime.gl)).toBe(false);
    expect(runtime.invalidate).not.toHaveBeenCalled();
    view.rerender(<CommercialMapPresentation visible><PresentationConsumer /></CommercialMapPresentation>);
    expect(runtime.invalidate).toHaveBeenCalledOnce();
    runtime.gl.domElement.removeEventListener('webglcontextlost', lost);
    runtime.gl.domElement.removeEventListener('webglcontextrestored', restored);
  });
});
