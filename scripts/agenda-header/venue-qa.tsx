// Private browser fixture only; mounts the real shell and notifications Sheet.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '/src/components/ui/tooltip';
import '/src/styles/tokens.css';
import '/src/index.css';

async function start() {
  const { VenueModuleShell } = await import('/src/components/venue-events/VenueModuleShell.tsx');
  await import('/src/styles/venue-events.css');
  await import('/src/styles/venue-events-production.css');
  await import('/src/styles/venue-events-navigation.css');
  await import('/src/styles/venue-event-cards.css');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  createRoot(document.getElementById('venue-qa-root')!).render(
    <QueryClientProvider client={client}><BrowserRouter><TooltipProvider>
      <VenueModuleShell>
        <div style={{ padding: '1rem' }}>Cenário local de validação visual, sem conexão autenticada.</div>
      </VenueModuleShell>
    </TooltipProvider></BrowserRouter></QueryClientProvider>,
  );
}
start().catch(error => { document.getElementById('venue-qa-root')!.textContent = String(error); throw error; });
