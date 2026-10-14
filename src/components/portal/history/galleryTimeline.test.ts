import { describe, expect, it, vi } from 'vitest';
import {
  createGalleryTimeline, GALLERY_SESSION_KEY, getGalleryDuration, readGallerySession,
  type GalleryConfiguration, type GallerySnapshot,
} from './galleryTimeline';

const ARTS = ['1998', '2004', '2008', '2014', '2018', '2026'];
const DESKTOP: GalleryConfiguration = { artIds: ARTS, stepPx: 116, speedPxPerSecond: 16 };
const STRIDE_MS = 7_250;

function fixture(configuration = DESKTOP) {
  let time = 0;
  let nextTimer = 1;
  const timers = new Map<number, { callback: () => void; at: number }>();
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  const snapshots: GallerySnapshot[] = [];
  const clock = {
    now: () => time,
    setTimer: (callback: () => void, delay: number) => {
      const id = nextTimer++;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimer: (id: number) => { timers.delete(id); },
  };
  const create = (next = configuration) => createGalleryTimeline({
    ...clock, ...next, storage, onChange: (snapshot) => snapshots.push(snapshot),
  });
  const advance = (duration: number) => {
    const end = time + duration;
    let count = 0;
    while (true) {
      const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0];
      if (!next || next[1].at > end) break;
      if (++count > 1_000) throw new Error('unexpected per-frame or zero-delay timer');
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  };
  return { timeline: create(), create, storage, values, timers, snapshots, advance };
}

const animation = () => ({ currentTime: 0, play: vi.fn(), pause: vi.fn(), cancel: vi.fn() } as unknown as Animation);

describe('continuous portal history clock', () => {
  it('runs indefinitely and advances chronological arrivals once per stride', () => {
    const { timeline, advance, snapshots, timers } = fixture();
    expect(getGalleryDuration(6, 116, 16)).toBe(43_500);
    timeline.start();
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'running', anchorId: '1998', positionUnits: 0, offsetPx: -1_276 });
    const arrivals = ['1998'];
    for (let index = 1; index <= 12; index += 1) {
      advance(STRIDE_MS - 1);
      expect(timeline.getSnapshot().anchorId).toBe(ARTS[(index - 1) % ARTS.length]);
      advance(1);
      arrivals.push(timeline.getSnapshot().anchorId as string);
      expect(timers.size).toBe(1);
      expect(timeline.getSnapshot().running).toBe(true);
    }
    expect(arrivals).toEqual([...ARTS, ...ARTS, '1998']);
    expect(snapshots).toHaveLength(13);
    expect(timeline.getSnapshot().phase).toBe('running');
  });

  it('does not mark a session or schedule while waiting for root visibility/intro release', () => {
    const { timeline, storage, advance, timers } = fixture();
    advance(50_000);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'waiting', positionUnits: 0, running: false });
    timeline.dispose();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
  });

  it('pauses and resumes exactly the remaining fraction without elapsed background time', () => {
    const { timeline, advance, storage, timers } = fixture();
    const track = animation();
    timeline.attachAnimation(track);
    timeline.resume();
    advance(STRIDE_MS * 1.25);
    timeline.pause();
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'paused', anchorId: '2004', positionUnits: 1.25, anchorLeftPx: 29 });
    expect(track.currentTime).toBe(9_062.5);
    expect(readGallerySession(storage)?.positionUnits).toBe(1.25);
    expect(timers.size).toBe(0);
    advance(90_000);
    expect(timeline.getSnapshot().positionUnits).toBe(1.25);
    timeline.resume();
    advance(STRIDE_MS * .75);
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2008', positionUnits: 2 });
  });

  it('persists a user pause across navigation and never bypasses root gates when unpaused', () => {
    const { timeline, create, advance, storage, timers } = fixture();
    timeline.resume();
    advance(STRIDE_MS * 2.5);
    timeline.setUserPaused(true);
    expect(readGallerySession(storage)).toMatchObject({ version: 2, anchorId: '2008', positionUnits: 2.5, userPaused: true });
    timeline.dispose();
    advance(50_000);
    const restored = create();
    restored.resume();
    expect(restored.getSnapshot()).toMatchObject({ phase: 'paused', userPaused: true, positionUnits: 2.5, running: false });
    restored.setUserPaused(false);
    expect(restored.getSnapshot().running).toBe(false);
    expect(timers.size).toBe(0);
    restored.resume();
    advance(STRIDE_MS / 2);
    expect(restored.getSnapshot()).toMatchObject({ anchorId: '2014', positionUnits: 3, running: true });
  });

  it('persists an explicit unpause before the first start so navigation cannot restore a stale pause', () => {
    const { timeline, create, storage, timers } = fixture();
    timeline.setUserPaused(true);
    expect(readGallerySession(storage)?.userPaused).toBe(true);
    timeline.setUserPaused(false);
    expect(readGallerySession(storage)?.userPaused).toBe(false);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'waiting', positionUnits: 0, running: false });
    expect(timers.size).toBe(0);
    timeline.dispose();
    const restored = create();
    expect(restored.getSnapshot()).toMatchObject({ userPaused: false, positionUnits: 0, running: false });
    restored.resume();
    expect(restored.getSnapshot()).toMatchObject({ phase: 'running', userPaused: false, positionUnits: 0 });
    expect(timers.size).toBe(1);
  });

  it('restores the anchor and fraction across StrictMode cleanup without duplicate timers', () => {
    const { timeline, create, advance, timers } = fixture();
    timeline.start();
    timeline.start();
    expect(timers.size).toBe(1);
    advance(STRIDE_MS * 3.125);
    timeline.dispose();
    timeline.dispose();
    expect(timers.size).toBe(0);
    const restored = create();
    expect(restored.getSnapshot()).toMatchObject({ anchorId: '2014', positionUnits: 3.125, running: false });
    restored.resume();
    restored.resume();
    expect(timers.size).toBe(1);
    advance(STRIDE_MS * .875);
    expect(restored.getSnapshot().anchorId).toBe('2018');
  });

  it('retains the stable ID and fractional position across measured pixel/velocity changes', () => {
    const { timeline, advance, timers } = fixture();
    timeline.start();
    advance(STRIDE_MS * 1.375);
    timeline.reconfigure({ artIds: ARTS, stepPx: 164 / 3, speedPxPerSecond: 12 });
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2004', positionUnits: 1.375, running: true });
    expect(timeline.getSnapshot().anchorLeftPx).toBeCloseTo(20.5);
    expect(timeline.getSnapshot().durationMs).toBeCloseTo(27_333.3333333);
    expect(timers.size).toBe(1);
    advance((164 / 3) / 12 * 1_000 * .625);
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2008', positionUnits: 2 });
  });

  it('maps a retained active identity instead of its former index after a failed artwork', () => {
    const { timeline, advance } = fixture();
    timeline.start();
    advance(STRIDE_MS * 3.25);
    timeline.reconfigure({ ...DESKTOP, artIds: ARTS.filter((id) => id !== '2004') });
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2014', anchorIndex: 2, positionUnits: 2.25, anchorLeftPx: 29 });
    expect(timeline.getSnapshot().durationMs).toBe(36_250);
  });

  it('uses the next chronological surviving ID if the anchor itself fails', () => {
    const { timeline, advance } = fixture();
    timeline.start();
    advance(STRIDE_MS * 3.25);
    timeline.reconfigure({ ...DESKTOP, artIds: ['1998', '2004', '2018', '2026'] });
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2018', positionUnits: 2.25, anchorLeftPx: 29 });
  });

  it('ignores completed legacy v1 sessions and resumes a fresh continuous cycle', () => {
    const { values, create, storage } = fixture();
    values.set('fenasoja.portal.visual-history.v1', JSON.stringify({ version: 1, artIds: ARTS, elapsedMs: 7_800, status: 'done' }));
    expect(readGallerySession(storage)).toBeNull();
    const fresh = create();
    fresh.resume();
    expect(fresh.getSnapshot()).toMatchObject({ phase: 'running', anchorId: '1998', positionUnits: 0 });
  });

  it('keeps waiting/empty fallbacks clean and can recover after runtime asset failure', () => {
    const empty = fixture({ ...DESKTOP, artIds: [] });
    empty.timeline.start();
    empty.timeline.dispose();
    expect(empty.storage.setItem).not.toHaveBeenCalled();
    expect(empty.timeline.getSnapshot().phase).toBe('empty');
    const { timeline, advance, storage } = fixture();
    timeline.resume();
    advance(STRIDE_MS * 2.25);
    timeline.reconfigure({ ...DESKTOP, artIds: [] });
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'empty', running: false });
    expect(readGallerySession(storage)?.anchorId).toBe('2008');
    timeline.reconfigure(DESKTOP);
    timeline.resume();
    expect(timeline.getSnapshot()).toMatchObject({ anchorId: '2008', positionUnits: 2.25, running: true });
  });

  it('aligns replacement track animations and cancels all resources on dispose', () => {
    const { timeline, advance, timers } = fixture();
    const first = animation();
    timeline.attachAnimation(first);
    expect(first.pause).toHaveBeenCalled();
    timeline.resume();
    advance(STRIDE_MS * .75);
    const second = animation();
    timeline.attachAnimation(second);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(second.currentTime).toBe(STRIDE_MS * .75);
    expect(second.play).toHaveBeenCalledOnce();
    timeline.dispose();
    expect(second.cancel).toHaveBeenCalledOnce();
    expect(timers.size).toBe(0);
    timeline.resume();
    timeline.reconfigure({ ...DESKTOP, stepPx: 150 });
    expect(timers.size).toBe(0);
    const late = animation();
    timeline.attachAnimation(late);
    expect(late.cancel).toHaveBeenCalledOnce();
  });

  it('rejects malformed v2 data without blocking portal access', () => {
    const { values, storage } = fixture();
    for (const malformed of [
      { version: 1, artIds: ARTS, positionUnits: 0, anchorId: '1998', userPaused: false },
      { version: 2, artIds: [], positionUnits: 0, anchorId: '', userPaused: false },
      { version: 2, artIds: ARTS, positionUnits: -1, anchorId: '1998', userPaused: false },
      { version: 2, artIds: ARTS, positionUnits: 0, anchorId: 'unknown', userPaused: false },
    ]) {
      values.set(GALLERY_SESSION_KEY, JSON.stringify(malformed));
      expect(readGallerySession(storage)).toBeNull();
    }
    values.set(GALLERY_SESSION_KEY, '{');
    expect(readGallerySession(storage)).toBeNull();
  });
});
