/** Positive track movement brings chronological campaigns in from the left. */
export function reverseChronologicalGroup<T>(chronological: readonly T[]): T[] {
  return [...chronological].reverse();
}

export function getGalleryTrackKeyframes(groupLengthPx: number, stepPx: number): Keyframe[] {
  return [
    { transform: `translate3d(${-2 * groupLengthPx + stepPx}px, 0, 0)` },
    { transform: `translate3d(${-groupLengthPx + stepPx}px, 0, 0)` },
  ];
}

/** Both ends show an identical group; extra copies cover a wide viewport. */
export function getGalleryCopies(containerWidth: number, groupLengthPx: number, stepPx: number): number {
  if (groupLengthPx <= 0) return 0;
  return Math.max(3, Math.ceil((Math.max(0, containerWidth) - stepPx) / groupLengthPx) + 2);
}
