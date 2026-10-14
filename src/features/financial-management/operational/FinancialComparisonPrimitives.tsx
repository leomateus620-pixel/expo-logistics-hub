import { memo, useId, type ReactNode } from 'react';
import { HelpCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatBRL, formatCompactBRL } from '../utils/financialFormatters';
import '@/styles/financial-comparison-ui.css';

export function FinancialComparisonHelp({ label, children }: { label: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><button type="button" className="f28-comparison-help" aria-label={label}><HelpCircle aria-hidden="true" /></button></PopoverTrigger><PopoverContent className="f28-comparison-help-popover" align="end">{children}</PopoverContent></Popover>;
}

export const FinancialComparisonMetric = memo(function FinancialComparisonMetric({ label, value, state = 'ready', primary = false, hint, attention = false, className }: {
  label: string; value: number | null; state?: 'ready' | 'loading' | 'error'; primary?: boolean;
  hint?: string; attention?: boolean; className?: string;
}) {
  const exact = value == null || !Number.isFinite(value) ? null : formatBRL(value / 100);
  return <article className={cn('f28-comparison-stat', className)} data-primary={primary || undefined} data-attention={attention || undefined} aria-busy={state === 'loading'}>
    <div className="f28-comparison-stat__heading"><h3>{label}</h3>{hint && <FinancialComparisonHelp label={`Ajuda sobre ${label}`}><strong>{label}</strong><p>{hint}</p></FinancialComparisonHelp>}</div>
    {state === 'ready' && exact != null ? <Popover><PopoverTrigger asChild><button type="button" className="f28-comparison-stat__value" aria-label={`${label}: ${exact}. Ver valor exato`}>
      <span className="f28-comparison-value-full">{exact}</span><span className="f28-comparison-value-compact">{formatCompactBRL(value! / 100)}</span>
    </button></PopoverTrigger><PopoverContent className="f28-comparison-value-popover"><strong>{label}</strong><span>{exact}</span></PopoverContent></Popover> : <p className="f28-comparison-stat__unavailable">{state === 'loading' ? 'Carregando…' : 'Indisponível'}</p>}
  </article>;
});

export function FinancialComparisonAction({ label, compactLabel, onClick, disabled = false, tone = 'projetado', description }: {
  label: string; compactLabel?: string; onClick: () => void; disabled?: boolean;
  tone?: 'projetado' | 'realizado'; description?: string;
}) {
  const id = useId();
  return <div className="f28-comparison-action-wrap">
    <Button type="button" className="f28-comparison-action" data-tone={tone} onClick={onClick} disabled={disabled} aria-label={label} aria-describedby={description ? id : undefined}>
      <Plus aria-hidden="true" /><span>{compactLabel ?? label}</span>
    </Button>
    {description && <span className="sr-only" id={id}>{description}</span>}
  </div>;
}

export function FinancialComparisonSideHeader({ id, title, eyebrow, tone = 'projetado', action }: {
  id?: string; title: string; eyebrow?: string; tone?: 'projetado' | 'realizado'; action?: ReactNode;
}) {
  return <header className="f28-comparison-side-header" data-tone={tone}>
    <div>{eyebrow && <span className="f28-comparison-side-header__eyebrow">{eyebrow}</span>}<h2 id={id}>{title}</h2></div>
    {action}
  </header>;
}
