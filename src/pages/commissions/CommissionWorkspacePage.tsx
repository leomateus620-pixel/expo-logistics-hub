import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import { useAuth } from '@/hooks/useAuth';
import { useUnitAgenda } from '@/hooks/useUnitAgenda';
import { useUnitDocuments } from '@/hooks/useUnitDocuments';
import { toast } from '@/hooks/use-toast';
import { cronogramaSaveEvent } from '@/lib/cronograma-rpc';
import { supabase } from '@/integrations/supabase/client';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import PageTransition from '@/components/PageTransition';
import type { CommissionMenuItem, CommissionModule } from '@/modules/commissions/commissionRegistry';
import type { OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
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
  toCommissionUnitViewModel,
  type AgendaEventViewModel,
  type AgendaLoadState,
  type CommissionAgendaPageHandle,
  type DocumentViewModel,
  type PersonSummary,
} from '@/features/commission-agenda';
import { draftToSaveEventPayload, validateDraft } from '@/features/commission-agenda/lib/event-draft';
import { canManageDocuments } from '@/features/commission-agenda/lib/visibility';
import type { AgendaEventDraft } from '@/features/commission-agenda/components/EventFormShell';

interface CommissionWorkspacePageProps {
  module: CommissionModule;
  entry: OfficialUnitEntry;
}

