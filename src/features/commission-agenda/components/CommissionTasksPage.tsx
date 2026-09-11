import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommissionUnitViewModel } from '../types';
import { unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaEmptyState } from './AgendaStates';

export interface CommissionTasksPageProps {
  unit: CommissionUnitViewModel;
  className?: string;
}

export function CommissionTasksPage({ unit, className }: CommissionTasksPageProps) {
  const unitLabel = unitArticleLabel(unit.type);
  return (
    <div className={cn('ua-page', className)}>
      <header className="ua-header">
        <div className="min-w-0">
          <p className="ua-header__eyebrow ws-label">Tarefas {unitLabel}</p>
          <h2 className="ua-header__title ws-title">Acompanhamento</h2>
          <p className="ua-header__meta ws-meta-secondary">Área preparada para o plano operacional da frente.</p>
        </div>
      </header>
      <AgendaEmptyState
        icon={ListChecks}
        title="Área preparada"
        detail="O acompanhamento de tarefas específicas desta frente será habilitado após a validação do escopo operacional."
      />
    </div>
  );
}
