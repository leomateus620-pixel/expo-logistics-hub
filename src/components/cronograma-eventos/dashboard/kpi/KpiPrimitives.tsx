import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PersonAvatar } from '../../PersonAvatar';

/** Contador que só anima quando o valor realmente muda. */
export function AnimatedNumber({ value }: { value: number | null }) {
  const [display, setDisplay] = useState(value ?? 0);
  const previous = useRef(value ?? 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return;
    const from = previous.current;
    previous.current = value;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = 460;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  if (value === null) return <>—</>;
  return <>{display.toLocaleString('pt-BR')}</>;
}

/**
 * Métrica editorial: numeral dominante, sufixo com menos peso, título e
 * contexto em níveis tipográficos distintos.
 */
export function KpiMetric({
  value,
  suffix,
  title,
  context,
  ratio,
}: {
  value: number | null;
  suffix?: string;
  title: string;
  context: ReactNode;
  /** Quando informado, renderiza a barra fina de progresso (0–1). */
  ratio?: number;
}) {
  return (
    <div className="agenda-kpi-metric">
      <p className="agenda-kpi-figure">
        <span className="agenda-kpi-figure-value">
          <AnimatedNumber value={value} />
        </span>
        {suffix ? <span className="agenda-kpi-figure-suffix">{suffix}</span> : null}
      </p>
      <p className="agenda-kpi-metric-title">{title}</p>
      <p className="agenda-kpi-metric-context">{context}</p>
      {ratio !== undefined ? (
        <span className="agenda-kpi-progress-track" aria-hidden="true">
          <span
            className="agenda-kpi-progress-fill"
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, ratio))})` }}
          />
        </span>
      ) : null}
    </div>
  );
}

/** Cabeçalho das telas de ranking: rótulo + contextualizador discreto. */
export function KpiSectionTitle({ label, context }: { label: string; context?: string }) {
  return (
    <p className="agenda-kpi-section-title">
      <span className="agenda-kpi-section-label">{label}</span>
      {context ? <span className="agenda-kpi-section-context">{context}</span> : null}
    </p>
  );
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
    <button
      type="button"
      className="agenda-kpi-rank-row"
      data-lead={position === 1 || undefined}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="agenda-kpi-rank-pos">{String(position).padStart(2, '0')}</span>
      <span className="agenda-kpi-rank-body">
        <span className="agenda-kpi-rank-label" title={label}>{label}</span>
        <span className="agenda-kpi-rank-track">
          <span className="agenda-kpi-rank-fill" style={{ transform: `scaleX(${Math.max(0.05, ratio)})` }} />
        </span>
      </span>
      <span className="agenda-kpi-rank-count">{count}</span>
    </button>
  );
}

function Portrait({ name, userId }: { name: string; userId?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR'))
    .join('');

  return (
    <span className="agenda-kpi-portrait" aria-hidden="true">
      <PersonAvatar
        name={name}
        userId={userId}
        size="xs"
        fallback={<span className="agenda-kpi-portrait-initials">{initials}</span>}
      />
    </span>
  );
}

/** Linha do ranking de pessoas: retrato, nome e quantidade dominante. */
export function PersonRankRow({
  name,
  userId,
  count,
  ratio,
  onClick,
}: {
  name: string;
  userId?: string | null;
  count: number;
  ratio: number;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="agenda-kpi-person-row" onClick={onClick} disabled={!onClick}>
      <Portrait name={name} userId={userId} />
      <span className="agenda-kpi-person-body">
        <span className="agenda-kpi-person-name" title={name}>{name}</span>
        <span className="agenda-kpi-person-track">
          <span className="agenda-kpi-person-fill" style={{ transform: `scaleX(${Math.max(0.06, ratio)})` }} />
        </span>
      </span>
      <span className="agenda-kpi-person-count">
        <span className="agenda-kpi-person-count-value">{count}</span>
        <span className="agenda-kpi-person-count-label">eventos</span>
      </span>
    </button>
  );
}

/** Próximo evento de uma pessoa do ranking. */
export function PersonNextRow({
  name,
  userId,
  when,
  title,
  onClick,
}: {
  name: string;
  userId?: string | null;
  when: string | null;
  title: string | null;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="agenda-kpi-next-row" onClick={onClick} disabled={!onClick}>
      <Portrait name={name} userId={userId} />
      <span className="agenda-kpi-next-body">
        <span className="agenda-kpi-next-head">
          <span className="agenda-kpi-next-name" title={name}>{name}</span>
          {when ? <span className="agenda-kpi-next-when">{when}</span> : null}
        </span>
        <span className="agenda-kpi-next-title" title={title ?? undefined}>
          {title ?? 'Sem próximo evento'}
        </span>
      </span>
    </button>
  );
}
