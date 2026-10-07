import { useId, type ReactNode } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, LockKeyhole, TrendingUp, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FinancialAmount, FinancialKpiCard, FinancialSectionHeader } from '../components/FinancialPrimitives';

export type Financial2028Tone = 'neutral' | 'indigo' | 'gold' | 'success' | 'danger';
const tones = { neutral: 'neutral', indigo: 'projected', gold: 'gold', success: 'consolidated', danger: 'over-budget' } as const;
const icons = { neutral: WalletCards, indigo: TrendingUp, gold: BarChart3, success: CheckCircle2, danger: AlertTriangle };

/** Only this presentation boundary converts operational integer cents to reais. */
export function Financial2028Metric({ label, value, hint, tone = 'neutral', priority = false }: {
  label: string; value: number | null; hint?: string; tone?: Financial2028Tone; priority?: boolean;
}) {
  const actualTone = value != null && value < 0 ? 'danger' : tone;
  const amountInReais = value == null ? null : value / 100;
  return <FinancialKpiCard className="f28-metric" label={label}
    value={amountInReais == null ? <span className="f28-unavailable">Não informado</span> : amountInReais}
    compactValue animateValue={false} detail={hint} tone={tones[actualTone]} icon={icons[actualTone]}
    footer={amountInReais != null ? <FinancialAmount value={amountInReais} accessibleLabel={`${label}, valor exato`} /> : undefined}
    priority={priority ? 'primary' : 'secondary'} />;
}

export function Financial2028Panel({ title, description, children, actions }: {
  title: string; description?: string; children: ReactNode; actions?: ReactNode;
}) {
  const titleId = useId();
  return <section className="f28-panel" aria-labelledby={titleId}>
    <FinancialSectionHeader title={title} titleId={titleId} description={description} action={actions} />
    <div className="f28-panel__body">{children}</div>
  </section>;
}

export function Financial2028State({ tone, title, children, retry }: {
  tone: 'info' | 'error' | 'locked'; title: string; children?: ReactNode; retry?: () => void;
}) {
  const Icon = tone === 'locked' ? LockKeyhole : tone === 'error' ? AlertTriangle : BarChart3;
  return <div className={`f28-state f28-state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    <span className="f28-state__icon"><Icon aria-hidden="true" /></span>
    <div><h2>{title}</h2>{children && <div className="f28-state__copy">{children}</div>}
      {retry && <Button type="button" variant="outline" onClick={retry}>Tentar novamente</Button>}
    </div>
  </div>;
}

export function Financial2028Loading({ label }: { label: string }) {
  return <div className="f28-loading" role="status" aria-live="polite">
    <Loader2 className="animate-spin" aria-hidden="true" /><span>{label}</span>
    <div className="f28-loading__skeleton" aria-hidden="true"><i /><i /><i /><i /></div>
  </div>;
}

/** Labelled, noninteractive bars keep exact amounts visible to touch and keyboard users. */
export function Financial2028Composition({ title, description, items }: {
  title: string; description?: string; items: Array<{ label: string; value: number; tone?: Financial2028Tone }>;
}) {
  const maximum = Math.max(0, ...items.map((item) => item.value));
  return <Financial2028Panel title={title} description={description}>
    {items.length === 0 && <p className="f28-composition-empty">Nenhum registro disponível para esta composição.</p>}
    <ul className="f28-composition">
      {items.map((item, index) => <li key={`${item.label}-${index}`} data-tone={item.tone ?? 'indigo'}>
        <div><span>{item.label}</span><FinancialAmount value={item.value / 100} /></div>
        <div className="f28-composition__track" aria-hidden="true"><span style={{ width: `${maximum > 0 ? Math.max(0, item.value) / maximum * 100 : 0}%` }} /></div>
      </li>)}
    </ul>
  </Financial2028Panel>;
}
