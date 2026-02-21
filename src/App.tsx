import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import OrgGuard from "./components/OrgGuard";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import VehiclesPage from "./pages/VehiclesPage";
import ElectricCartsPage from "./pages/ElectricCartsPage";
import TransportsPage from "./pages/TransportsPage";
import GuestsPage from "./pages/GuestsPage";
import AgendaPage from "./pages/AgendaPage";
import ChecklistPage from "./pages/ChecklistPage";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
                <Route path="/transports" element={<TransportsPage />} />
                <Route path="/guests" element={<GuestsPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/checklist" element={<ChecklistPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </OrgGuard>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
