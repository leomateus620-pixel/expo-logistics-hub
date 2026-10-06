import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InfoGlyph } from './CommercialDashboardOverviewIcons';

const HOVER_OPEN_MS = 90;
const HOVER_CLOSE_MS = 160;

export type OverviewInfoFact = readonly [label: string, value: ReactNode];

/**
 * On-demand explanation for an overview indicator. Opens on mouse hover,
 * keyboard focus and tap/click (click pins it). Escape is consumed by the
 * popover layer first, so the Dashboard stays open and focus stays on the icon.
 */
export function OverviewInfo({ label, title, lead, facts = [], note, align = 'end' }: {
  /** Specific accessible name, e.g. "Informações sobre vendas confirmadas". */
  label: string;
  title: string;
  lead: ReactNode;
  facts?: readonly OverviewInfoFact[];
  note?: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const pointerFocus = useRef(false);
  const timer = useRef<number>();
  const clear = () => window.clearTimeout(timer.current);
  const schedule = (next: boolean, delay: number) => {
    clear();
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };
  useEffect(() => clear, []);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (open) clear();
    else schedule(true, HOVER_OPEN_MS);
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !pinned.current) schedule(false, HOVER_CLOSE_MS);
  };
  const close = () => {
    clear();
    pinned.current = false;
    setOpen(false);
  };

  return <Popover open={open} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}>
    <PopoverTrigger asChild>
      <button type="button" className="commercial-dashboard-overview-info-trigger" aria-label={label}
        onPointerDown={() => { pointerFocus.current = true; }}
        onFocus={() => {
          if (!pointerFocus.current) { clear(); setOpen(true); }
          pointerFocus.current = false;
        }}
        onBlur={() => { if (!pinned.current) close(); }}
        onClick={(event) => {
          event.preventDefault();
          clear();
          if (open && pinned.current) close();
          else { pinned.current = true; setOpen(true); }
        }}
        onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        <InfoGlyph />
      </button>
    </PopoverTrigger>
    <PopoverContent aria-label={label} side="bottom" align={align} sideOffset={8} collisionPadding={12}
      className="commercial-dashboard-overview-info z-[90] w-auto rounded-none border-0 bg-transparent p-0 text-inherit shadow-none"
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="commercial-dashboard-overview-info__panel">
        <p className="commercial-dashboard-overview-info__title">{title}</p>
        <p className="commercial-dashboard-overview-info__lead">{lead}</p>
        {facts.length > 0 && <dl className="commercial-dashboard-overview-info__facts">
          {facts.map(([factLabel, value]) => <div key={factLabel}><dt>{factLabel}</dt><dd>{value}</dd></div>)}
        </dl>}
        {note && <p className="commercial-dashboard-overview-info__note">{note}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
