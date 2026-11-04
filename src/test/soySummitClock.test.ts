import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateEventCountdown, createEventClock } from '@/lib/event-clock';
import { SOY_SUMMIT, SOY_SUMMIT_DATE_LABEL } from '@/config/soy-summit';

const target = Date.parse(SOY_SUMMIT.startsAtUTC);
afterEach(() => { vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks(); });

describe('Soy Summit official instant', () => {
  it('preserves the same instant and event-zone date on every device', () => {
    expect(Date.parse(SOY_SUMMIT.startsAt)).toBe(target);
    expect(SOY_SUMMIT_DATE_LABEL).toBe('20 de abril de 2027 • 07h30');
    for (const iso of ['2027-04-19T10:30:00Z', '2027-04-19T19:30:00+09:00', '2027-04-19T03:30:00-07:00']) {
      expect(calculateEventCountdown(SOY_SUMMIT.startsAt, Date.parse(iso))).toEqual({days:1,hours:0,minutes:0,seconds:0,phase:'countdown'});
    }
  });
  it.each([[-1000,1,'countdown'],[-1,1,'countdown'],[0,0,'started'],[1,0,'started'],[86400000,0,'started']] as const)('handles boundary %d ms', (delta, seconds, phase) => {
    expect(calculateEventCountdown(SOY_SUMMIT.startsAt, target + delta)).toEqual({days:0,hours:0,minutes:0,seconds,phase});
  });
  it('derives full days and remainder units with one ceiling rule', () => {
    expect(calculateEventCountdown(SOY_SUMMIT.startsAt, target - (123*86400+3*3600+4*60+5)*1000+500)).toEqual({days:123,hours:3,minutes:4,seconds:5,phase:'countdown'});
    expect(calculateEventCountdown('invalid', target).phase).toBe('invalid');
  });
});

describe('shared event clock lifecycle', () => {
  it('shares a single timer, reconciles after suspension and releases all subscriptions', async () => {
    vi.useFakeTimers();vi.setSystemTime(target - 86400000);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const clock = createEventClock(), first = vi.fn(), second = vi.fn();
    const off1 = clock.subscribe(first), off2 = clock.subscribe(second);
    await vi.advanceTimersByTimeAsync(1100);
    expect(clock.diagnostics().subscribers).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(target - 1000);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.getSnapshot()).toBe(target - 1000);
    expect(first).toHaveBeenCalled();expect(second).toHaveBeenCalled();
    off1();off2();await Promise.resolve();
    expect(clock.diagnostics().subscribers).toBe(0);expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects cached time headers, retaining device time without per-second network calls', async () => {
    vi.useFakeTimers();vi.setSystemTime(target - 10000);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,headers:new Headers({Date:new Date(target).toUTCString(),Age:'30'})}));
    const clock=createEventClock();const off=clock.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(3000);
    expect(clock.diagnostics().source).toBe('device');expect(fetch).toHaveBeenCalledTimes(1);off();
  });
});
