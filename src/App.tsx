import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import OrgGuard from "./components/OrgGuard";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import VehiclesPage from "./pages/VehiclesPage";
import ElectricCartsPage from "./pages/ElectricCartsPage";
import ScootersPage from "./pages/ScootersPage";
import TransportsPage from "./pages/TransportsPage";
import GuestsPage from "./pages/GuestsPage";
import AgendaPage from "./pages/AgendaPage";
import ChecklistPage from "./pages/ChecklistPage";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import VerEscalaPage from "./pages/VerEscalaPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h — keep in cache for offline
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'fenasoja-query-cache',
});

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGuard>
          <OrgGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/vehicles" element={<VehiclesPage />} />
                <Route path="/electric-carts" element={<ElectricCartsPage />} />
                <Route path="/scooters" element={<ScootersPage />} />
                <Route path="/transports" element={<TransportsPage />} />
                <Route path="/guests" element={<GuestsPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/checklist" element={<ChecklistPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/ver-escala" element={<VerEscalaPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </OrgGuard>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
