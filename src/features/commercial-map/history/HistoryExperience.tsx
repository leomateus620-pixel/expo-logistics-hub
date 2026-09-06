import { Component, Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, X } from 'lucide-react';
import './history.css';

class EditorialBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert" className="fenasoja-history-message">Não foi possível carregar esta história. Volte às informações e tente novamente. O mapa continua disponível.</p>
      : this.props.children;
  }
}

export function HistoryExperience({ historyId, onClose }: { historyId: string; onClose: () => void }) {
  // A fresh lazy instance on re-open also permits recovery after a failed chunk request.
  const [HistoryView] = useState(() => lazy(() => import('./HistoryView')));
  const backRef = useRef<HTMLButtonElement>(null);
  return (
    <section className="fenasoja-history" aria-label="Histórias da Fenasoja"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}>
      <header className="fenasoja-history-header">
        <span><BookOpen aria-hidden="true" />Histórias da Fenasoja</span>
        <button type="button" onClick={onClose} aria-label="Fechar história"><X aria-hidden="true" /></button>
        <button ref={backRef} className="fenasoja-history-back" type="button" onClick={onClose} autoFocus>
          <ArrowLeft aria-hidden="true" />Voltar às informações
        </button>
      </header>
      <div className="fenasoja-history-scroll">
        <EditorialBoundary><Suspense fallback={<p className="fenasoja-history-message" role="status">Carregando história…</p>}>
          <HistoryView historyId={historyId} />
        </Suspense></EditorialBoundary>
      </div>
    </section>
  );
}
