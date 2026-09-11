import type { ReactNode } from 'react';
import { CalendarPlus, CalendarX2, FileText, RotateCcw, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceButton } from './primitives';

interface AgendaEmptyStateProps {
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  title: string;
  detail?: string;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function AgendaEmptyState({ icon: Icon = CalendarX2, tone = 'default', title, detail, actions, className, compact = false }: AgendaEmptyStateProps) {
  return (
    <div className={cn('ws-inset ua-empty', compact && 'py-5', className)} role="status">
      <span className="ua-empty__icon" data-tone={tone} aria-hidden="true"><Icon /></span>
      <p className="ua-empty__title ws-meta" style={{ fontWeight: 700 }}>{title}</p>
      {detail && <p className="ua-empty__detail ws-meta-secondary">{detail}</p>}
      {actions && <div className="ua-empty__actions">{actions}</div>}
    </div>
  );
}

export function AgendaNoEventsState({ unitLabel, onCreateEvent }: { unitLabel: string; onCreateEvent?: () => void }) {
  return (
    <AgendaEmptyState
      icon={CalendarPlus}
      title="Nenhum evento cadastrado"
      detail={`Os eventos e compromissos ${unitLabel} aparecerão aqui.`}
      actions={onCreateEvent && (
        <WorkspaceButton variant="primary" icon={CalendarPlus} onClick={onCreateEvent}>Criar primeiro evento</WorkspaceButton>
      )}
    />
  );
}

export function AgendaSearchEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <AgendaEmptyState
      icon={SearchX}
      title="Nenhum evento encontrado"
      detail="Tente alterar os filtros ou o termo pesquisado."
      actions={<WorkspaceButton icon={RotateCcw} onClick={onClear}>Limpar filtros</WorkspaceButton>}
    />
  );
}

export function AgendaErrorState({ onRetry, label = 'a agenda' }: { onRetry?: () => void; label?: string }) {
  return (
    <AgendaEmptyState
      icon={CalendarX2}
      tone="danger"
      title={`Não foi possível carregar ${label}.`}
      detail="Verifique a conexão e tente novamente."
      actions={<WorkspaceButton icon={RotateCcw} onClick={onRetry}>Tentar novamente</WorkspaceButton>}
    />
  );
}

export function DocumentsEmptyState({ unitLabel, onAddDocument, compact = false }: { unitLabel: string; onAddDocument?: () => void; compact?: boolean }) {
  return (
    <AgendaEmptyState
      icon={FileText}
      compact={compact}
      title="Nenhum documento publicado"
      detail={`Os documentos ${unitLabel} e de seus eventos aparecerão aqui.`}
      actions={onAddDocument && (
        <WorkspaceButton size="sm" icon={FileText} onClick={onAddDocument}>Adicionar documento</WorkspaceButton>
      )}
    />
  );
}
