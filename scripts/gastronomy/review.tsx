import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthProvider';
import { CapabilitiesProvider } from '@/contexts/CapabilitiesProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import CommercialMapPage from '@/features/commercial-map/CommercialMapPage';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';
import '@/index.css';
import '@/styles/tokens.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <AuthProvider><CapabilitiesProvider><TooltipProvider><BrowserRouter>
      <CommercialMapShell><CommercialMapPage /></CommercialMapShell>
      <Toaster />
    </BrowserRouter></TooltipProvider></CapabilitiesProvider></AuthProvider>
  </QueryClientProvider>,
);
