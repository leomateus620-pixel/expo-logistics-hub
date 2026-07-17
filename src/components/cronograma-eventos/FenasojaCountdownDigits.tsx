import { memo } from 'react';
import type { FenasojaCountdownSnapshot } from '@/lib/fenasoja-countdown';
import '@/styles/fenasoja-countdown.css';

type CountdownUnitName = 'days' | 'hours' | 'minutes' | 'seconds';

const countdownUnits: Array<{
  key: CountdownUnitName;
  compactLabel: string;
  fullLabel: string;
}> = [
  { key: 'days', compactLabel: 'dias', fullLabel: 'dias' },
  { key: 'hours', compactLabel: 'horas', fullLabel: 'horas' },
  { key: 'minutes', compactLabel: 'min', fullLabel: 'minutos' },
  { key: 'seconds', compactLabel: 'seg', fullLabel: 'segundos' },
];

const CountdownUnit = memo(function CountdownUnit({
  value,
  label,
  unit,
}: {
  value: number;
  label: string;
  unit: CountdownUnitName;
}) {
  const formatted = String(value).padStart(unit === 'days' ? 3 : 2, '0');

  return (
    <span className="fenasoja-countdown-unit" data-unit={unit} data-value={formatted}>
      <span className="fenasoja-countdown-value" aria-hidden="true">
        <span className="fenasoja-countdown-value-motion" key={formatted}>
          <span className="fenasoja-countdown-value-glyph">{formatted}</span>
        </span>
      </span>
      <span className="fenasoja-countdown-unit-label">{label}</span>
    </span>
  );
});

export const FenasojaCountdownDigits = memo(function FenasojaCountdownDigits({
  snapshot,
  accessibleLabel,
  variant = 'compact',
}: {
  snapshot: FenasojaCountdownSnapshot;
  accessibleLabel: string;
  variant?: 'compact' | 'immersive';
}) {
  return (
    <div
      className="fenasoja-countdown-grid"
      data-variant={variant}
      role="timer"
      aria-live="off"
      aria-label={accessibleLabel}
    >
      {countdownUnits.map(({ key, compactLabel, fullLabel }) => (
        <CountdownUnit
          key={key}
          value={snapshot[key]}
          label={variant === 'immersive' ? fullLabel : compactLabel}
          unit={key}
        />
      ))}
    </div>
  );
});
