import { lazy, Suspense, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { CapabilitiesProvider } from './contexts/CapabilitiesProvider';
import { useAuth } from './hooks/useAuth';
import AuthGuard from './components/AuthGuard';
import OrgGuard from './components/OrgGuard';
import CapabilityGuard from './components/CapabilityGuard';
import Layout from './components/Layout';
import CommissionLayout from './components/commissions/CommissionLayout';
import ModuleAccessGuard from './components/commissions/ModuleAccessGuard';
import LoginPage from './pages/LoginPage';
import {
  getCommissionModule,
} from './modules/commissions/commissionRegistry';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage'));
const ElectricCartsPage = lazy(() => import('./pages/ElectricCartsPage'));
const ElectricCartsReportPage = lazy(() => import('./pages/ElectricCartsReportPage'));
const ScootersPage = lazy(() => import('./pages/ScootersPage'));
const TransportsPage = lazy(() => import('./pages/TransportsPage'));
const GuestsPage = lazy(() => import('./pages/GuestsPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const ChecklistPage = lazy(() => import('./pages/ChecklistPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const VerEscalaPage = lazy(() => import('./pages/VerEscalaPage'));
const KmEmissoesPage = lazy(() => import('./pages/KmEmissoesPage'));
const SystemReportPage = lazy(() => import('./pages/SystemReportPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const MobilityAuthPage = lazy(() => import('./pages/MobilityAuthPage'));
const FenasojaEventsPage = lazy(() => import('./pages/FenasojaEventsPage'));
const CronogramaEventosPage = lazy(() => import('./pages/CronogramaEventosPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const CommissionPortalPage = lazy(() => import('./pages/commissions/CommissionPortalPage'));
const CommissionDashboardPlaceholder = lazy(() => import('./pages/commissions/CommissionDashboardPlaceholder'));
const AdminPortalPage = lazy(() => import('./pages/admin/AdminPortalPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminCommissionPage = lazy(() => import('./pages/admin/AdminCommissionPage'));

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

  if (loading) {
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

  return (
    <AuthenticatedLogisticsLayout>
      <FullAccessRoute>
        <Dashboard />
      </FullAccessRoute>
    </AuthenticatedLogisticsLayout>
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
  const module = getCommissionModule(moduleSlug);

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

  return (
    <AuthGuard>
      <OrgGuard>
        <ModuleAccessGuard module={module}>
          <CommissionLayout module={module}>
            <Suspended>
              <CommissionDashboardPlaceholder module={module} />
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
        <Route path="/cronograma-eventos" element={<FullAccessRoute><CronogramaEventosPage /></FullAccessRoute>} />
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
    persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: lastUserId }}
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
              <Route path="/login/admin" element={<LoginPage />} />
              <Route path="/login/:moduleSlug" element={<LoginPage />} />
              <Route path="/admin/*" element={<AdminRoutes />} />
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
