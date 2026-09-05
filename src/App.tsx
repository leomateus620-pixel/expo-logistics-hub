import { Suspense, type ReactNode } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { CapabilitiesProvider } from './contexts/CapabilitiesProvider';
import { useAuth } from './hooks/useAuth';
import { useCapabilities } from './hooks/useCapabilities';
import AuthGuard from './components/AuthGuard';
import OrgGuard from './components/OrgGuard';
import CapabilityGuard from './components/CapabilityGuard';
import Layout from './components/Layout';
import CommissionLayout from './components/commissions/CommissionLayout';
import ModuleAccessGuard from './components/commissions/ModuleAccessGuard';
import { CronogramaModuleShell } from './components/cronograma-eventos/CronogramaModuleShell';
import {
  CronogramaPermissionDenied,
  CronogramaRouteBoundary,
  CronogramaRouteLoading,
} from './components/cronograma-eventos/CronogramaRouteState';
import { VenueModuleShell } from './components/venue-events/VenueModuleShell';
import {
  VenuePermissionDenied,
  VenueRouteBoundary,
  VenueRouteLoading,
} from './components/venue-events/VenueRouteState';
import LoginPage from './pages/LoginPage';
import OAuthConsent from './pages/OAuthConsent';
import { resolveCommissionRouteModule, resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import {
  getCommissionModule,
} from './modules/commissions/commissionRegistry';
import { COMMISSION_MAP_PORTALS, getCommissionMapPortal } from './modules/commissions/commissionMapPortalRegistry';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const VehiclesPage = lazyWithRetry(() => import('./pages/VehiclesPage'));
const ElectricCartsPage = lazyWithRetry(() => import('./pages/ElectricCartsPage'));
const ElectricCartsReportPage = lazyWithRetry(() => import('./pages/ElectricCartsReportPage'));
const ScootersPage = lazyWithRetry(() => import('./pages/ScootersPage'));
const TransportsPage = lazyWithRetry(() => import('./pages/TransportsPage'));
const GuestsPage = lazyWithRetry(() => import('./pages/GuestsPage'));
const AgendaPage = lazyWithRetry(() => import('./pages/AgendaPage'));
const ChecklistPage = lazyWithRetry(() => import('./pages/ChecklistPage'));
const TeamPage = lazyWithRetry(() => import('./pages/TeamPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'));
const VerEscalaPage = lazyWithRetry(() => import('./pages/VerEscalaPage'));
const KmEmissoesPage = lazyWithRetry(() => import('./pages/KmEmissoesPage'));
const SystemReportPage = lazyWithRetry(() => import('./pages/SystemReportPage'));
const ExpensesPage = lazyWithRetry(() => import('./pages/ExpensesPage'));
const MobilityAuthPage = lazyWithRetry(() => import('./pages/MobilityAuthPage'));
const FenasojaEventsPage = lazyWithRetry(() => import('./pages/FenasojaEventsPage'));
const CronogramaEventosPage = lazyWithRetry(() => import('./pages/CronogramaEventosPage'));
const VenueEventsPage = lazyWithRetry(() => import('./pages/VenueEventsPage'));
const GoogleCalendarCallbackPage = lazyWithRetry(() => import('./pages/GoogleCalendarCallbackPage'));
const FenasojaCountdownExperiencePage = lazyWithRetry(
  () => import('./pages/FenasojaCountdownExperiencePage'),
);
const CommercialMapPage = lazyWithRetry(() => import('./pages/CommercialMapPage'));
const CommercialMapRenderingDiagnosticsPage = import.meta.env.DEV
  ? lazyWithRetry(() => import('./features/commercial-map/diagnostics/CommercialMapRenderingDiagnosticsPage'))
  : null;
const CommercialMapInterfaceDiagnosticsPage = import.meta.env.DEV
  ? lazyWithRetry(() => import('./features/commercial-map/diagnostics/CommercialMapInterfaceDiagnosticsPage'))
  : null;
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const UnsubscribePage = lazyWithRetry(() => import('./pages/UnsubscribePage'));
const CommissionPortalPage = lazyWithRetry(() => import('./pages/commissions/CommissionPortalPage'));
const CommissionDashboardPlaceholder = lazyWithRetry(() => import('./pages/commissions/CommissionDashboardPlaceholder'));
const CommissionFrontPage = lazyWithRetry(() => import('./pages/commissions/CommissionFrontPage'));
const FinancialManagementPage = lazyWithRetry(() => import('./pages/commissions/FinancialManagementPage'));
const CommissionCommercialMapPage = lazyWithRetry(() => import('./pages/commissions/CommissionCommercialMapPage'));
const AdminPortalPage = lazyWithRetry(() => import('./pages/admin/AdminPortalPage'));
const AdminOverviewPage = lazyWithRetry(() => import('./pages/admin/AdminOverviewPage'));
const AdminCommissionPage = lazyWithRetry(() => import('./pages/admin/AdminCommissionPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

function safeStorage(): Storage {
  try {
    const t = '__fenasoja_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k, v) => {
        mem.set(k, String(v));
      },
      removeItem: (k) => {
        mem.delete(k);
      },
      clear: () => {
        mem.clear();
      },
      key: (i) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    } as Storage;
  }
}

const persister = createSyncStoragePersister({
  storage: safeStorage(),
  key: 'fenasoja-query-cache',
});

const FullAccessRoute = ({ children }: { children: ReactNode }) => (
  <CapabilityGuard capability="full_access">{children}</CapabilityGuard>
);

let lastUserId = 'anon';
try {
  if (typeof window !== 'undefined') {
    lastUserId = window.localStorage.getItem('fenasoja-last-user-id') || 'anon';
  }
} catch {
  lastUserId = 'anon';
}

const RouteFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

function Suspended({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function AuthenticatedLogisticsLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <OrgGuard>
        <Layout>
          <Suspended>{children}</Suspended>
        </Layout>
      </OrgGuard>
    </AuthGuard>
  );
}

function RootRoute() {
  const { user, loading } = useAuth();
  const { hasFullAccess, hasCapability, isLoading: capabilitiesLoading } = useCapabilities();

  if (loading || (!!user && capabilitiesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspended>
        <CommissionPortalPage />
      </Suspended>
    );
  }

  if (!hasFullAccess && hasCapability('map.view')) {
    return <Navigate to="/mapa-comercial" replace />;
  }

  // Restricted users whose only map access comes from a commission portal
  // (e.g. Exporural president) land on that portal's scoped commercial map.
  if (!hasFullAccess) {
    const mapPortal = COMMISSION_MAP_PORTALS.find((portal) => hasCapability(portal.capability));
    if (mapPortal) {
      return <Navigate to={mapPortal.mapPath} replace />;
    }
  }

  return (
    <Suspended>
      <CommissionPortalPage />
    </Suspended>
  );
}


function CommercialMapRoute() {
  return (
    <AuthGuard>
      <OrgGuard>
        <CapabilityGuard capability="map.view">
          <Suspended>
            <CommercialMapPage />
          </Suspended>
        </CapabilityGuard>
      </OrgGuard>
    </AuthGuard>
  );
}

function LogisticaModuleRoutes() {
  const logistica = getCommissionModule('logistica');

  return (
    <AuthGuard>
      <OrgGuard>
        <ModuleAccessGuard module={logistica}>
          <Layout>
            <Suspended>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="transportes" element={<TransportsPage />} />
                <Route path="veiculos" element={<VehiclesPage />} />
                <Route path="carrinhos-eletricos" element={<ElectricCartsPage />} />
                <Route path="hospedes" element={<GuestsPage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="checklist" element={<ChecklistPage />} />
                <Route path="equipe" element={<TeamPage />} />
                <Route path="despesas" element={<ExpensesPage />} />
                <Route path="relatorio" element={<SystemReportPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspended>
          </Layout>
        </ModuleAccessGuard>
      </OrgGuard>
    </AuthGuard>
  );
}

function CommissionModuleRoutes() {
  const { moduleSlug } = useParams();
  const module = resolveCommissionRouteModule(moduleSlug);
  const officialUnit = resolveOfficialUnit(moduleSlug);
  const isDerivedFront = Boolean(officialUnit && !officialUnit.reusesExistingModule);
  const mapPortal = getCommissionMapPortal(moduleSlug);

  if (!module) {
    return (
      <Suspended>
        <NotFound />
      </Suspended>
    );
  }

  if (module.slug === 'logistica') {
    return <Navigate to="/comissoes/logistica/dashboard" replace />;
  }

  if (mapPortal) {
    return (
      <AuthGuard>
        <OrgGuard>
          <ModuleAccessGuard module={module}>
            <CommissionLayout module={module} variant="map">
              <Suspended>
                <Routes>
                  <Route index element={<Navigate to="mapa-comercial" replace />} />
                  <Route
                    path="mapa-comercial"
                    element={<CommissionCommercialMapPage portal={mapPortal} />}
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspended>
            </CommissionLayout>
          </ModuleAccessGuard>
        </OrgGuard>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <OrgGuard>
        <ModuleAccessGuard module={module}>
          <CommissionLayout module={module}>
            <Suspended>
              {module.slug === 'financeiro-gerencial' ? (
                <FinancialManagementPage module={module} />
              ) : isDerivedFront && officialUnit ? (
                <CommissionFrontPage module={module} entry={officialUnit.entry} />
              ) : (
                <CommissionDashboardPlaceholder module={module} />
              )}
            </Suspended>
          </CommissionLayout>
        </ModuleAccessGuard>
      </OrgGuard>
    </AuthGuard>
  );
}

function AdminRoutes() {
  return (
    <AuthGuard>
      <OrgGuard>
        <ModuleAccessGuard adminArea>
          <Suspended>
            <Routes>
              <Route index element={<AdminPortalPage />} />
              <Route path="geral" element={<AdminOverviewPage />} />
              <Route path="comissoes/:moduleSlug" element={<AdminCommissionPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspended>
        </ModuleAccessGuard>
      </OrgGuard>
    </AuthGuard>
  );
}

function CronogramaModuleRoute() {
  return (
    <CronogramaRouteBoundary>
      <AuthGuard>
        <OrgGuard>
          <CapabilityGuard capability="cronograma_eventos_access" fallback={<CronogramaPermissionDenied />}>
            <CronogramaModuleShell>
              <Suspense fallback={<CronogramaRouteLoading />}>
                <CronogramaEventosPage />
              </Suspense>
            </CronogramaModuleShell>
          </CapabilityGuard>
        </OrgGuard>
      </AuthGuard>
    </CronogramaRouteBoundary>
  );
}

function CronogramaCountdownExperienceRoute() {
  return (
    <CronogramaRouteBoundary>
      <AuthGuard>
        <OrgGuard>
          <CapabilityGuard capability="cronograma_eventos_access" fallback={<CronogramaPermissionDenied />}>
            <Suspense fallback={<CronogramaRouteLoading label="Preparando a Contagem Oficial…" />}>
              <FenasojaCountdownExperiencePage />
            </Suspense>
          </CapabilityGuard>
        </OrgGuard>
      </AuthGuard>
    </CronogramaRouteBoundary>
  );
}

function VenueEventsModuleRoute() {
  return (
    <VenueRouteBoundary>
      <AuthGuard>
        <OrgGuard>
          <CapabilityGuard capability="venue_events_access" fallback={<VenuePermissionDenied />}>
            <VenueModuleShell>
              <Suspense fallback={<VenueRouteLoading />}>
                <VenueEventsPage />
              </Suspense>
            </VenueModuleShell>
          </CapabilityGuard>
        </OrgGuard>
      </AuthGuard>
    </VenueRouteBoundary>
  );
}

function LegacyLogisticsRoutes() {
  return (
    <AuthenticatedLogisticsLayout>
      <Routes>
        <Route path="/dashboard" element={<FullAccessRoute><Dashboard /></FullAccessRoute>} />
        <Route path="/vehicles" element={<FullAccessRoute><VehiclesPage /></FullAccessRoute>} />
        <Route path="/electric-carts" element={<FullAccessRoute><ElectricCartsPage /></FullAccessRoute>} />
        <Route path="/electric-carts/report" element={<FullAccessRoute><ElectricCartsReportPage /></FullAccessRoute>} />
        <Route path="/scooters" element={<FullAccessRoute><ScootersPage /></FullAccessRoute>} />
        <Route path="/transports" element={<FullAccessRoute><TransportsPage /></FullAccessRoute>} />
        <Route path="/guests" element={<FullAccessRoute><GuestsPage /></FullAccessRoute>} />
        <Route path="/agenda" element={<FullAccessRoute><AgendaPage /></FullAccessRoute>} />
        <Route path="/fenasoja-events" element={<FullAccessRoute><FenasojaEventsPage /></FullAccessRoute>} />
        <Route path="/checklist" element={<FullAccessRoute><ChecklistPage /></FullAccessRoute>} />
        <Route path="/team" element={<FullAccessRoute><TeamPage /></FullAccessRoute>} />
        <Route path="/ver-escala" element={<FullAccessRoute><VerEscalaPage /></FullAccessRoute>} />
        <Route path="/km-emissoes" element={<FullAccessRoute><KmEmissoesPage /></FullAccessRoute>} />
        <Route path="/settings" element={<FullAccessRoute><SettingsPage /></FullAccessRoute>} />
        <Route path="/system-report" element={<FullAccessRoute><SystemReportPage /></FullAccessRoute>} />
        <Route path="/expenses" element={<FullAccessRoute><ExpensesPage /></FullAccessRoute>} />
        <Route path="/mobility-auth" element={
          <CapabilityGuard capability="mobility_access"><MobilityAuthPage /></CapabilityGuard>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthenticatedLogisticsLayout>
  );
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24,
      buster: lastUserId,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.meta?.persist !== false && defaultShouldDehydrateQuery(query),
      },
    }}
  >
    <AuthProvider>
      <CapabilitiesProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/portal" element={<Suspended><CommissionPortalPage /></Suspended>} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/unsubscribe" element={<Suspended><UnsubscribePage /></Suspended>} />
              <Route path="/login/admin" element={<LoginPage />} />
              <Route path="/login/:moduleSlug" element={<LoginPage />} />
              <Route path="/google-calendar/callback" element={<Suspended><GoogleCalendarCallbackPage /></Suspended>} />
              <Route path="/admin/*" element={<AdminRoutes />} />
              <Route
                path="/cronograma-eventos/contagem-oficial"
                element={<CronogramaCountdownExperienceRoute />}
              />
              <Route path="/cronograma-eventos" element={<CronogramaModuleRoute />} />
              <Route path="/eventos-restaurante-arena" element={<VenueEventsModuleRoute />} />
              <Route path="/eventos-restaurante-arena/:venueSlug" element={<VenueEventsModuleRoute />} />
              <Route path="/eventos-restaurante-arena/:venueSlug/:viewSlug" element={<VenueEventsModuleRoute />} />
              <Route path="/mapa-comercial" element={<CommercialMapRoute />} />
              {CommercialMapInterfaceDiagnosticsPage && (
                <Route path="/__dev/commercial-map-interface" element={<Suspended><CommercialMapInterfaceDiagnosticsPage /></Suspended>} />
              )}
              {CommercialMapRenderingDiagnosticsPage && (
                <Route
                  path="/__dev/commercial-map-rendering"
                  element={<Suspended><CommercialMapRenderingDiagnosticsPage /></Suspended>}
                />
              )}
              <Route path="/comissoes/logistica/*" element={<LogisticaModuleRoutes />} />
              <Route path="/comissoes/:moduleSlug/*" element={<CommissionModuleRoutes />} />
              <Route path="/*" element={<LegacyLogisticsRoutes />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </CapabilitiesProvider>
    </AuthProvider>
  </PersistQueryClientProvider>
);

export default App;
