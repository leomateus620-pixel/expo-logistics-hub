import { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkerViewport } from '../useWorkerViewport';

let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
function Surface({ compact = false, enabled = true }: { compact?: boolean; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useWorkerViewport(ref, enabled, compact ? '.worker-copilot-sheet' : '.workers-root--chat', !compact);
  return <div data-testid="owner" className={compact ? 'worker-copilot-sheet' : 'workers-root--chat'}><div data-testid="inner" ref={ref}><textarea aria-label="Pergunta" /></div></div>;
}
const resize = (height: number, offsetTop = 0, scale = 1) => act(() => {
  Object.assign(viewport, { height, offsetTop, scale });
  viewport.dispatchEvent(new Event('resize'));
});
beforeEach(() => {
  viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 844);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Uma única geometria para página e copiloto', () => {
  it.each([false, true])('mede teclado, pan do Safari e fechamento no contêiner externo (compact=%s)', compact => {
    const { getByTestId, getByRole } = render(<Surface compact={compact} />);
    const owner = getByTestId('owner'); const inner = getByTestId('inner');
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('844px');
    expect(inner.style.getPropertyValue('--worker-visible-height')).toBe('');
    act(() => getByRole('textbox').focus({ preventScroll: true }));
    resize(360, 115);
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('360px');
    expect(owner.style.getPropertyValue('--worker-viewport-top')).toBe('115px');
    expect(owner.dataset.workerKeyboard).toBe('open');
    // Several scroll events must never subtract the offset again from the height.
    act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('360px');
    resize(844);
    expect(owner.style.getPropertyValue('--worker-viewport-top')).toBe('0px');
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('844px');
    expect(owner.dataset.workerKeyboard).toBe('closed');
  });

  it('mantém magnificação manual e volta à geometria normal ao terminar o gesto', () => {
    const { getByTestId } = render(<Surface />); const owner = getByTestId('owner');
    resize(422, 200, 2);
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('844px');
    expect(owner.style.getPropertyValue('--worker-viewport-top')).toBe('0px');
    resize(430);
    expect(owner.style.getPropertyValue('--worker-visible-height')).toBe('430px');
  });

  it('restaura estilos do documento e remove listeners ao sair sem competir com o lock do Sheet', () => {
    document.body.style.overflow = 'clip';
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const { unmount } = render(<Surface />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    document.body.style.overflow = '';
    const sheet = render(<Surface compact />);
    expect(document.body.style.overflow).toBe('');
    sheet.unmount();
  });
});
