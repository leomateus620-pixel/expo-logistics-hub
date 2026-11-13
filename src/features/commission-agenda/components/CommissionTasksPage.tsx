import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommissionUnitViewModel } from '../types';
import { unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaEmptyState } from './AgendaStates';

export interface CommissionTasksPageProps {
  unit: CommissionUnitViewModel;
  className?: string;
  standalone?: boolean;
}

export function CommissionTasksPage({ unit, className, standalone = false }: CommissionTasksPageProps) {
  const unitLabel = unitArticleLabel(unit.type);
  const Title = standalone ? 'h1' : 'h2';
  return (
    <div className={cn('ua-page', className)}>
      <header className="ua-header">
        <div className="min-w-0">
          <Title className="ua-header__title ws-title">{standalone ? 'Tarefas' : `Tarefas ${unitLabel}`}</Title>
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
