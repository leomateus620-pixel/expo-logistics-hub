import { ArrowRight, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentViewModel } from '../types';
import { DocumentCard } from './DocumentCard';
import { DocumentsEmptyState } from './AgendaStates';
import { DocumentsSkeleton } from './AgendaSkeleton';

export interface DocumentsPanelProps {
  documents: DocumentViewModel[];
  title?: string;
  unitLabel: string;
  /** Limits the list and shows a "see all" link. */
  limit?: number;
  loading?: boolean;
  onOpenAll?: () => void;
  onAddDocument?: () => void;
  onOpenDocument?: (document: DocumentViewModel) => void;
  onDownloadDocument?: (document: DocumentViewModel) => void;
  className?: string;
}

export function DocumentsPanel({ documents, title = 'Documentos recentes', unitLabel, limit, loading = false, onOpenAll, onAddDocument, onOpenDocument, onDownloadDocument, className }: DocumentsPanelProps) {
  const sorted = [...documents].sort((a, b) => b.date.localeCompare(a.date));
  const visible = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  const remaining = sorted.length - visible.length;

  return (
    <section className={cn('ws-panel ua-section', className)} aria-labelledby="ua-documents-title">
      <header className="ua-section__header">
        <h2 id="ua-documents-title" className="ua-section__title ws-section-title">
          <FileText aria-hidden="true" />
          <span className="truncate">{title}</span>
        </h2>
        {onOpenAll && documents.length > 0 ? (
          <button type="button" className="ua-section__link ws-focus" onClick={onOpenAll}>
            Ver todos{remaining > 0 ? ` (${sorted.length})` : ''}
            <ArrowRight aria-hidden="true" />
          </button>
        ) : onAddDocument && documents.length > 0 ? (
          <button type="button" className="ua-section__link ws-focus" onClick={onAddDocument}>
            <Plus aria-hidden="true" />
            Adicionar
          </button>
        ) : null}
      </header>

      {loading ? (
        <DocumentsSkeleton />
      ) : visible.length === 0 ? (
        <DocumentsEmptyState unitLabel={unitLabel} onAddDocument={onAddDocument} compact />
      ) : (
        <div className="ua-documents">
          {visible.map((document) => (
            <DocumentCard key={document.id} document={document} onOpen={onOpenDocument} onDownload={onDownloadDocument} />
          ))}
        </div>
      )}
    </section>
  );
}
