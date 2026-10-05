import type { CSSProperties } from 'react';
import type { DashboardAggregate } from './commercialDashboardTypes';
import { commercialSalesProgress } from './commercialSalesProgressMetrics';
import { formatDashboardCurrency, formatDashboardPercentage } from './commercialDashboardFormatters';

/** A light 2D portrait of the existing bean, shirt, shorts and green shoes. */
function RunningSojinha() {
  return <svg className="commercial-sales-progress__sojinha" viewBox="0 0 64 72" aria-hidden="true" focusable="false">
    <ellipse className="commercial-sales-progress__shadow" cx="30" cy="68" rx="19" ry="2" />
    <g className="commercial-sales-progress__leg commercial-sales-progress__leg--rear">
      <path className="commercial-sales-progress__skin" d="M33 51l7 7-6 7" />
      <path className="commercial-sales-progress__shoe" d="M34 63q3-4 7-2l5 5q1 3-3 3H32q-3-2 2-6" />
    </g>
    <g className="commercial-sales-progress__leg commercial-sales-progress__leg--front">
      <path className="commercial-sales-progress__skin" d="M26 51l-7 7 6 7" />
      <path className="commercial-sales-progress__shoe" d="M24 63q-3-4-7-2l-5 5q-1 3 3 3h11q3-2-2-6" />
    </g>
    <path className="commercial-sales-progress__pod" d="M13 20Q3 27 12 47l10-7ZM48 20q11 7 1 27l-9-8Z" />
    <path className="commercial-sales-progress__skin commercial-sales-progress__arm" d="M15 37 7 48" />
    <path className="commercial-sales-progress__skin commercial-sales-progress__arm commercial-sales-progress__arm--front" d="m45 36 10 8" />
    <circle className="commercial-sales-progress__glove" cx="7" cy="48" r="5" />
    <circle className="commercial-sales-progress__glove" cx="55" cy="44" r="5" />
    <path className="commercial-sales-progress__shorts" d="M19 44h23l2 10H32l-3-3-3 3H17Z" />
    <path className="commercial-sales-progress__shirt" d="M18 34q11-5 23 0l4 12H16Z" />
    <path className="commercial-sales-progress__shirt-mark" d="M24 41q6-5 13 0M25 44q6-4 11 0" />
    <ellipse className="commercial-sales-progress__bean" cx="30" cy="21" rx="21" ry="19" />
    <path className="commercial-sales-progress__tuft" d="M25 4q-1-8 4-6 5 0 6 7" />
    <ellipse className="commercial-sales-progress__eye" cx="23" cy="20" rx="4" ry="6" />
    <ellipse className="commercial-sales-progress__eye" cx="37" cy="20" rx="4" ry="6" />
    <ellipse className="commercial-sales-progress__pupil" cx="24" cy="20" rx="2" ry="4" />
    <ellipse className="commercial-sales-progress__pupil" cx="38" cy="20" rx="2" ry="4" />
    <path className="commercial-sales-progress__smile" d="M20 29q10 11 21 0Z" />
  </svg>;
}

export function CommercialSalesProgress({ aggregate }: { aggregate: DashboardAggregate }) {
  const progress = commercialSalesProgress(aggregate);
  const format = (value: number) => formatDashboardPercentage(value);
  const position = `${progress.combined}%`;
  const style = {
    '--sales-confirmed': `${progress.confirmed}%`,
    '--sales-open': `${progress.open}%`,
    '--sales-position': position,
  } as CSSProperties;

  return <section className="commercial-sales-progress" aria-label="Progresso das vendas por valor comercial" style={style}>
    <div className="commercial-sales-progress__head">
      <div>
        <span className="commercial-sales-progress__eyebrow">EVOLUÇÃO COMERCIAL</span>
        <h2>Vendas sobre o valor comercial</h2>
      </div>
      <strong className="commercial-sales-progress__total">{progress.available ? format(progress.combined) : '—'}</strong>
    </div>
    <div className="commercial-sales-progress__course" aria-hidden="true">
      {progress.available && <div className="commercial-sales-progress__runner"><RunningSojinha /></div>}
      <div className="commercial-sales-progress__track">
        <span className="commercial-sales-progress__confirmed" />
        <span className="commercial-sales-progress__open" />
      </div>
    </div>
    <div className="commercial-sales-progress__legend">
      <span><i className="commercial-sales-progress__key commercial-sales-progress__key--confirmed" />Confirmadas <b>{progress.available ? format(progress.confirmed) : '—'}</b></span>
      <span><i className="commercial-sales-progress__key commercial-sales-progress__key--open" />Em andamento <b>{progress.available ? format(progress.open) : '—'}</b></span>
      <span className="commercial-sales-progress__basis">{progress.available
        ? `${progress.partial ? 'Subtotal conhecido' : 'Total comercial'} · ${formatDashboardCurrency(aggregate.totalKnownValue)}`
        : 'Sem total comercial conhecido'}</span>
    </div>
  </section>;
}
