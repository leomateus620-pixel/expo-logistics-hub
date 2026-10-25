import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSoyHarvestContextLoss } from '@/features/commercial-map/harvest/registerSoyHarvestContextLoss';
import { advanceSoyHarvestClock, setSoyHarvestStartGuard, soyFieldFrame, soyHarvestClock, useSoyHarvestStore } from '@/features/commercial-map/harvest/useSoyHarvestStore';

beforeEach(() => {
  setSoyHarvestStartGuard(null);
  useSoyHarvestStore.getState().restoreField();
  useSoyHarvestStore.getState().finishRestore();
});
afterEach(() => vi.restoreAllMocks());

describe('local cycle context-loss ownership', () => {
  it('stops the clock and releases the cycle without cancelling map recovery events', () => {
    const canvas = document.createElement('canvas');
    const remove = registerSoyHarvestContextLoss(canvas);
    const actions = useSoyHarvestStore.getState();
    actions.requestStart(); actions.ready(useSoyHarvestStore.getState().session);
    advanceSoyHarvestClock(1000); advanceSoyHarvestClock(5000);
    expect(soyHarvestClock.elapsed).toBe(4);
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(useSoyHarvestStore.getState()).toMatchObject({status:'error', enabled:false, fieldState:'green'});
    expect(soyFieldFrame.mode).toBe('green');
    expect(event.defaultPrevented).toBe(false);
    advanceSoyHarvestClock(60000);
    expect(soyHarvestClock.elapsed).toBe(0);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(useSoyHarvestStore.getState().status).toBe('error');
    remove();
  });

  it('removes its listener on unmount and cannot fail a later session', () => {
    const canvas = document.createElement('canvas');
    const remove = registerSoyHarvestContextLoss(canvas);
    remove();
    useSoyHarvestStore.getState().requestStart();
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(useSoyHarvestStore.getState().status).toBe('loading');
    useSoyHarvestStore.getState().cancel(); useSoyHarvestStore.getState().finishRestore();
  });
});
