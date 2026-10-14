import { describe, expect, it } from 'vitest';
import { getGalleryLayout } from './galleryLayout';
import { getGalleryCopies, getGalleryTrackKeyframes, reverseChronologicalGroup } from './galleryAnimation';

describe('compact continuous gallery geometry', () => {
  it('reserves 112px desktop and 88px compact headers without an extra image row', () => {
    expect(getGalleryLayout(1_440)).toEqual({ mobile: false, headerHeight: 112, artHeight: 72, slotWidth: 96, gap: 20, stepPx: 116, speedPxPerSecond: 16 });
    const mobile = getGalleryLayout(390);
    expect(mobile).toMatchObject({ mobile: true, headerHeight: 88, artHeight: 32, gap: 12, speedPxPerSecond: 12 });
    expect(mobile.slotWidth).toBeCloseTo(42.6666667);
    expect(mobile.stepPx).toBeCloseTo(54.6666667);
  });

  it('uses coarse-pointer compact geometry even in a wide landscape container', () => {
    expect(getGalleryLayout(900, undefined, true)).toMatchObject({ headerHeight: 88, artHeight: 32, gap: 12, speedPxPerSecond: 12 });
    expect(getGalleryLayout(900, undefined, false).artHeight).toBe(72);
  });

  it('fits artwork in the actual host height without inventing larger cards', () => {
    expect(getGalleryLayout(1_440, 60)).toMatchObject({ headerHeight: 112, artHeight: 44 });
    expect(getGalleryLayout(390, 40)).toMatchObject({ headerHeight: 88, artHeight: 24 });
    expect(getGalleryLayout(1_440, 240).artHeight).toBe(72);
    expect(getGalleryLayout(390, 240).artHeight).toBe(32);
  });

  it('uses only a positive translation of exactly one group length', () => {
    const frames = getGalleryTrackKeyframes(696, 116);
    expect(frames).toEqual([
      { transform: 'translate3d(-1276px, 0, 0)' },
      { transform: 'translate3d(-580px, 0, 0)' },
    ]);
  });

  it('reverses physical DOM order while chronological arrivals stay forward', () => {
    const chronological = ['1998', '2004', '2008', '2014', '2018', '2026'];
    const physical = reverseChronologicalGroup(chronological);
    expect(physical).toEqual(['2026', '2018', '2014', '2008', '2004', '1998']);
    expect(chronological[0]).toBe('1998');
    const step = 116;
    const group = chronological.length * step;
    const start = -2 * group + step;
    const arrivals = chronological.map((_, stride) => {
      const offset = start + stride * step;
      const physicalIndex = Math.round(-offset / step);
      return physical[physicalIndex % physical.length];
    });
    expect(arrivals).toEqual(chronological);
  });

  it.each([320, 390, 844, 1_366, 1_440, 1_920])('covers a %ipx viewport and has identical content at both loop ends', (width) => {
    const ids = ['1998', '2004', '2008', '2014', '2018', '2026'];
    const physical = reverseChronologicalGroup(ids);
    const step = 116;
    const group = ids.length * step;
    const copies = getGalleryCopies(width, group, step);
    expect(copies).toBe(Math.max(3, Math.ceil((width - step) / group) + 2));
    const visible = (offset: number) => Array.from({ length: physical.length * copies }, (_, index) => ({
      id: physical[index % physical.length], left: index * step + offset,
    })).filter(({ left }) => left + 96 > 0 && left < width);
    expect(visible(-2 * group + step)).toEqual(visible(-group + step));
    expect(copies * group - 2 * group + step).toBeGreaterThanOrEqual(width);
  });

  it('handles a single surviving image and no valid images', () => {
    expect(getGalleryCopies(1_920, 116, 116)).toBe(18);
    expect(getGalleryCopies(1_920, 0, 116)).toBe(0);
  });
});
