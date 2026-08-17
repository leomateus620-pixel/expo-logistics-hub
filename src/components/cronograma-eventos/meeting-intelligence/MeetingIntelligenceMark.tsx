import { cn } from '@/lib/utils';

export type MeetingIntelligenceMarkState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'blocked';

interface MeetingIntelligenceMarkProps {
  className?: string;
  state?: MeetingIntelligenceMarkState;
}

/**
 * FENASOJA meeting mark: a single-weight soybean contour holding a microphone
 * capsule. Deliberately plain — no sparkles, no gradients, no decorative veins —
 * so it stays legible at 20-30px inside dense agenda surfaces.
 */
export function MeetingIntelligenceMark({
  className,
  state = 'idle',
}: MeetingIntelligenceMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn('agenda-meeting-mark', className)}
      data-state={state}
      focusable="false"
      viewBox="0 0 32 32"
    >
      <path
        className="agenda-meeting-mark__seed"
        d="M24.4 7.6c3.4 3.4 3.4 9.4 0 12.8-3.4 3.4-9.4 3.4-12.8 0-3.4-3.4-3.4-9.4 0-12.8 3.4-3.4 9.4-3.4 12.8 0Z"
        transform="translate(-2 2)"
      />
      <rect
        className="agenda-meeting-mark__mic"
        height="8"
        rx="2.5"
        width="5"
        x="13.5"
        y="10"
      />
      <path className="agenda-meeting-mark__stand" d="M11.6 16.2v.6a4.4 4.4 0 0 0 8.8 0v-.6" />
      <path className="agenda-meeting-mark__stand" d="M16 21.2v2.4" />
      <path className="agenda-meeting-mark__wave agenda-meeting-mark__wave--left" d="M8.9 13.4v3.2" />
      <path className="agenda-meeting-mark__wave agenda-meeting-mark__wave--right" d="M23.1 13.4v3.2" />
    </svg>
  );
}
