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
 * FENASOJA-specific meeting mark: a soybean contour protects a microphone
 * capsule while the lateral strokes describe captured speech. It deliberately
 * avoids the generic sparkle/robot visual vocabulary used by many AI products.
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
        d="M25.55 5.2c-4.1-2.6-10.42-1.58-14.88 2.88-4.47 4.47-5.5 10.8-2.9 14.9 1.1 1.73 2.78 3.05 4.75 3.73 4.08 1.42 9.07.08 12.3-3.15 3.24-3.24 4.57-8.23 3.16-12.31-.68-1.97-2-3.65-3.73-4.75Z"
      />
      <path
        className="agenda-meeting-mark__vein"
        d="M9.15 23.58c3.12-2.35 5.8-5.08 8.02-8.18 1.45-2.02 2.65-4.14 3.6-6.36"
      />
      <rect
        className="agenda-meeting-mark__mic"
        height="8.8"
        rx="2.75"
        width="5.5"
        x="13.25"
        y="10.25"
      />
      <path className="agenda-meeting-mark__stand" d="M11.35 16.6v.75a4.65 4.65 0 0 0 9.3 0v-.75M16 22v2.25" />
      <path className="agenda-meeting-mark__wave agenda-meeting-mark__wave--left" d="M9.35 13.2v3.55" />
      <path className="agenda-meeting-mark__wave agenda-meeting-mark__wave--right" d="M22.65 12.1v5.75" />
    </svg>
  );
}
