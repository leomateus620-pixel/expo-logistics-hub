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
          <h2 className="ua-header__title ws-title">Tarefas {unitLabel}</h2>
        </div>
      </header>
      <AgendaEmptyState
        icon={ListChecks}
        title="Plano operacional em preparação"
        detail="O acompanhamento de tarefas específicas desta frente será habilitado após a validação do escopo operacional."
      />
    </div>
  );
}
