import { memo, type CSSProperties } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFenasojaCycleProgress } from '@/hooks/useFenasojaCountdown';
import {
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE_LABEL,
} from '@/lib/fenasoja-countdown';

/** Compact 2026—2028 preparation indicator for the executive command bar. */
export const CronogramaPreparationPill = memo(function CronogramaPreparationPill() {
  const cycleProgress = useFenasojaCycleProgress();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cronograma-command-chip cronograma-command-chip--preparation focus-ring"
          aria-label={`Preparação 2026—2028: ${cycleProgress}% concluído`}
        >
          <span
            className="cronograma-command-ring"
            style={{ '--ring-progress': `${cycleProgress}%` } as CSSProperties}
            aria-hidden="true"
          >
            <strong>{cycleProgress}</strong>
          </span>
          <span className="cronograma-command-chip__label" aria-hidden="true">
            <small>Preparação</small>
            <b>2026—2028</b>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="cronograma-command-popover">
        <header className="cronograma-command-popover__head">
          <div className="min-w-0">
            <p className="cronograma-command-popover__eyebrow">Ciclo oficial</p>
            <h3 className="cronograma-command-popover__title">Preparação 2026—2028</h3>
          </div>
          <strong className="cronograma-command-popover__metric">{cycleProgress}%</strong>
        </header>

        <div
          className="cronograma-command-meter"
          role="progressbar"
          aria-label="Progresso temporal da preparação para a Fenasoja 2028"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cycleProgress}
        >
          <span style={{ '--preparation-progress': cycleProgress / 100 } as CSSProperties} />
        </div>

        <p className="cronograma-command-popover__text">
          Abertura oficial em <strong>{FENASOJA_2028_OPENING_LABEL}</strong> · {FENASOJA_2028_TIME_ZONE_LABEL}
        </p>
      </PopoverContent>
    </Popover>
  );
});
