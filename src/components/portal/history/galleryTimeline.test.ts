import { describe, expect, it, vi } from 'vitest';
import {
  createGalleryTimeline,
  GALLERY_SESSION_KEY,
  getGalleryDuration,
  readGallerySession,
  type GallerySnapshot,
} from './galleryTimeline';

const DESKTOP_ARTS = ['2014', '2016', '2018', '2024'];
const MOBILE_ARTS = ['2016', '2024'];

function fixture(artIds = DESKTOP_ARTS) {
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
  const create = (ids = artIds) => createGalleryTimeline({
    ...clock,
    artIds: ids,
    storage,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  const advance = (duration: number) => {
    const end = time + duration;
    while (true) {
      const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = end;
  };
  return { timeline: create(), create, storage, values, timers, snapshots, advance };
}

describe('portal visual history timeline', () => {
  it('reserves exactly 600 + N × 1400 + 1600 milliseconds', () => {
    expect(getGalleryDuration(4)).toBe(7_800);
    expect(getGalleryDuration(2)).toBe(5_000);
    expect(getGalleryDuration(1)).toBe(3_600);
    expect(getGalleryDuration(0)).toBe(0);
    const { timeline, advance, snapshots, timers } = fixture();
    timeline.start();
    expect(timeline.getSnapshot().phase).toBe('reveal');
    expect(timers.size).toBe(1);
    advance(599);
    expect(timeline.getSnapshot().phase).toBe('reveal');
    advance(1);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 0, phaseElapsedMs: 0 });

    for (let index = 0; index < 4; index += 1) {
      advance(1_399);
      expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: index, phaseElapsedMs: 1_399 });
      advance(1);
      expect(timers.size).toBe(1);
    }
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'closing', elapsedMs: 6_200 });
    advance(1_599);
    expect(timeline.getSnapshot().phase).toBe('closing');
    advance(1);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'done', running: false, elapsedMs: 7_800 });
    expect(timers.size).toBe(0);
    expect(snapshots.map(({ phase, activeIndex }) => [phase, activeIndex])).toEqual([
      ['reveal', -1], ['highlight', 0], ['highlight', 1], ['highlight', 2],
      ['highlight', 3], ['closing', -1], ['done', -1],
    ]);
    // Artwork positions remain present across highlights; only the closing
    // phase instructs the visual layer to remove the accumulated gallery.
    expect(snapshots.filter(({ phase }) => phase === 'highlight').every(({ artIds }) => artIds.length === 4)).toBe(true);
  });

  it('does not consume the session while waiting for visibility or Alvorada release', () => {
    const { timeline, storage, advance, timers } = fixture();
    advance(20_000);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'waiting', elapsedMs: 0, running: false });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
    timeline.dispose();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('pauses the remaining highlight time without unloading accumulated stages', () => {
    const { timeline, storage, advance, timers } = fixture();
    timeline.start();
    advance(600 + 1_400 + 450);
    timeline.pause();
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 1, phaseElapsedMs: 450, running: false });
    expect(readGallerySession(storage)?.elapsedMs).toBe(2_450);
    expect(timers.size).toBe(0);
    advance(120_000);
    expect(timeline.getSnapshot().elapsedMs).toBe(2_450);
    timeline.resume();
    advance(949);
    expect(timeline.getSnapshot().activeIndex).toBe(1);
    advance(1);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 2, phaseElapsedMs: 0 });
  });

  it('persists an interrupted order and elapsed time across route changes and StrictMode cleanup', () => {
    const { timeline, create, advance, timers } = fixture();
    timeline.start();
    timeline.start();
    expect(timers.size).toBe(1);
    advance(3_125);
    timeline.dispose();
    timeline.dispose();
    expect(timers.size).toBe(0);
    advance(50_000);
    const restored = create([...DESKTOP_ARTS].reverse());
    expect(restored.getSnapshot()).toMatchObject({
      phase: 'highlight', activeIndex: 1, phaseElapsedMs: 1_125, elapsedMs: 3_125,
      artIds: DESKTOP_ARTS, running: false,
    });
    restored.resume();
    advance(275);
    expect(restored.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 2, phaseElapsedMs: 0 });
  });

  it('keeps a completed session static on subsequent visits', () => {
    const { timeline, create, advance, storage, timers } = fixture(MOBILE_ARTS);
    timeline.start();
    advance(5_000);
    timeline.dispose();
    expect(readGallerySession(storage)?.status).toBe('done');
    const restored = create();
    restored.start();
    restored.resume();
    restored.reconfigure(DESKTOP_ARTS);
    expect(restored.getSnapshot()).toMatchObject({ phase: 'done', running: false });
    expect(timers.size).toBe(0);
  });

  it('omits failed assets and adjusts the total without inserting empty windows', () => {
    const { timeline, create, advance } = fixture();
    timeline.start();
    advance(2_200);
    timeline.dispose();
    const restored = create(['2014', '2018', '2024']);
    expect(restored.getSnapshot()).toMatchObject({
      phase: 'highlight', activeIndex: 1, phaseElapsedMs: 0,
      artIds: ['2014', '2018', '2024'], durationMs: 6_400,
    });
    restored.resume();
    advance(6_400 - 2_000);
    expect(restored.getSnapshot().phase).toBe('done');
  });

  it('uses the standard brand immediately when all artwork fails', () => {
    const { timeline, storage, timers } = fixture([]);
    timeline.start();
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'done', durationMs: 0, running: false });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
  });

  it('completes a started session after all runtime assets fail without replaying it on return', () => {
    const { timeline, create, storage, advance, timers } = fixture();
    timeline.start();
    advance(1_000);
    timeline.reconfigure([]);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'done', running: false, artIds: [], durationMs: 0 });
    expect(readGallerySession(storage)).toEqual({ version: 1, status: 'done', artIds: [], elapsedMs: 0 });
    expect(timers.size).toBe(0);
    timeline.dispose();
    const restored = create(DESKTOP_ARTS);
    restored.start();
    expect(restored.getSnapshot()).toMatchObject({ phase: 'done', running: false });
    expect(timers.size).toBe(0);
  });

  it('does not save an empty fallback when no cycle has started', () => {
    const { timeline, storage } = fixture();
    timeline.reconfigure([]);
    timeline.start();
    timeline.dispose();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(readGallerySession(storage)).toBeNull();
  });

  it('preserves the current 1.4 second window when narrowing to mobile', () => {
    const { timeline, advance, storage, timers } = fixture();
    timeline.start();
    advance(2_375);
    timeline.reconfigure(MOBILE_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({
      phase: 'highlight', activeIndex: 0, phaseElapsedMs: 375,
      artIds: MOBILE_ARTS, elapsedMs: 975, durationMs: 5_000, running: true,
    });
    expect(readGallerySession(storage)?.artIds).toEqual(MOBILE_ARTS);
    expect(timers.size).toBe(1);
    advance(1_025);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 1, phaseElapsedMs: 0 });
  });

  it('continues to the next visible art if the active slot disappears after resize', () => {
    const { timeline, advance } = fixture();
    timeline.start();
    advance(1_000);
    timeline.reconfigure(MOBILE_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 0, phaseElapsedMs: 0, elapsedMs: 600 });
    advance(1_400);
    timeline.reconfigure(DESKTOP_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'highlight', activeIndex: 3, phaseElapsedMs: 0 });
    advance(1_400);
    timeline.reconfigure(MOBILE_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'closing', phaseElapsedMs: 0 });
  });

  it('does not restart waiting/reveal or an in-progress closing on resize', () => {
    const { timeline, advance, storage } = fixture();
    timeline.reconfigure(MOBILE_ARTS);
    expect(timeline.getSnapshot().phase).toBe('waiting');
    expect(storage.setItem).not.toHaveBeenCalled();
    timeline.start();
    advance(250);
    timeline.reconfigure(DESKTOP_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'reveal', phaseElapsedMs: 250 });
    advance(6_200 - 250 + 900);
    timeline.reconfigure(MOBILE_ARTS);
    expect(timeline.getSnapshot()).toMatchObject({ phase: 'closing', phaseElapsedMs: 900, durationMs: 5_000 });
    advance(700);
    expect(timeline.getSnapshot().phase).toBe('done');
  });

  it('ignores malformed persisted sessions and tolerates denied storage', () => {
    const { values, storage, create } = fixture();
    values.set(GALLERY_SESSION_KEY, JSON.stringify({ version: 1, status: 'playing', artIds: [], elapsedMs: -3 }));
    expect(readGallerySession(storage)).toBeNull();
    expect(create().getSnapshot().phase).toBe('waiting');
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const inaccessible = createGalleryTimeline({ artIds: MOBILE_ARTS, storage: denied, onChange: () => undefined });
    expect(() => inaccessible.start()).not.toThrow();
    expect(() => inaccessible.dispose()).not.toThrow();
  });
});
