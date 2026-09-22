import { describe, expect, it } from 'vitest';
import { VisitFrameScheduler } from '@/features/commercial-map/visit/VisitFrameScheduler';

describe('agenda de frames da visita', () => {
  it('cessa invalidações após estabilizar e continua dormindo em frames de outros sistemas', () => {
    const scheduler = new VisitFrameScheduler();
    for (let frame = 0; frame < 90; frame++) expect(scheduler.step(1 / 60, false)).toBe(true);
    for (let frame = 0; frame < 90; frame++) scheduler.step(1 / 60, false);
    for (let frame = 0; frame < 600; frame++) expect(scheduler.step(1 / 60, false)).toBe(false);
  });

  it('input contínuo mantém movimento e o repouso permite a câmera completar damping', () => {
    const scheduler = new VisitFrameScheduler();
    for (let frame = 0; frame < 600; frame++) expect(scheduler.step(1 / 60, true)).toBe(true);
    for (let frame = 0; frame < 90; frame++) expect(scheduler.step(1 / 60, false)).toBe(true);
    for (let frame = 0; frame < 90; frame++) scheduler.step(1 / 60, false);
    expect(scheduler.step(1 / 60, false)).toBe(false);
  });

  it('input, troca de câmera e novos dados despertam após repouso sem consumir delta de background', () => {
    const scheduler = new VisitFrameScheduler();
    for (let frame = 0; frame < 180; frame++) scheduler.step(1 / 60, false);
    expect(scheduler.step(60, true)).toBe(true);
    for (let frame = 0; frame < 180; frame++) scheduler.step(1 / 60, false);
    scheduler.wake();
    expect(scheduler.step(60, false)).toBe(true);
    expect(scheduler.step(-100, false)).toBe(true);
  });
});
