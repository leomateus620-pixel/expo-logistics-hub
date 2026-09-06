import type { ReactNode } from 'react';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { useCompactDetailSheet } from '../../hooks/useCompactDetailSheet';
import './compact-detail-sheet.css';

export function CompactDetailSheetControls({ sheet, subject = 'lote', embedded = false, children }: {
  sheet: ReturnType<typeof useCompactDetailSheet>;
  subject?: 'lote' | 'módulo';
  embedded?: boolean;
  children?: ReactNode;
}) {
  const expanded = sheet.sheetState === 'expanded';
  return (
    <div className="commercial-map-compact-sheet-controls">
      {children}
      {!embedded && <button type="button" className="commercial-map-compact-sheet-handle"
        aria-label={`${sheet.sheetState === 'collapsed' ? 'Restaurar' : 'Recolher'} detalhes do ${subject}`}
        aria-expanded={sheet.sheetState !== 'collapsed'} {...sheet.handleProps}>
        <ChevronDown aria-hidden="true" />
        <span>{sheet.sheetState === 'collapsed' ? 'Resumo' : 'Recolher'}</span>
      </button>}
      <button type="button" className="commercial-map-compact-sheet-expand"
        onClick={(event) => {
          sheet.setSheetState(expanded ? 'half' : 'expanded');
          if (embedded && !expanded) event.currentTarget.dispatchEvent(new Event('commercial-map-expand-context', { bubbles: true }));
        }}
        aria-label={expanded ? 'Voltar ao resumo' : `Expandir detalhes do ${subject}`}
        aria-expanded={expanded}>
        {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        <span>{expanded ? 'Resumo' : 'Detalhes'}</span>
      </button>
    </div>
  );
}
