/**
 * DEV-ONLY visual preview of the unit workspace using isolated fixtures.
 *
 * Route: `/__dev/comissao-agenda?unit=<slug>&tab=<section>&state=<state>`
 *   - unit:  slug of any derived Comissão/Assessoria (defaults to the first).
 *   - tab:   overview | agenda | documents | team | tasks
 *   - state: ready | loading | error | empty | no-docs
 *   - open:  create | filters | <event id>   (opens an overlay on mount)
 *
 * Never bundled in production (see App.tsx guard). Delete this folder together
 * with `fixtures/` once the backend phase lands.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import type { CommissionMenuItem } from '@/modules/commissions/commissionRegistry';
import { officialUnitResolutions } from '@/modules/commissions/officialCommissionCatalog';
import {
  CommissionAgendaPage,
  CommissionDocumentsPage,
  CommissionOverviewPage,
  CommissionTasksPage,
  CommissionTeamPage,
  CommissionWorkspaceShell,
  WORKSPACE_SECTION_PATHS,
  buildWorkspaceNavigation,
  toCommissionUnitViewModel,
  type AgendaLoadState,
  type CommissionAgendaPageHandle,
  type CommissionWorkspaceSection,
} from '@/features/commission-agenda';
import {
  FIXTURE_DOCUMENTS,
  FIXTURE_EVENTS,
  FIXTURE_PEOPLE_LIST,
  FIXTURE_TODAY,
  FIXTURE_UNITS_LIST,
  getFixtureDocumentsForEvent,
  getFixtureHistory,
} from '../fixtures/agenda.fixtures';

type PreviewState = 'ready' | 'loading' | 'error' | 'empty' | 'no-docs';

const SECTIONS: CommissionWorkspaceSection[] = ['overview', 'agenda', 'documents', 'team', 'tasks'];

function readSection(value: string | null): CommissionWorkspaceSection {
  return SECTIONS.includes(value as CommissionWorkspaceSection) ? (value as CommissionWorkspaceSection) : 'agenda';
}

function readState(value: string | null): PreviewState {
  return ['ready', 'loading', 'error', 'empty', 'no-docs'].includes(value ?? '') ? (value as PreviewState) : 'ready';
}

export default function CommissionAgendaPreviewPage() {
  const [params, setParams] = useSearchParams();
  const derived = useMemo(() => officialUnitResolutions.filter((item) => !item.reusesExistingModule), []);
  const resolution = derived.find((item) => item.entry.id === params.get('unit')) ?? derived[0];
  const section = readSection(params.get('tab'));
  const previewState = readState(params.get('state'));
  const open = params.get('open');
  const agendaRef = useRef<CommissionAgendaPageHandle>(null);
  const [log, setLog] = useState<string[]>([]);

  const unit = useMemo(() => {
    const base = toCommissionUnitViewModel({ module: resolution.module, entry: resolution.entry });
    const leads = FIXTURE_PEOPLE_LIST.slice(0, 2).map((person, index) => ({ ...person, role: index === 0 ? 'Presidente' : 'Vice-presidente' }));
    return {
      ...base,
      status: 'active' as const,
      principal: leads[0],
      leads,
      members: FIXTURE_PEOPLE_LIST.slice(2),
      // The preview lives under /__dev; keep tab links inside it.
      basePath: '/__dev/comissao-agenda',
    };
  }, [resolution]);

  const events = useMemo(() => (previewState === 'empty' ? [] : FIXTURE_EVENTS), [previewState]);
  const documents = useMemo(
    () => (previewState === 'empty' || previewState === 'no-docs' ? [] : FIXTURE_DOCUMENTS),
    [previewState],
  );
  const state: AgendaLoadState = previewState === 'loading' ? 'loading' : previewState === 'error' ? 'error' : 'ready';

  const navigation = useMemo(
    () => buildWorkspaceNavigation(unit.basePath, { agenda: events.length, documents: documents.length, team: unit.leads.length + unit.members.length })
      .map((item) => ({ ...item, path: `${unit.basePath}?${new URLSearchParams({ ...Object.fromEntries(params), tab: item.id }).toString()}` })),
    [unit, events.length, documents.length, params],
  );

  const sidebarItems = useMemo<CommissionMenuItem[]>(
    () => navigation.map((item) => ({ label: item.label, path: WORKSPACE_SECTION_PATHS[item.id], description: item.label, icon: item.icon })),
    [navigation],
  );

  const record = (message: string) => setLog((current) => [message, ...current].slice(0, 6));

  const goTo = (tab: CommissionWorkspaceSection) => {
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!open || section !== 'agenda' || state !== 'ready') return;
    const frame = window.requestAnimationFrame(() => {
      if (open === 'create') agendaRef.current?.openCreate();
      else {
        const event = events.find((item) => item.id === open);
        if (event) agendaRef.current?.openEvent(event);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, section, state, events]);

  const requestCreate = () => {
    record('onCreateEvent');
    if (section === 'agenda') agendaRef.current?.openCreate();
    else goTo('agenda');
  };

  return (
    <CommissionLayout module={resolution.module} variant="workspace" menuItems={sidebarItems}>
      <CommissionWorkspaceShell
        unit={unit}
        navigation={navigation}
        section={section}
        action={{ label: 'Criar evento', icon: CalendarPlus, onClick: requestCreate }}
      >
        {section === 'overview' && (
          <CommissionOverviewPage
            unit={unit}
            events={events}
            documents={documents}
            state={state}
            todayKey={FIXTURE_TODAY}
            onOpenEvent={(event) => { record(`onOpenEvent(${event.id})`); goTo('agenda'); }}
            onCreateEvent={requestCreate}
            onAddDocument={() => record('onAddDocument')}
            onRetry={() => record('onRetry')}
          />
        )}
        {section === 'agenda' && (
          <CommissionAgendaPage
            ref={agendaRef}
            unit={unit}
            events={events}
            documents={documents}
            state={state}
            todayKey={FIXTURE_TODAY}
            peopleOptions={FIXTURE_PEOPLE_LIST}
            unitOptions={FIXTURE_UNITS_LIST}
            getEventDocuments={getFixtureDocumentsForEvent}
            getEventHistory={getFixtureHistory}
            onCreateEvent={() => record('onCreateEvent')}
            onOpenEvent={(event) => record(`onOpenEvent(${event.id})`)}
            onEditEvent={(event) => record(`onEditEvent(${event.id})`)}
            onOpenDocuments={(event) => record(`onOpenDocuments(${event?.id ?? 'all'})`)}
            onOpenDocument={(document) => record(`onOpenDocument(${document.id})`)}
            onDownloadDocument={(document) => record(`onDownloadDocument(${document.id})`)}
            onAddDocument={() => record('onAddDocument')}
            onMonthChange={(month) => record(`onMonthChange(${month})`)}
            onYearChange={(year) => record(`onYearChange(${year})`)}
            onSubmitEvent={(draft) => record(`onSubmitEvent(${draft.title || 'sem título'})`)}
            onRetry={() => record('onRetry')}
          />
        )}
        {section === 'documents' && (
          <CommissionDocumentsPage
            unit={unit}
            documents={documents}
            state={state}
            onOpenDocument={(document) => record(`onOpenDocument(${document.id})`)}
            onDownloadDocument={(document) => record(`onDownloadDocument(${document.id})`)}
            onAddDocument={() => record('onAddDocument')}
            onRetry={() => record('onRetry')}
          />
        )}
        {section === 'team' && <CommissionTeamPage unit={unit} state={state === 'ready' ? 'ready' : state} onRetry={() => record('onRetry')} />}
        {section === 'tasks' && <CommissionTasksPage unit={unit} />}

        {log.length > 0 && (
          <aside className="unit-workspace__content" aria-label="Callbacks disparados" style={{ paddingTop: 0 }}>
            <pre className="ws-inset" style={{ margin: 0, padding: 12, fontSize: 11, overflowX: 'auto' }}>{log.join('\n')}</pre>
          </aside>
        )}
      </CommissionWorkspaceShell>
    </CommissionLayout>
  );
}
