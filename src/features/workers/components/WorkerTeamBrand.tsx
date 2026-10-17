import { cn } from '@/lib/utils';
import { useRef, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMascotActive } from '../mascot/useMascotLife';

let botMotionPaused = false;
const motionListeners = new Set<() => void>();
const subscribeMotion = (listener: () => void) => { motionListeners.add(listener); return () => { motionListeners.delete(listener); }; };
const motionSnapshot = () => botMotionPaused;
export function WorkerBotMotionToggle() {
  const paused = useSyncExternalStore(subscribeMotion, motionSnapshot, motionSnapshot);
  const label = paused ? 'Animar o mascote do bot' : 'Pausar animação do mascote';
  return <button type="button" className="worker-bot-motion-toggle" title={label} aria-label={label} aria-pressed={!paused}
    onClick={() => { botMotionPaused = !botMotionPaused; motionListeners.forEach(listener => listener()); }}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>;
}

export interface WorkerTeamMarkProps {
  size?: 24 | 32 | 40 | number;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
}

/** Bot-only character requested by the user. The underlying official asset stays intact;
 * eyes and limbs belong to this separate application mascot, not the institutional logo. */
export function WorkerTeamMark({
  size = 32,
  className,
  decorative = true,
  ariaLabel = 'BOT FENASOJA',
}: WorkerTeamMarkProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const paused = useSyncExternalStore(subscribeMotion, motionSnapshot, motionSnapshot);
  // This exception is explicitly requested for the bot; all other motion retains
  // the system preference. Visibility, animation budget and manual pause still apply.
  const active = useMascotActive(ref, paused, true);
  return <span ref={ref} className={cn('worker-team-brand__mark worker-bot-mark', className)}
    style={{ width: size, height: size }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : ariaLabel}
    aria-hidden={decorative || undefined} data-animated={active}>
    <span className="worker-bot-mark__body">
      <img className="worker-bot-mark__open" src="/bot-fenasoja/mascot-open.webp" alt="" aria-hidden="true" draggable={false} decoding="async" />
      <img className="worker-bot-mark__blink" src="/bot-fenasoja/mascot-blink.webp" alt="" aria-hidden="true" draggable={false} decoding="async" />
    </span>
  </span>;
}

export interface WorkerTeamBrandProps {
  size?: WorkerTeamMarkProps['size'];
  className?: string;
  showWordmark?: boolean;
  tone?: 'light' | 'dark' | 'inherit';
  subtitle?: string;
}

export function WorkerTeamBrand({
  size = 32,
  className,
  showWordmark = true,
  tone = 'inherit',
  subtitle = 'Especialistas da nossa feira',
}: WorkerTeamBrandProps) {
  return <span
    role="img"
    aria-label={`BOT FENASOJA, ${subtitle}`}
    className={cn(
      'worker-team-brand',
      tone === 'light' && 'worker-team-brand--light',
      tone === 'dark' && 'worker-team-brand--dark',
      className,
    )}
  >
    <WorkerTeamMark size={size} />
    {showWordmark && <span className="worker-team-brand__copy">
      <span className="worker-team-brand__name">BOT FENASOJA</span>
      <span className="worker-team-brand__subtitle">{subtitle}</span>
    </span>}
  </span>;
}
