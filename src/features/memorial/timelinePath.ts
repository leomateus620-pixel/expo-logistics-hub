export interface TimelinePoint { x: number; y: number }
/** Markers are measured from the actual rendered layout; faces and labels stay outside the path. */
export function timelinePath(points: TimelinePoint[], width: number, columns: number, shortFinalSegment = false) {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], next = points[i];
    if (columns === 1 || Math.abs(next.y - previous.y) < 3 || (shortFinalSegment && i === points.length - 1)) {
      path += ` L ${next.x} ${next.y}`;
    } else {
      const right = previous.x > width / 2;
      const edge = right ? width - 4 : 4;
      const radius = Math.min(30, Math.abs(next.y - previous.y) / 3);
      const direction = right ? 1 : -1;
      path += ` H ${edge - direction * radius} Q ${edge} ${previous.y} ${edge} ${previous.y + radius}`;
      path += ` V ${next.y - radius} Q ${edge} ${next.y} ${edge - direction * radius} ${next.y} H ${next.x}`;
    }
  }
  return path;
}
