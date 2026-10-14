import { GALLERY_REVEAL_MS, GALLERY_HIGHLIGHT_MS, getGalleryDuration } from './galleryTimeline';

/** One bounded WAAPI animation per slot. All keyframes share the gallery clock. */
export function artworkKeyframes(index: number, count: number): Keyframe[] {
  const duration = getGalleryDuration(count);
  const start = GALLERY_REVEAL_MS + index * GALLERY_HIGHLIGHT_MS;
  const end = start + GALLERY_HIGHLIGHT_MS;
  const closing = GALLERY_REVEAL_MS + count * GALLERY_HIGHLIGHT_MS;
  const frame = (time: number, opacity: number, transform: string): Keyframe => ({
    offset: time / duration, opacity, transform, easing: 'ease-in-out',
  });
  return [
    frame(0, 0, 'translateY(7px) scale(1)'),
    frame(160, 0, 'translateY(7px) scale(1)'),
    frame(GALLERY_REVEAL_MS, .86, 'translateY(0) scale(1)'),
    frame(start, .86, 'translateY(0) scale(1)'),
    frame(start + 200, 1, 'translateY(-2px) scale(1.08)'),
    frame(end - 250, 1, 'translateY(-2px) scale(1.08)'),
    frame(end, .86, 'translateY(0) scale(1)'),
    frame(closing, .86, 'translateY(0) scale(1)'),
    frame(closing + 600, 0, 'translateY(4px) scale(.98)'),
    frame(duration, 0, 'translateY(4px) scale(.98)'),
  ];
}

export function highlightKeyframes(index: number, count: number): Keyframe[] {
  const duration = getGalleryDuration(count);
  const start = GALLERY_REVEAL_MS + index * GALLERY_HIGHLIGHT_MS;
  return [
    { offset: 0, opacity: 0 },
    { offset: start / duration, opacity: 0 },
    { offset: (start + 200) / duration, opacity: 1 },
    { offset: (start + GALLERY_HIGHLIGHT_MS - 250) / duration, opacity: 1 },
    { offset: (start + GALLERY_HIGHLIGHT_MS) / duration, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}
