import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import { toast } from '@/hooks/use-toast';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import PageTransition from '@/components/PageTransition';
import type { CommissionMenuItem, CommissionModule } from '@/modules/commissions/commissionRegistry';
import { resolveOfficialUnit, type OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
import {
  CommissionAgendaPage,
  CommissionDocumentsPage,
  CommissionOverviewPage,
  CommissionTasksPage,
  CommissionTeamPage,
  CommissionWorkspaceShell,
  WORKSPACE_SECTION_PATHS,
  buildWorkspaceNavigation,
  resolveWorkspaceSection,
  toAgendaEventViewModels,
  toCommissionUnitViewModel,
  toUnitSummary,
  type AgendaEventViewModel,
  type AgendaLoadState,
  type CommissionAgendaPageHandle,
  type CronogramaEventRowLike,
  type DocumentViewModel,
} from '@/features/commission-agenda';

interface CommissionWorkspacePageProps {
  module: CommissionModule;
  entry: OfficialUnitEntry;
}

const EVENT_COLUMNS =
  'id, title, start_date, end_date, start_time, end_time, event_time, status, location, description, responsible_name, commission_slug';

/** Documents are not persisted yet — the panel renders its empty state. */
const NO_DOCUMENTS: DocumentViewModel[] = [];

function notifyNextPhase(feature: string) {
  toast({
    title: `${feature} em preparação`,
    description: 'Esta ação será habilitada na próxima fase da Agenda das comissões.',
  });
}

export default function CommissionWorkspacePage({ module, entry }: CommissionWorkspacePageProps) {
  const { orgId } = useCurrentOrg();
  const { byUnit, isLoading: peopleLoading } = useCommissionPeople();
  const location = useLocation();
  const navigate = useNavigate();
  const agendaRef = useRef<CommissionAgendaPageHandle>(null);
  const [pendingCreate, setPendingCreate] = useState(false);

  const section = resolveWorkspaceSection(location.pathname, module.basePath);

  const slugCandidates = useMemo(
    () => Array.from(new Set([entry.id, entry.moduleSlug].filter(Boolean) as string[])),
    [entry.id, entry.moduleSlug],
  );

  const eventsQuery = useQuery({
    queryKey: ['commission-front-events', orgId, entry.id],
    enabled: Boolean(orgId),
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<CronogramaEventRowLike[]> => {
      if (!orgId) return [];
      const { data: links, error: linkError } = await supabase
        .from('cronograma_evento_comissoes')
        .select('event_id')
        .eq('org_id', orgId)
        .in('commission_slug', slugCandidates)
        .limit(500);
      if (linkError) throw linkError;

      const ids = Array.from(new Set((links ?? []).map((row) => row.event_id)));

      const direct = await supabase
        .from('cronograma_eventos')
        .select(EVENT_COLUMNS)
        .eq('org_id', orgId)
        .in('commission_slug', slugCandidates)
        .limit(200);
      if (direct.error) throw direct.error;

      let linked: CronogramaEventRowLike[] = [];
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from('cronograma_eventos')
          .select(EVENT_COLUMNS)
          .eq('org_id', orgId)
          .in('id', ids)
          .limit(200);
        if (error) throw error;
        linked = (data ?? []) as CronogramaEventRowLike[];
      }

      const merged = new Map<string, CronogramaEventRowLike>();
      for (const row of [...((direct.data ?? []) as CronogramaEventRowLike[]), ...linked]) merged.set(row.id, row);
      return Array.from(merged.values());
    },
  });

  const unit = useMemo(
    () => toCommissionUnitViewModel({ module, entry, people: byUnit.get(entry.id) }),
    [module, entry, byUnit],
  );

  const events = useMemo<AgendaEventViewModel[]>(() => {
    const self = toUnitSummary(entry);
    return toAgendaEventViewModels(eventsQuery.data ?? [], {
      self,
      resolveUnit: (slug) => {
        const resolved = resolveOfficialUnit(slug);
        return resolved ? toUnitSummary(resolved.entry) : undefined;
      },
    });
  }, [eventsQuery.data, entry]);

  const state: AgendaLoadState = eventsQuery.isError ? 'error' : eventsQuery.isLoading || peopleLoading ? 'loading' : 'ready';

  const navigation = useMemo(
    () => buildWorkspaceNavigation(module.basePath, {
      agenda: events.length,
      team: unit.leads.length + unit.members.length,
    }),
    [module.basePath, events.length, unit.leads.length, unit.members.length],
  );

  const sidebarItems = useMemo<CommissionMenuItem[]>(
    () => navigation.map((item) => ({
      label: item.label,
      path: WORKSPACE_SECTION_PATHS[item.id],
      description: `${item.label} da frente.`,
      icon: item.icon,
    })),
    [navigation],
  );

  const agendaPath = `${module.basePath}/${WORKSPACE_SECTION_PATHS.agenda}`;
  const overviewPath = `${module.basePath}/${WORKSPACE_SECTION_PATHS.overview}`;

  const requestCreate = useCallback(() => {
    if (section === 'agenda' && agendaRef.current) {
      agendaRef.current.openCreate();
      return;
    }
    setPendingCreate(true);
    navigate(agendaPath);
  }, [section, navigate, agendaPath]);

  useEffect(() => {
    if (!pendingCreate || section !== 'agenda') return;
    const frame = window.requestAnimationFrame(() => {
      agendaRef.current?.openCreate();
      setPendingCreate(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingCreate, section]);

  const openEventInAgenda = useCallback(
    (event: AgendaEventViewModel) => {
      if (section === 'agenda' && agendaRef.current) {
        agendaRef.current.openEvent(event);
        return;
      }
      navigate(agendaPath, { state: { openEventId: event.id } });
    },
    [section, navigate, agendaPath],
  );

  const openEventId = (location.state as { openEventId?: string } | null)?.openEventId;
  useEffect(() => {
    if (!openEventId || section !== 'agenda' || state !== 'ready') return;
    const target = events.find((event) => event.id === openEventId);
    const frame = window.requestAnimationFrame(() => {
      if (target) agendaRef.current?.openEvent(target);
      navigate(location.pathname, { replace: true, state: null });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openEventId, section, state, events, navigate, location.pathname]);

  const retry = () => void eventsQuery.refetch();

  return (
    <CommissionLayout module={module} variant="workspace" menuItems={sidebarItems}>
      <CommissionWorkspaceShell
        unit={unit}
        navigation={navigation}
        section={section}
        action={{ label: 'Criar evento', icon: CalendarPlus, onClick: requestCreate }}
      >
        <PageTransition>
          <Routes>
            <Route index element={<Navigate to={overviewPath} replace />} />
            <Route
              path={WORKSPACE_SECTION_PATHS.overview}
              element={
                <CommissionOverviewPage
                  unit={unit}
                  events={events}
                  documents={NO_DOCUMENTS}
                  state={state}
                  onOpenEvent={openEventInAgenda}
                  onCreateEvent={requestCreate}
                  onAddDocument={() => notifyNextPhase('Publicação de documentos')}
                  onRetry={retry}
                />
              }
            />
            <Route
              path={WORKSPACE_SECTION_PATHS.agenda}
              element={
                <CommissionAgendaPage
                  ref={agendaRef}
                  unit={unit}
                  events={events}
                  documents={NO_DOCUMENTS}
                  state={state}
                  onRetry={retry}
                  onAddDocument={() => notifyNextPhase('Publicação de documentos')}
                  onOpenDocuments={() => navigate(`${module.basePath}/${WORKSPACE_SECTION_PATHS.documents}`)}
                  onSubmitEvent={() => notifyNextPhase('Criação de eventos')}
                />
              }
            />
            <Route
              path={WORKSPACE_SECTION_PATHS.documents}
              element={
                <CommissionDocumentsPage
                  unit={unit}
                  documents={NO_DOCUMENTS}
                  state={state === 'error' ? 'ready' : state}
                  onAddDocument={() => notifyNextPhase('Publicação de documentos')}
                />
              }
            />
            <Route path={WORKSPACE_SECTION_PATHS.team} element={<CommissionTeamPage unit={unit} state={peopleLoading ? 'loading' : 'ready'} />} />
            <Route path={WORKSPACE_SECTION_PATHS.tasks} element={<CommissionTasksPage unit={unit} />} />
            <Route path="*" element={<Navigate to={overviewPath} replace />} />
          </Routes>
        </PageTransition>
      </CommissionWorkspaceShell>
    </CommissionLayout>
  );
}
