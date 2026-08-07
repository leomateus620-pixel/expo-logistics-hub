import '@/styles/agenda-wordmark.css';

export type AgendaWordmarkVariant = 'fenasoja' | 'venue';
export type AgendaWordmarkScale = 'compact' | 'default' | 'display';

interface AgendaWordmarkProps {
  variant: AgendaWordmarkVariant;
  scale?: AgendaWordmarkScale;
  className?: string;
  as?: 'span' | 'div';
}

const WORDMARK_COPY: Record<AgendaWordmarkVariant, { lead: string; accent: string }> = {
  fenasoja: { lead: 'Agenda', accent: 'Fenasoja' },
  venue: { lead: 'Agenda', accent: 'Restaurante e Arena' },
};

export function getAgendaWordmarkLabel(variant: AgendaWordmarkVariant) {
  const { lead, accent } = WORDMARK_COPY[variant];
  return `${lead} ${accent}`;
}

export function AgendaWordmark({
  variant,
  scale = 'default',
  className,
  as: Tag = 'span',
}: AgendaWordmarkProps) {
  const { lead, accent } = WORDMARK_COPY[variant];

  return (
    <Tag
      className={['agenda-wordmark', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-scale={scale}
    >
      <span className="sr-only">{`${lead} ${accent}`}</span>
      <span className="agenda-wordmark__visual" aria-hidden="true">
        <span className="agenda-wordmark__lead">{lead}</span>
        <span className="agenda-wordmark__accent">
          <span className="agenda-wordmark__accent-text">{accent}</span>
          <span className="agenda-wordmark__underline" />
        </span>
      </span>
    </Tag>
  );
}
