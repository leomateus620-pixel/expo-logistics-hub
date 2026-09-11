/**
 * Agenda workspace of Comissões and Assessorias — presentation layer.
 *
 * Everything exported here is UI only: typed ViewModels, pure formatting
 * helpers, adapters that reshape data the app already loads, and components.
 */
import '@/styles/commission-agenda.css';

export * from './types';
export * from './lib/agenda-presentation';
export * from './lib/workspace-navigation';
export * from './adapters/cronograma.adapter';

export * from './components/primitives';
export * from './components/AgendaStates';
export * from './components/AgendaSkeleton';
export * from './components/CommissionWorkspaceShell';
export * from './components/AgendaDashboard';
export * from './components/AgendaControls';
export * from './components/AgendaEventCard';
export * from './components/AgendaTimeline';
export * from './components/AgendaCalendarView';
export * from './components/WorkspaceSheet';
export * from './components/EventHistory';
export * from './components/EventDetail';
export * from './components/EventFormShell';
export * from './components/AgendaFiltersSheet';
export * from './components/DocumentCard';
export * from './components/DocumentsPanel';
export * from './components/CommissionAgendaPage';
export * from './components/CommissionOverviewPage';
export * from './components/CommissionDocumentsPage';
export * from './components/CommissionTeamPage';
export * from './components/CommissionTasksPage';
