import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthProvider";
import { CapabilitiesProvider } from "./contexts/CapabilitiesProvider";
import AuthGuard from "./components/AuthGuard";
import OrgGuard from "./components/OrgGuard";
import CapabilityGuard from "./components/CapabilityGuard";
import Layout from "./components/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage"));
const ElectricCartsPage = lazy(() => import("./pages/ElectricCartsPage"));
const ElectricCartsReportPage = lazy(() => import("./pages/ElectricCartsReportPage"));
const ScootersPage = lazy(() => import("./pages/ScootersPage"));
const TransportsPage = lazy(() => import("./pages/TransportsPage"));
const GuestsPage = lazy(() => import("./pages/GuestsPage"));
const AgendaPage = lazy(() => import("./pages/AgendaPage"));
const ChecklistPage = lazy(() => import("./pages/ChecklistPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const VerEscalaPage = lazy(() => import("./pages/VerEscalaPage"));
const KmEmissoesPage = lazy(() => import("./pages/KmEmissoesPage"));
const SystemReportPage = lazy(() => import("./pages/SystemReportPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const MobilityAuthPage = lazy(() => import("./pages/MobilityAuthPage"));
const FenasojaEventsPage = lazy(() => import("./pages/FenasojaEventsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'fenasoja-query-cache',
});

const FullAccessRoute = ({ children }: { children: React.ReactNode }) => (
  <CapabilityGuard capability="full_access">{children}</CapabilityGuard>
);

const lastUserId = (typeof window !== 'undefined' && localStorage.getItem('fenasoja-last-user-id')) || 'anon';

const RouteFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

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
              {/* Authenticated app */}
              <Route path="/*" element={
                <AuthGuard>
                  <OrgGuard>
                    <Layout>
                      <Suspense fallback={<RouteFallback />}>
                        <Routes>
                          <Route path="/" element={<FullAccessRoute><Dashboard /></FullAccessRoute>} />
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
                      </Suspense>
                    </Layout>
                  </OrgGuard>
                </AuthGuard>
              } />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </CapabilitiesProvider>
    </AuthProvider>
  </PersistQueryClientProvider>
);

export default App;
