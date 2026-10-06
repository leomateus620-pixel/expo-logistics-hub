// Intercepted by browser-qa.cjs only. This is not an app route or entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import '/src/styles/tokens.css';
import '/src/index.css';
import '/src/styles/cronograma-operational-overrides.css';
import '/src/styles/cronograma-mobile.css';
import '/src/styles/cronograma-mobile-overlays.css';

async function start() {
  const { normalizeCronogramaSeed } = await import('/src/lib/cronograma-eventos.ts');
  const common = {
    category: 'Governança e Gestão', eventType: 'reuniao', sourceYear: 2026,
    priority: 'media', hasExactDate: true, startTime: '10:00', endTime: '11:00',
    responsibleName: 'Pessoa de teste', commissionName: 'Comissão de teste',
    description: 'Cenário sintético local, sem gravação ou acesso ao ambiente.',
    isOfficialSeed: false, originSource: 'agenda_central', lockVersion: 1,
  };
  const event = (number: number, title: string, extra: Record<string, unknown>) => ({
    ...common, id: `60000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    sourceKey: `qa-${number}`, title, status: 'planejado', startDate: '2026-10-07',
    endDate: '2026-10-07', ...extra,
  });
  window.__agendaQaEvents = normalizeCronogramaSeed([
    event(1, 'QA sala canônica', { locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS' }),
    event(2, 'QA sala histórica', { locationCode: null, location: '  sála   dos voluntários  ', startDate: '2026-10-08', endDate: '2026-10-08' }),
    event(3, 'QA centro de eventos', { locationCode: 'centro_eventos_fenasoja', location: 'CENTRO DE EVENTOS FENASOJA' }),
    event(4, 'QA código divergente', { locationCode: 'casa_fenasoja', location: 'SALA DOS VOLUNTÁRIOS' }),
    event(5, 'QA nome parcial', { locationCode: null, location: 'ANEXO DA SALA DOS VOLUNTÁRIOS' }),
    event(6, 'QA sala concluída', { locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS', status: 'concluido', startDate: '2026-10-01', endDate: '2026-10-01' }),
    event(7, 'QA sala sem data', { locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS', hasExactDate: false, startDate: null, endDate: null, startTime: null, endTime: null }),
    event(8, 'QA centro concluído', { locationCode: 'centro_eventos_fenasoja', location: 'CENTRO DE EVENTOS FENASOJA', status: 'concluido', startDate: '2026-10-01', endDate: '2026-10-01' }),
    event(9, 'QA outro sem data', { locationCode: 'casa_fenasoja', location: 'CASA FENASOJA', hasExactDate: false, startDate: null, endDate: null }),
    event(10, 'QA sala atrasada', { locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS', startDate: '2026-10-02', endDate: '2026-10-02' }),
    event(11, 'QA centro atrasado', { locationCode: 'centro_eventos_fenasoja', location: 'CENTRO DE EVENTOS FENASOJA', startDate: '2026-10-02', endDate: '2026-10-02' }),
  ]);
  const [{ default: Page }, { CronogramaModuleShell }] = await Promise.all([
    import('/src/pages/CronogramaEventosPage.tsx'),
    import('/src/components/cronograma-eventos/CronogramaModuleShell.tsx'),
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  client.setQueryData(['cronograma-eventos', '50000000-0000-4000-8000-000000000001'], { events: window.__agendaQaEvents, deletedSourceKeys: [] });
  createRoot(document.getElementById('agenda-qa-root')!).render(
    <QueryClientProvider client={client}><BrowserRouter><TooltipProvider>
      <CronogramaModuleShell><Page /></CronogramaModuleShell>
    </TooltipProvider></BrowserRouter></QueryClientProvider>,
  );
}
start().catch(error => { document.getElementById('agenda-qa-root')!.textContent = String(error); throw error; });
