import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommercialMapPrewarm, browserPrewarmEnvironment, type CommercialMapPrewarmEnvironment, type CommercialMapPrewarmTasks } from '@/features/commercial-map/utils/commercialMapPrewarm';

const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function harness() {
  const jobs: { run: () => void; cancelled: boolean; urgent: boolean }[] = [];
  let visible = true, constrained = false, authorized = true;
  let notify = () => {};
  const unsubscribe = vi.fn();
  const environment: CommercialMapPrewarmEnvironment = {
    visible: () => visible, constrained: () => constrained,
    schedule: (run, urgent) => { const job = { run, urgent, cancelled: false }; jobs.push(job); return () => { job.cancelled = true; }; },
    subscribeVisible: callback => { notify = callback; return unsubscribe; },
  };
  const tasks: CommercialMapPrewarmTasks = { modules: vi.fn(async () => {}), data: vi.fn(async () => {}), cpu: vi.fn(async () => {}), assets: vi.fn(async () => {}) };
  const record = vi.fn();
  const scheduler = createCommercialMapPrewarm({ authorized: () => authorized, tasks, environment, record });
  return { tasks, record, scheduler, jobs, unsubscribe,
    setVisible(value: boolean) { visible = value; notify(); },
    setConstrained(value: boolean) { constrained = value; },
    revoke() { authorized = false; },
    async next() { const job = jobs.find(item => !item.cancelled); if (!job) throw new Error('No admitted job'); job.cancelled = true; job.run(); await settle(); },
  };
}

describe('authorized staged map prewarm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('admits one stage at a time, reuses repeated intent, and never creates a WebGL context', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const h = harness();
    h.scheduler.schedule(); h.scheduler.schedule();
    expect(h.jobs).toHaveLength(1);
    expect(h.tasks.modules).not.toHaveBeenCalled();
    for (let index = 0; index < 4; index++) await h.next();
    h.scheduler.schedule(); h.scheduler.promote();
    for (const task of Object.values(h.tasks)) expect(task).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls.filter(([name]) => name === 'complete')).toHaveLength(1);
    expect(Object.values(h.scheduler.snapshot().stages)).toEqual(['complete', 'complete', 'complete', 'complete']);
    expect(context).not.toHaveBeenCalled();
    h.scheduler.dispose();
  });

  it('waits while hidden or constrained, then explicit intent promotes the queued job once', async () => {
    const h = harness(); h.setVisible(false); h.scheduler.schedule(); h.scheduler.promote();
    expect(h.jobs).toHaveLength(0);
    h.setVisible(true); expect(h.jobs[0].urgent).toBe(true);
    h.scheduler.promote();
    expect(h.jobs.filter(job => !job.cancelled)).toHaveLength(1);
    await h.next(); expect(h.tasks.modules).toHaveBeenCalledTimes(1); h.scheduler.dispose();
    const constrained = harness(); constrained.setConstrained(true); constrained.scheduler.schedule();
    expect(constrained.jobs).toHaveLength(0);
    constrained.scheduler.promote(); expect(constrained.jobs[0].urgent).toBe(true); constrained.scheduler.dispose();
  });

  it('checks authorization again before a scheduled job and cancels queued work on disposal', async () => {
    const h = harness(); h.scheduler.schedule(); h.revoke(); await h.next();
    expect(h.tasks.modules).not.toHaveBeenCalled(); h.scheduler.promote();
    expect(h.jobs).toHaveLength(1);
    const queued = harness(); queued.scheduler.schedule(); queued.scheduler.dispose(); queued.scheduler.dispose();
    expect(queued.jobs[0].cancelled).toBe(true); expect(queued.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('aborts a revoked running operation but lets an explicit route handoff finish its shared operation', async () => {
    for (const handoff of [false, true]) {
      const h = harness(); let release!: () => void; let signal!: AbortSignal;
      h.tasks.modules = vi.fn((_record, received) => { signal = received; return new Promise<void>(resolve => { release = resolve; }); });
      h.scheduler.schedule(); await h.next();
      if (handoff) h.scheduler.handoff();
      h.scheduler.dispose({ abortRunning: !handoff });
      expect(signal.aborted).toBe(!handoff); release(); await settle();
      expect(h.tasks.data).not.toHaveBeenCalled();
    }
  });

  it('stops failed speculation and permits one explicit retry without redoing successful stages', async () => {
    const h = harness(); h.tasks.data = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    h.scheduler.schedule(); await h.next(); await h.next();
    expect(h.scheduler.snapshot().stages.data).toBe('failed');
    h.scheduler.schedule(); expect(h.jobs.filter(job => !job.cancelled)).toHaveLength(0);
    h.scheduler.promote(); await h.next(); await h.next(); await h.next();
    expect(h.tasks.modules).toHaveBeenCalledTimes(1); expect(h.tasks.data).toHaveBeenCalledTimes(2);
    expect(h.scheduler.snapshot().stages.assets).toBe('complete'); h.scheduler.dispose();
  });

  it('honors save-data and slow connection constraints without user-agent heuristics', () => {
    for (const connection of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
      expect(browserPrewarmEnvironment().constrained()).toBe(true);
    }
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '4g', saveData: false } });
    expect(browserPrewarmEnvironment().constrained()).toBe(false);
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
  });
});
