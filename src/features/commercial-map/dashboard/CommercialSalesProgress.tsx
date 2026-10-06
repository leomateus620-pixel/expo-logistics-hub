import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { DashboardAggregate } from './commercialDashboardTypes';
import { commercialSalesProgress } from './commercialSalesProgressMetrics';
import { formatDashboardCurrency, formatDashboardPercentage } from './commercialDashboardFormatters';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { LegendConfirmedKey, LegendOpenKey, PauseGlyph, PlayGlyph } from './CommercialDashboardOverviewIcons';

/** Visual-only widths of the two segments; never business data. */
export interface SalesProgressFill { confirmed: number; open: number }

const OPENING_BASE_MS = 820;
const OPENING_SPAN_MS = 620;
const ADJUST_MS = 650;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function paintFill(course: HTMLElement, fill: SalesProgressFill) {
  const tip = fill.confirmed + fill.open;
  course.style.setProperty('--overview-fill-tip', `${tip}%`);
  course.style.setProperty('--overview-fill-split', tip > 0 ? String(fill.confirmed / tip) : '1');
}

/**
 * Fills from zero when the Dashboard opens and eases from the current visual
 * point when the real percentages change. Frames write CSS variables on the
 * course element only; rerenders with the same data never restart the motion.
 */
function useSalesProgressFill(target: SalesProgressFill, available: boolean, memory?: MutableRefObject<SalesProgressFill | null>) {
  const courseRef = useRef<HTMLDivElement>(null);
  const shown = useRef<SalesProgressFill>(memory?.current ?? { confirmed: 0, open: 0 });
  const { confirmed, open } = target;

  useLayoutEffect(() => {
    if (courseRef.current) paintFill(courseRef.current, shown.current);
  }, []);

  useEffect(() => {
    const course = courseRef.current;
    if (!course) return undefined;
    const record = (fill: SalesProgressFill) => {
      shown.current = fill;
      if (memory) memory.current = fill;
      paintFill(course, fill);
    };
    const goal = available ? { confirmed, open } : { confirmed: 0, open: 0 };
    const from = shown.current;
    if (!available || typeof window.requestAnimationFrame !== 'function'
      || (from.confirmed === goal.confirmed && from.open === goal.open)) {
      record(goal);
      course.dataset.phase = 'settled';
      return undefined;
    }
    const opening = from.confirmed + from.open === 0;
    const duration = opening ? OPENING_BASE_MS + OPENING_SPAN_MS * (goal.confirmed + goal.open) / 100 : ADJUST_MS;
    let frame = 0;
    let start: number | null = null;
    course.dataset.phase = 'filling';
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      const k = easeOutCubic(progress);
      record({
        confirmed: from.confirmed + (goal.confirmed - from.confirmed) * k,
        open: from.open + (goal.open - from.open) * k,
      });
      if (progress < 1) frame = window.requestAnimationFrame(step);
      else course.dataset.phase = 'settled';
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [available, confirmed, open, memory]);

  return courseRef;
}

/**
 * Sojinha in true right-facing profile: one visible eye and mouth on the
 * leading edge, the pod behind the back, near limbs in front of the body and
 * darker far limbs behind it. Each leg bends at hip and knee.
 */
function RunningSojinha() {
  const leg = (side: 'near' | 'far') => <g className={`commercial-dashboard-overview-sojinha__thigh commercial-dashboard-overview-sojinha__thigh--${side}`}>
    <path className="commercial-dashboard-overview-sojinha__limb" d="M30 49v8.5" />
    <g className="commercial-dashboard-overview-sojinha__shin">
      <path className="commercial-dashboard-overview-sojinha__limb" d="M30 57.5v6" />
      <path className="commercial-dashboard-overview-sojinha__shoe" d="M27.6 63.3c0-1.4 1.1-2.3 2.4-2.3h1.6c2.6 0 4.8 1.2 5.9 3.1.5.9-.1 2-1.2 2h-7.3c-.8 0-1.4-.6-1.4-1.4Z" />
    </g>
  </g>;
  const arm = (side: 'near' | 'far') => <g className={`commercial-dashboard-overview-sojinha__arm commercial-dashboard-overview-sojinha__arm--${side}`}>
    <path className="commercial-dashboard-overview-sojinha__limb" d="M32 39v6" />
    <g className="commercial-dashboard-overview-sojinha__forearm">
      <path className="commercial-dashboard-overview-sojinha__limb" d="M32 45v5.2" />
      <circle className="commercial-dashboard-overview-sojinha__glove" cx="32" cy="51" r="3.1" />
    </g>
  </g>;

  return <svg className="commercial-dashboard-overview-sojinha" viewBox="0 0 64 72" aria-hidden="true" focusable="false">
    <ellipse className="commercial-dashboard-overview-sojinha__shadow" cx="33" cy="69.2" rx="12.5" ry="1.8" />
    <g transform="rotate(6 32 66)">
      <g className="commercial-dashboard-overview-sojinha__body">
        {arm('far')}
        {leg('far')}
        {leg('near')}
        <path className="commercial-dashboard-overview-sojinha__pod" d="M21.5 9.5C12.6 13.4 9 22.6 11.4 31.8c1 3.9 3.1 7.3 6 9.9l5.7-6.6C18.6 30.8 17 23.8 21.5 9.5Z" />
        <path className="commercial-dashboard-overview-sojinha__shorts" d="M24.3 46.6c5.8 1.4 11.6 1.5 17.3-.2l.9 5.6c-2.3.9-4.6 1.3-6.9 1.3l-1.7-2-1.9 2.2c-2.8.1-5.6-.3-8.4-1.2Z" />
        <path className="commercial-dashboard-overview-sojinha__shirt" d="M24.5 37.5c2.4-1.9 5.4-2.8 8.6-2.6 3.1.2 5.6 1.4 7.2 3.2l1.6 9.6c-5.1 1.7-11 1.7-17.6.2Z" />
        <path className="commercial-dashboard-overview-sojinha__shirt-mark" d="M31 41.6c1.7-1.2 3.8-1.3 5.6-.2M31.7 44c1.3-.8 2.8-.9 4.2-.1" />
        <ellipse className="commercial-dashboard-overview-sojinha__bean" cx="35" cy="20" rx="18.5" ry="17" transform="rotate(12 35 20)" />
        <path className="commercial-dashboard-overview-sojinha__bean-shade" d="M18.6 16.6c-1.9 8.6 2.4 16.9 10.6 20.2-6.9.4-13.3-4.6-13.9-11.7-.3-3.1.9-6.1 3.3-8.5Z" />
        <ellipse className="commercial-dashboard-overview-sojinha__bean-light" cx="41.5" cy="8.6" rx="5.4" ry="2.4" transform="rotate(22 41.5 8.6)" />
        <path className="commercial-dashboard-overview-sojinha__tuft" d="M35.6 4.6c-1.6-3.3-5.4-4.8-8.9-3.6 2.7.5 4.5 2 5.3 4.2ZM31.8 4.4c-2.3-1.3-4.9-1.1-6.8.4 2.1 0 3.7.5 4.9 1.5Z" />
        <ellipse className="commercial-dashboard-overview-sojinha__eye" cx="44.6" cy="17" rx="3.4" ry="5" transform="rotate(12 44.6 17)" />
        <ellipse className="commercial-dashboard-overview-sojinha__pupil" cx="46" cy="17.7" rx="1.8" ry="3.1" transform="rotate(12 46 17.7)" />
        <circle className="commercial-dashboard-overview-sojinha__glint" cx="46.6" cy="16" r=".7" />
        <path className="commercial-dashboard-overview-sojinha__mouth" d="M45.4 25.2c2.3 1.5 4.7 1.6 7-.1-.5 2.6-2.4 4.3-4.6 4.2-1.3 0-2.2-1.6-2.4-4.1Z" />
        {arm('near')}
      </g>
    </g>
  </svg>;
}

export function CommercialSalesProgress({ aggregate, fillMemory }: {
  aggregate: DashboardAggregate;
  /** Lets the Dashboard keep the visual fill while switching to Vendas and back. */
  fillMemory?: MutableRefObject<SalesProgressFill | null>;
}) {
  const progress = commercialSalesProgress(aggregate);
  const [paused, setPaused] = useState(false);
  const courseRef = useSalesProgressFill({ confirmed: progress.confirmed, open: progress.open }, progress.available, fillMemory);
  const format = (value: number) => formatDashboardPercentage(value);
  const style = {
    '--sales-confirmed': `${progress.confirmed}%`,
    '--sales-open': `${progress.open}%`,
    '--sales-position': `${progress.combined}%`,
  } as CSSProperties;
  const basisLabel = progress.partial ? 'Subtotal conhecido' : 'Total comercial';

  return <section className="commercial-dashboard-overview-progress" aria-label="Progresso das vendas por valor comercial"
    style={style} data-available={progress.available ? 'true' : 'false'}>
    <div className="commercial-dashboard-overview-progress__head">
      <div className="commercial-dashboard-overview-progress__titles">
        <span className="commercial-dashboard-overview-progress__eyebrow">Evolução comercial</span>
        <div className="commercial-dashboard-overview-progress__title-row">
          <h2>Vendas sobre o valor comercial</h2>
          <OverviewInfo label="Informações sobre a evolução comercial" title="Evolução comercial" align="start"
            lead="Valor confirmado e valor em andamento divididos pela mesma base comercial conhecida, calculados em centavos."
            facts={[
              ['Confirmadas', progress.available ? `${formatDashboardCurrency(aggregate.soldValue)} · ${format(progress.confirmed)}` : '—'],
              ['Em andamento', progress.available ? `${formatDashboardCurrency(aggregate.saleOpenValue)} · ${format(progress.open)}` : '—'],
              [basisLabel, progress.available ? formatDashboardCurrency(aggregate.totalKnownValue) : 'Sem total comercial conhecido'],
            ]}
            note="Valores de vendas não representam receita recebida." />
        </div>
      </div>
      <strong className="commercial-dashboard-overview-progress__total">{progress.available ? format(progress.combined) : '—'}</strong>
    </div>
    <div className="commercial-dashboard-overview-progress__course" ref={courseRef} aria-hidden="true"
      data-commercial-map-full-motion data-paused={paused ? 'true' : 'false'}>
      {progress.available && <div className="commercial-dashboard-overview-progress__runner"><RunningSojinha /></div>}
      <div className="commercial-dashboard-overview-progress__track">
        <div className="commercial-dashboard-overview-progress__fill">
          <span className="commercial-dashboard-overview-progress__segment commercial-dashboard-overview-progress__segment--confirmed" />
          <span className="commercial-dashboard-overview-progress__segment commercial-dashboard-overview-progress__segment--open" />
        </div>
      </div>
    </div>
    <div className="commercial-dashboard-overview-progress__footer">
      <ul className="commercial-dashboard-overview-progress__legend">
        <li><LegendConfirmedKey />Confirmadas <b>{progress.available ? format(progress.confirmed) : '—'}</b></li>
        <li><LegendOpenKey />Em andamento <b>{progress.available ? format(progress.open) : '—'}</b></li>
      </ul>
      {progress.available && <button type="button" className="commercial-dashboard-overview-progress__motion"
        aria-label="Pausar corrida do Sojinha" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
        {paused ? <PlayGlyph /> : <PauseGlyph />}
      </button>}
      <p className="commercial-dashboard-overview-progress__reference">
        {progress.available ? <>
          <span className="commercial-dashboard-overview-progress__reference-label">{basisLabel}</span>
          <span className="commercial-dashboard-overview-progress__reference-value">{formatDashboardCurrency(aggregate.totalKnownValue)}</span>
        </> : <span className="commercial-dashboard-overview-progress__reference-label">Sem total comercial conhecido</span>}
      </p>
    </div>
  </section>;
}
