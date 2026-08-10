import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FinancialIntelligenceTooltipTone =
  | 'positive'
  | 'negative'
  | 'attention'
  | 'neutral';

export interface FinancialIntelligenceTooltipRow {
  label: string;
  value: ReactNode;
  tone?: FinancialIntelligenceTooltipTone;
}

export interface FinancialIntelligenceTooltipProps {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  rows: readonly FinancialIntelligenceTooltipRow[];
  classPrefix: 'fsi-tooltip' | 'scenario-tooltip';
  className?: string;
  as?: 'div' | 'span';
  edge?: 'left' | 'center' | 'right';
  footer?: ReactNode;
  style?: CSSProperties;
}

/**
 * Shared semantic shell for the authored sponsorship and scenario charts.
 * Positioning remains scoped to each view while the accessible structure and
 * complete-value contract stay identical for hover, focus and touch states.
 */
export function FinancialIntelligenceTooltip({
  id,
  eyebrow,
  title,
  rows,
  classPrefix,
  className,
  as: Root = 'div',
  edge,
  footer,
  style,
}: FinancialIntelligenceTooltipProps) {
  return (
    <Root
      id={id}
      role="tooltip"
      className={cn(classPrefix, className)}
      data-edge={edge}
      style={style}
    >
      {eyebrow && <span className={`${classPrefix}__eyebrow`}>{eyebrow}</span>}
      <strong className={`${classPrefix}__title`}>{title}</strong>
      <span className={`${classPrefix}__rows`}>
        {rows.map((row) => (
          <span
            key={row.label}
            className={`${classPrefix}__row`}
            data-tone={row.tone}
          >
            <span className={`${classPrefix}__label`}>{row.label}</span>
            <b className={`${classPrefix}__value`}>{row.value}</b>
          </span>
        ))}
      </span>
      {footer && <small className={`${classPrefix}__footer`}>{footer}</small>}
    </Root>
  );
}
