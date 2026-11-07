import { describe, expect, it, vi } from 'vitest';
import { SurfaceControls } from './SurfaceControls';

describe('Scoped gesture listeners', () => {
  it('normalizes wheel units, prevents native scroll only on its surface and removes every listener', () => {
    const surface=document.createElement('div'), change=vi.fn(), zoom=vi.fn();
    document.body.append(surface);
    const controls=new SurfaceControls(surface,change,zoom);
    const event=new WheelEvent('wheel',{deltaY:-3,deltaMode:1,cancelable:true});
    surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
    expect(zoom.mock.calls[0][0]).toBeCloseTo(Math.exp(.12));
    const outside=new WheelEvent('wheel',{deltaY:10,cancelable:true});
    document.body.dispatchEvent(outside);expect(outside.defaultPrevented).toBe(false);
    controls.gesture.down({id:1,x:10,y:10}); window.dispatchEvent(new Event('blur'));
    expect(controls.gesture.points.size).toBe(0);
    controls.dispose();
    const after=new WheelEvent('wheel',{deltaY:10,cancelable:true});surface.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);expect(zoom).toHaveBeenCalledTimes(1);
    surface.remove();
  });
});
