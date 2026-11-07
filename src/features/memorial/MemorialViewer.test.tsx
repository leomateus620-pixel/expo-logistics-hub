import { fireEvent, render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { historicalEditions } from './catalog';
import MemorialViewer from './MemorialViewer';
const mock = vi.hoisted(() => ({ fail: undefined as (()=>void)|undefined, dispose: vi.fn(), pose: vi.fn() }));
vi.mock('./scene/PlateRenderer', () => ({ PlateRenderer: class {
  constructor(_canvas: unknown, _piece: unknown, ready: ()=>void, fail: ()=>void) { mock.fail=fail; this.ready=ready; }
  ready: ()=>void;
  async initialize() { this.ready(); }
  setPose = mock.pose;
  resize() {}
  dispose = mock.dispose;
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Inspection resource lifetime and fallback', () => {
  it('keeps zoom/pan working after context loss and owns a single renderer per active piece', async () => {
    const result=render(<MemorialViewer piece={historicalEditions[0]} />);
    await waitFor(()=>expect(document.querySelector('.memorial-viewer')).toHaveAttribute('data-viewer-state','ready'));
    fireEvent.click(screen.getByRole('button',{name:'Aproximar quadro'}));
    expect(mock.pose.mock.lastCall?.[0].scale).toBe(1.25);
    act(() => mock.fail?.());
    await screen.findByText(/Vista 2D/);
    expect(mock.dispose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'Aproximar quadro'}));
    const stage=screen.getByRole('group',{name:'Inspeção de 1ª FENASOJA'});
    expect(JSON.parse(stage.getAttribute('data-pose')!).scale).toBe(1.5625);
    fireEvent.keyDown(stage,{key:'ArrowRight'});
    expect(JSON.parse(stage.getAttribute('data-pose')!).x).toBeLessThan(0);
    fireEvent.click(screen.getByRole('button',{name:'Restaurar vista'}));
    expect(JSON.parse(stage.getAttribute('data-pose')!)).toEqual({scale:1,x:0,y:0,yaw:0,pitch:0});
    fireEvent.click(screen.getByRole('button',{name:'Tentar 3D'}));
    await waitFor(()=>expect(document.querySelector('.memorial-viewer')).toHaveAttribute('data-viewer-state','ready'));
    result.unmount();expect(mock.dispose).toHaveBeenCalledTimes(2);
  });
});