export default function CommissionWorkspacePage({ module, entry }: CommissionWorkspacePageProps) {
  const { orgId, myRole } = useCurrentOrg();
  const { user } = useAuth();
  const { byUnit, isLoading: peopleLoading } = useCommissionPeople();
  const location = useLocation();
  const navigate = useNavigate();
  const agendaRef = useRef<CommissionAgendaPageHandle>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const section = resolveWorkspaceSection(location.pathname, module.basePath);

  const {
    commissionId,
    commissionSlug,
    unitOptions,
    byCanonicalId,
    events,
    metrics,
    isLoading: agendaLoading,
    isError,
    refetch,
    invalidate,
  } = useUnitAgenda(entry.id);

  const unit = useMemo(
    () => toCommissionUnitViewModel({ module, entry, people: byUnit.get(entry.id) }),
    [module, entry, byUnit],
  );

  const eventTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const event of events) map[event.id] = event.title;
    return map;
  }, [events]);

  const {
    documents,
    isLoading: documentsLoading,
    upload,
    remove: removeDocument,
    openDocument,
  } = useUnitDocuments(commissionId, { eventTitles });

  const peopleOptions = useMemo<PersonSummary[]>(() => {
    const map = new Map<string, PersonSummary>();
    for (const person of [...unit.leads, ...unit.members]) map.set(person.id, person);
    for (const event of events) {
      for (const person of event.people ?? []) if (!map.has(person.id)) map.set(person.id, person);
    }
    return Array.from(map.values());
  }, [unit.leads, unit.members, events]);

  const memberCommissionIds = useMemo(() => {
    if (!user || !commissionId) return [] as string[];
    const belongs = [...unit.leads, ...unit.members].some((person) => person.userId === user.id);
    return belongs ? [commissionId] : [];
  }, [user, commissionId, unit.leads, unit.members]);

  const accessContext = useMemo(
    () => ({ userId: user?.id ?? null, orgRole: (myRole ?? null) as never, memberCommissionIds }),
    [user?.id, myRole, memberCommissionIds],
  );

  const mayManageDocuments = canManageDocuments(accessContext, commissionId);

  const state: AgendaLoadState = isError ? 'error' : agendaLoading || peopleLoading ? 'loading' : 'ready';

  const navigation = useMemo(
    () => buildWorkspaceNavigation(module.basePath, {
      agenda: metrics.total || events.length,
      team: unit.leads.length + unit.members.length,
      documents: documents.length,
    }),
    [module.basePath, metrics.total, events.length, unit.leads.length, unit.members.length, documents.length],
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
  const documentsPath = `${module.basePath}/${WORKSPACE_SECTION_PATHS.documents}`;

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

  const retry = () => void refetch();

  const submitEvent = useCallback(
    async (draft: AgendaEventDraft, editing: AgendaEventViewModel | null) => {
      if (!orgId || !commissionId || !commissionSlug) {
        toast({ title: 'Não foi possível salvar', description: 'Frente sem cadastro nesta organização.', variant: 'destructive' });
        return;
      }
      const problem = validateDraft(draft);
      if (problem) {
        toast({ title: 'Revise o formulário', description: problem, variant: 'destructive' });
        return;
      }

      setSaving(true);
      try {
        const payload = draftToSaveEventPayload(draft, {
          orgId,
          owner: { commissionId, slug: commissionSlug, name: unit.name },
          editing,
          resolveUnit: (canonicalId) => byCanonicalId.get(canonicalId),
          resolvePerson: (personId) => peopleOptions.find((person) => person.id === personId),
        });

        const saved = (await cronogramaSaveEvent(payload)) as { id?: string } | null;
        const savedId = editing?.id ?? saved?.id ?? null;
        if (savedId && !editing) {
          await (supabase as any).rpc('cronograma_set_event_origin', {
            _event_id: savedId,
            _commission_id: commissionId,
          });
        }

        invalidate();
        toast({
          title: editing ? 'Evento atualizado' : 'Evento criado',
          description: 'O evento também aparece na Agenda Fenasoja quando envolve a Comissão Central.',
        });
      } catch (error) {
        toast({
          title: 'Falha ao salvar o evento',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    },
    [orgId, commissionId, commissionSlug, unit.name, byCanonicalId, peopleOptions, invalidate],
  );

  const handleAddDocument = useCallback(() => {
    if (!mayManageDocuments) {
      toast({ title: 'Sem permissão', description: 'Somente responsáveis da frente podem publicar documentos.', variant: 'destructive' });
      return;
    }
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await upload(file);
        toast({ title: 'Documento publicado', description: file.name });
      } catch (error) {
        toast({
          title: 'Falha no envio',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      }
    };
    input.click();
  }, [mayManageDocuments, upload]);

  const handleOpenDocument = useCallback(
    async (documentModel: DocumentViewModel, download = false) => {
      const url = await openDocument(documentModel.id, { download });
      if (!url) {
        toast({ title: 'Não foi possível abrir o arquivo', variant: 'destructive' });
        return;
      }
      window.location.assign(url);
    },
    [openDocument],
  );

  const handleDeleteDocument = useCallback(
    async (documentModel: DocumentViewModel) => {
      if (!mayManageDocuments) return;
      try {
        await removeDocument(documentModel.id);
        toast({ title: 'Documento removido', description: documentModel.name });
      } catch (error) {
        toast({
          title: 'Falha ao remover',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [mayManageDocuments, removeDocument],
  );

  const documentsState: AgendaLoadState = documentsLoading ? 'loading' : 'ready';

  return (
    <CommissionLayout module={module} variant="workspace" menuItems={sidebarItems}>
      <CommissionWorkspaceShell
        unit={unit}
        navigation={navigation}
        section={section}
        action={{ label: saving ? 'Salvando…' : 'Criar evento', icon: CalendarPlus, onClick: requestCreate }}
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
                  documents={documents}
                  state={state}
                  onOpenEvent={openEventInAgenda}
                  onCreateEvent={requestCreate}
                  onOpenDocument={(doc) => void handleOpenDocument(doc)}
                  onDownloadDocument={(doc) => void handleOpenDocument(doc, true)}
                  onAddDocument={handleAddDocument}
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
                  documents={documents}
                  state={state}
                  peopleOptions={peopleOptions}
                  unitOptions={unitOptions}
                  onRetry={retry}
                  onAddDocument={handleAddDocument}
                  onOpenDocument={(doc) => void handleOpenDocument(doc)}
                  onDownloadDocument={(doc) => void handleOpenDocument(doc, true)}
                  onOpenDocuments={() => navigate(documentsPath)}
                  onSubmitEvent={(draft, editing) => void submitEvent(draft, editing)}
                />
              }
            />
            <Route
              path={WORKSPACE_SECTION_PATHS.documents}
              element={
                <CommissionDocumentsPage
                  unit={unit}
                  documents={documents}
                  state={documentsState}
                  onOpenDocument={(doc) => void handleOpenDocument(doc)}
                  onDownloadDocument={(doc) => void handleOpenDocument(doc, true)}
                  onDeleteDocument={mayManageDocuments ? (doc) => void handleDeleteDocument(doc) : undefined}
                  onAddDocument={handleAddDocument}
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
