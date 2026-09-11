import { useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaLoadState, CommissionUnitViewModel, DocumentViewModel } from '../types';
import { normalizeSearch } from '../lib/agenda-presentation';
import { unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaSearch } from './AgendaControls';
import { DocumentCard } from './DocumentCard';
import { DocumentsSkeleton } from './AgendaSkeleton';
import { AgendaEmptyState, AgendaErrorState, DocumentsEmptyState } from './AgendaStates';
import { WorkspaceButton } from './primitives';

export interface CommissionDocumentsPageProps {
  unit: CommissionUnitViewModel;
  documents: DocumentViewModel[];
  state?: AgendaLoadState;
  onOpenDocument?: (document: DocumentViewModel) => void;
  onDownloadDocument?: (document: DocumentViewModel) => void;
  onAddDocument?: () => void;
  onRetry?: () => void;
  className?: string;
}

type DocumentScope = 'all' | 'unit' | 'events';

const SCOPE_LABELS: Record<DocumentScope, string> = {
  all: 'Todos',
  unit: 'Da frente',
  events: 'De eventos',
};

export function CommissionDocumentsPage({ unit, documents, state = 'ready', onOpenDocument, onDownloadDocument, onAddDocument, onRetry, className }: CommissionDocumentsPageProps) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<DocumentScope>('all');
  const unitLabel = unitArticleLabel(unit.type);

  const sorted = useMemo(() => [...documents].sort((a, b) => b.date.localeCompare(a.date)), [documents]);
  const counts = useMemo(
    () => ({
      all: sorted.length,
      unit: sorted.filter((document) => !document.eventId).length,
      events: sorted.filter((document) => Boolean(document.eventId)).length,
    }),
    [sorted],
  );
  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return sorted.filter((document) => {
      if (scope === 'unit' && document.eventId) return false;
      if (scope === 'events' && !document.eventId) return false;
      if (!term) return true;
      return normalizeSearch(`${document.name} ${document.category ?? ''} ${document.eventTitle ?? ''} ${document.uploadedBy?.name ?? ''}`).includes(term);
    });
  }, [sorted, scope, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentViewModel[]>();
    for (const document of visible) {
      const key = document.eventTitle ?? (document.category ?? `Documentos ${unitLabel}`);
      map.set(key, [...(map.get(key) ?? []), document]);
    }
    return Array.from(map.entries());
  }, [visible, unitLabel]);

  if (state === 'error') {
    return <div className={cn('ua-page', className)}><AgendaErrorState onRetry={onRetry} label="os documentos" /></div>;
  }

  return (
    <div className={cn('ua-page', className)}>
      <header className="ua-header">
        <div className="min-w-0">
          <p className="ua-header__eyebrow ws-label">Documentos {unitLabel}</p>
          <h2 className="ua-header__title ws-title">Biblioteca</h2>
          <p className="ua-header__meta ws-meta-secondary">
            {documents.length === 0 ? 'Nenhum documento publicado' : `${documents.length} ${documents.length === 1 ? 'documento publicado' : 'documentos publicados'}`}
          </p>
        </div>
        {onAddDocument && documents.length > 0 && (
          <WorkspaceButton variant="primary" icon={Plus} onClick={onAddDocument}>Adicionar documento</WorkspaceButton>
        )}
      </header>

      {state === 'loading' ? (
        <section className="ws-panel ua-section"><DocumentsSkeleton rows={5} /></section>
      ) : documents.length === 0 ? (
        <DocumentsEmptyState unitLabel={unitLabel} onAddDocument={onAddDocument} />
      ) : (
        <>
          <div className="ua-toolbar">
            <AgendaSearch value={search} onChange={setSearch} placeholder="Buscar documento, evento ou autor…" />
            <div className="ua-toolbar__controls">
              <div className="ua-segmented ua-segmented--compact" role="tablist" aria-label="Origem dos documentos">
                {(Object.keys(SCOPE_LABELS) as DocumentScope[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={scope === option}
                    className="ua-segmented__item ws-focus"
                    onClick={() => setScope(option)}
                  >
                    {SCOPE_LABELS[option]}
                    {counts[option] > 0 && <span className="ua-control__count">{counts[option]}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <AgendaEmptyState
              icon={FileText}
              title="Nenhum documento encontrado"
              detail="Tente alterar a busca ou a origem selecionada."
              actions={<WorkspaceButton onClick={() => { setSearch(''); setScope('all'); }}>Limpar filtros</WorkspaceButton>}
            />
          ) : (
            <div className="grid gap-4">
              {grouped.map(([group, items]) => (
                <section key={group} className="ws-panel ua-section" aria-label={group}>
                  <header className="ua-section__header">
                    <h3 className="ua-section__title ws-section-title">
                      <FileText aria-hidden="true" />
                      <span className="truncate">{group}</span>
                    </h3>
                    <span className="ws-meta-secondary">{items.length}</span>
                  </header>
                  <div className="ua-documents">
                    {items.map((document) => (
                      <DocumentCard key={document.id} document={document} hideEvent onOpen={onOpenDocument} onDownload={onDownloadDocument} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
