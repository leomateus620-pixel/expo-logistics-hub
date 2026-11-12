import { VolunteerTeamById } from '@/features/volunteers/VolunteerTeam';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, MapPinned, Building2, ArrowUpRight } from 'lucide-react';
import { SOY_SUMMIT_ROUTE } from '@/config/soy-summit';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getCommissionMapPortal } from '@/modules/commissions/commissionMapPortalRegistry';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import { useAuth } from '@/hooks/useAuth';
import { useUnitAgenda } from '@/hooks/useUnitAgenda';
import { useUnitDocuments } from '@/hooks/useUnitDocuments';
import { toast } from '@/hooks/use-toast';
import { cronogramaSaveEvent, cronogramaSaveSuccessMessage, type CronogramaRestaurantForwarding } from '@/lib/cronograma-rpc';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import PageTransition from '@/components/PageTransition';
import type { CommissionMenuItem, CommissionModule } from '@/modules/commissions/commissionRegistry';
import type { OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
import {
  CommissionAgendaPage,
  CommissionDocumentsPage,
  CommissionOverviewPage,
  CommissionTasksPage,
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
import { SojaStoreWorkspaceRoute } from '@/features/soja-store/components/SojaStoreWorkspaceRoute';
import { useSojaStoreAccess } from '@/features/soja-store/hooks/useSojaStoreAccess';
import { buildSojaStoreMenu, SOJA_STORE_SECTION_PATHS, SOJA_STORE_UNIT, type SojaStoreSection } from '@/features/soja-store/navigation';

const SojaStoreSummary = lazy(() => import('@/features/soja-store/components/SojaStoreSummary')
  .then(({ SojaStoreSummary }) => ({ default: SojaStoreSummary })));

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
  const { moduleSlug } = useParams();
  const agendaRef = useRef<CommissionAgendaPageHandle>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const isSojaStore = entry.id === SOJA_STORE_UNIT;
  const currentBasePath = moduleSlug ? `/comissoes/${moduleSlug}` : module.basePath;
  const section = resolveWorkspaceSection(location.pathname, currentBasePath, isSojaStore ? SOJA_STORE_SECTION_PATHS : undefined);
  const storeSection = isSojaStore && section in SOJA_STORE_SECTION_PATHS;

  const {
    commissionId,
    commissionIdBySlug,
    commissionSlug,
    unitOptions,
    byCanonicalId,
    events,
    metrics,
    identityLoading,
    isLoading: agendaLoading,
    isError,
    refetch,
    invalidate,
  } = useUnitAgenda(entry.id);
  const storeAccess = useSojaStoreAccess(isSojaStore ? commissionIdBySlug : null);

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

  const { hasCapability } = useCapabilities();
  const mapPortal = entry.mapPortalSlug ? getCommissionMapPortal(entry.mapPortalSlug) : undefined;
  const sidebarItems = useMemo<CommissionMenuItem[]>(() => {
    const items: CommissionMenuItem[] = navigation.map((item) => ({
      label: item.label,
      path: WORKSPACE_SECTION_PATHS[item.id],
      description: `${item.label} da frente.`,
      icon: item.icon,
    })).concat(
      mapPortal && hasCapability(mapPortal.capability)
        ? [{ label: 'Mapa Comercial', path: mapPortal.mapPath, description: 'Mapa comercial do segmento.', icon: MapPinned }]
        : [],
      entry.id === 'soy-summit'
        ? [{ label: 'Centro Cívico 3D', path: SOY_SUMMIT_ROUTE, description: 'Visita ao Centro Cívico e contagem do Soy Summit 2027.', icon: Building2 }]
        : [],
    );
    return isSojaStore ? buildSojaStoreMenu(items, storeAccess.isError ? undefined : storeAccess.data) : items;
  }, [navigation, mapPortal, hasCapability, entry.id, isSojaStore, storeAccess.data, storeAccess.isError]);

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
        return false;
      }
      const problem = validateDraft(draft);
      if (problem) {
        toast({ title: 'Revise o formulário', description: problem, variant: 'destructive' });
        return false;
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

        const saved = (await cronogramaSaveEvent(payload, editing?.lockVersion)) as { id?: string; restaurant_forwarding?: CronogramaRestaurantForwarding | null } | null;
        invalidate();
        toast({
          title: editing ? 'Evento atualizado' : 'Evento criado',
          description: cronogramaSaveSuccessMessage({ restaurantForwarding: saved?.restaurant_forwarding }, 'O evento também aparece na Agenda Fenasoja quando envolve a Comissão Central.'),
        });
        return true;
      } catch (error) {
        toast({
          title: 'Falha ao salvar o evento',
          description: error instanceof Error ? error.message : 'Tente novamente.',
          variant: 'destructive',
        });
        return false;
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
  const storeRoute = (routeSection: SojaStoreSection) => (
    <SojaStoreWorkspaceRoute
      section={routeSection}
      commissionId={commissionIdBySlug}
      identityLoading={identityLoading}
      accessQuery={storeAccess}
    />
  );

  return (
    <CommissionLayout module={module} variant="workspace" menuItems={sidebarItems}>
      <CommissionWorkspaceShell
        unit={unit}
        navigation={navigation}
        section={section}
        identityTitleTag={storeSection ? 'p' : 'h1'}
        action={section === 'team' || storeSection ? undefined : { label: saving ? 'Salvando…' : 'Criar evento', icon: CalendarPlus, onClick: requestCreate }}
      >
        <PageTransition>
          {entry.id === 'soy-summit' && section === 'overview' && <Link to={SOY_SUMMIT_ROUTE}
            className="mb-5 flex min-h-16 items-center gap-3 rounded-xl border border-amber-700/20 bg-amber-50 p-4 text-emerald-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            <Building2 className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="flex-1"><strong className="block text-sm">Centro Cívico 3D</strong><span className="text-xs">Conheça o espaço do Soy Summit 2027 e acompanhe a contagem oficial.</span></span>
            <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
          </Link>}
          <Routes>
            <Route index element={<Navigate to={overviewPath} replace />} />
            <Route
              path={WORKSPACE_SECTION_PATHS.overview}
              element={
                <>
                  {isSojaStore && commissionIdBySlug && !storeAccess.isError && storeAccess.data?.enabled && (
                    <Suspense fallback={null}>
                      <SojaStoreSummary commissionId={commissionIdBySlug} access={storeAccess.data} />
                    </Suspense>
                  )}
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
                </>
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
            <Route path={WORKSPACE_SECTION_PATHS.team} element={<VolunteerTeamById commissionId={commissionId} />} />
            <Route path={WORKSPACE_SECTION_PATHS.tasks} element={<CommissionTasksPage unit={unit} />} />
            {isSojaStore && (
              <>
                <Route path={SOJA_STORE_SECTION_PATHS.produtos} element={storeRoute('produtos')} />
                <Route path={`${SOJA_STORE_SECTION_PATHS.produtos}/:detailId`} element={storeRoute('produtos')} />
                <Route path={SOJA_STORE_SECTION_PATHS.estoque} element={storeRoute('estoque')} />
                <Route path={SOJA_STORE_SECTION_PATHS.fornecedores} element={storeRoute('fornecedores')} />
                <Route path={SOJA_STORE_SECTION_PATHS.compras} element={storeRoute('compras')} />
                <Route path={`${SOJA_STORE_SECTION_PATHS.compras}/:detailId`} element={storeRoute('compras')} />
                <Route path={SOJA_STORE_SECTION_PATHS.importacoes} element={storeRoute('importacoes')} />
                <Route path={SOJA_STORE_SECTION_PATHS.configuracoes} element={storeRoute('configuracoes')} />
              </>
            )}
            <Route path="*" element={<Navigate to={overviewPath} replace />} />
          </Routes>
        </PageTransition>
      </CommissionWorkspaceShell>
    </CommissionLayout>
  );
}
