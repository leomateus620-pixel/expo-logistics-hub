import { memo, useState, type CSSProperties } from 'react';
import { SOY_SUMMIT, SOY_SUMMIT_DATE_LABEL, SOY_SUMMIT_IDENTITY } from '@/config/soy-summit';
import { useEventCountdown, formatEventCountdown } from '@/lib/event-clock';
import '@/styles/soy-summit-identity.css';

export const SoySummitCountdown = memo(function SoySummitCountdown({ compact = false }: { compact?: boolean }) {
  const value = useEventCountdown(SOY_SUMMIT.startsAt);
  const [highlight, setHighlight] = useState<string | null>(null);
  return <div className="soy-countdown" data-compact={compact || undefined} style={{
    '--soy-green': SOY_SUMMIT_IDENTITY.green, '--soy-cream': SOY_SUMMIT_IDENTITY.cream,
    '--soy-gold': SOY_SUMMIT_IDENTITY.gold, '--soy-gold-light': SOY_SUMMIT_IDENTITY.goldLight,
    '--soy-gold-dark': SOY_SUMMIT_IDENTITY.goldDark, '--soy-card-shadow': SOY_SUMMIT_IDENTITY.cardShadow,
  } as CSSProperties}>
    <img className="soy-countdown__brand" src="/soy-summit/brand.webp" alt="Fenasoja" width="224" height="54" />
    <h2>{SOY_SUMMIT.title}</h2>
    <p className="soy-countdown__date">{SOY_SUMMIT_DATE_LABEL}<span className="sr-only">, horário de São Paulo</span></p>
    {value.phase === 'invalid' ? <p>Não foi possível calcular a contagem.</p> : <div className="soy-countdown__digits" role="timer" aria-live="off" aria-label={formatEventCountdown(value)}>
      {(['days', 'hours', 'minutes', 'seconds'] as const).map((key, index) => <button type="button" className="soy-time-card" key={key}
        aria-label={`Destacar ${['dias', 'horas', 'minutos', 'segundos'][index]}: ${value[key]}`} aria-pressed={highlight === key}
        onClick={() => setHighlight(current => current === key ? null : key)}>
        <strong data-soy-unit={key}>{String(value[key]).padStart(key === 'days' && value.phase === 'countdown' ? 3 : 2, '0')}</strong>
        <span>{['dias', 'horas', 'minutos', 'segundos'][index]}</span>
      </button>)}
    </div>}
    <p className="soy-countdown__status">{value.phase === 'started' ? 'O Soy Summit 2027 começou' : '\u00a0'}</p>
  </div>;
});
