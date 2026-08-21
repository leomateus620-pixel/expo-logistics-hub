import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PersonAvatar } from '../../PersonAvatar';

/** Contador que só anima quando o valor realmente muda. */
export function AnimatedNumber({ value, suffix }: { value: number | null; suffix?: string }) {
  const [display, setDisplay] = useState(value ?? 0);
  const previous = useRef(value ?? 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return;
    const from = previous.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = 420;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    previous.current = value;
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  if (value === null) return <>—</>;
  return (
    <>
      {display.toLocaleString('pt-BR')}
      {suffix}
    </>
  );
}

export function KpiMetric({
  value,
  suffix,
  title,
  context,
}: {
  value: number | null;
  suffix?: string;
  title: string;
  context: ReactNode;
}) {
  return (
    <div className="agenda-kpi-metric">
      <strong><AnimatedNumber value={value} suffix={suffix} /></strong>
      <span className="agenda-kpi-title">{title}</span>
      <span className="agenda-kpi-context">{context}</span>
    </div>
  );
}

export function KpiRankTitle({ children }: { children: ReactNode }) {
  return <span className="agenda-kpi-rank-title">{children}</span>;
}

export function KpiEmpty({ children }: { children: ReactNode }) {
  return <p className="agenda-kpi-empty">{children}</p>;
}

export function RankBar({
  position,
  label,
  count,
  ratio,
  onClick,
}: {
  position: number;
  label: string;
  count: number;
  ratio: number;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="agenda-kpi-rank-row" onClick={onClick} disabled={!onClick}>
      <span className="agenda-kpi-rank-pos">{position}</span>
      <span className="agenda-kpi-rank-body">
        <span className="agenda-kpi-rank-label" title={label}>{label}</span>
        <span className="agenda-kpi-rank-track">
          <span className="agenda-kpi-rank-fill" style={{ transform: `scaleX(${Math.max(0.06, ratio)})` }} />
        </span>
      </span>
      <span className="agenda-kpi-rank-count">{count}</span>
    </button>
  );
}

export function PersonChip({
  name,
  userId,
  meta,
  onClick,
}: {
  name: string;
  userId?: string | null;
  meta: ReactNode;
  onClick?: () => void;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR'))
    .join('');

  return (
    <button type="button" className="agenda-kpi-person" onClick={onClick} disabled={!onClick}>
      <PersonAvatar
        name={name}
        userId={userId}
        size="xs"
        fallback={<span className="agenda-kpi-person-initials" aria-hidden="true">{initials}</span>}
      />
      <span className="agenda-kpi-person-body">
        <span className="agenda-kpi-person-name" title={name}>{name}</span>
        <span className="agenda-kpi-person-meta">{meta}</span>
      </span>
    </button>
  );
}
