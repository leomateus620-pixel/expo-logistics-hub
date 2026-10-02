import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@/styles/tokens.css';
import '@/index.css';
import '@/styles/cronograma-operational-overrides.css';
import '@/styles/cronograma-mobile.css';
import '@/styles/cronograma-mobile-overlays.css';
import CommissionAgendaPreviewPage from '@/features/commission-agenda/dev/CommissionAgendaPreviewPage';
import { FIXTURE_EVENTS } from '@/features/commission-agenda/fixtures/agenda.fixtures';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import { getCommissionModule } from '@/modules/commissions/commissionRegistry';

(window as Window & { __commissionQaFixtures?: unknown }).__commissionQaFixtures = FIXTURE_EVENTS;
const root = createRoot(document.getElementById('root')!);
const params = new URLSearchParams(location.search);
const excluded = params.get('excluded');
if (excluded === 'standard' || excluded === 'map') {
  root.render(<BrowserRouter><CommissionLayout module={getCommissionModule('logistica')!} variant={excluded === 'map' ? 'map' : 'standard'}>
    <section aria-label="Conteúdo estável para comparação visual"><h1>Logística</h1><p>Verificação da apresentação compartilhada existente.</p></section>
  </CommissionLayout></BrowserRouter>);
} else if (excluded === 'agenda-reference') {
  (async () => {
    // Match the reference cascade explicitly; parallel CSS imports are racy.
    await import('@/styles/cronograma-command-layer.css');
    const board = await import('@/components/cronograma-eventos/CronogramaTimelineBoard');
    const data = await import('@/components/cronograma-eventos/cronogramaData');
    await import('@/styles/cronograma-mobile-refit.css');
    await import('@/styles/cronograma-timeline-recovery.css');
    await import('@/styles/cronograma-timeline-flagship.css');
    await import('@/styles/cronograma-harvest-completion.css');
    await import('@/styles/cronograma-dashboard.css');
    await import('@/styles/agenda-meeting-intelligence.css');
    await import('@/styles/cronograma-refino.css');
    if (params.get('mobile') === '1') {
      const mobile = await import('@/components/cronograma-eventos/mobile/MobileCronogramaTimeline');
      root.render(<BrowserRouter><main className="cronograma-page min-h-screen" data-presentation="mobile"><div className="cronograma-mobile-experience mx-auto flex w-full min-w-0 flex-col gap-2.5 overflow-x-clip px-3"><mobile.MobileCronogramaTimeline events={data.officialCronogramaEvents} onOpen={() => undefined} onClearFilters={() => undefined} todayKey="2026-09-11" /></div></main></BrowserRouter>);
    } else root.render(<BrowserRouter><main className="cronograma-page min-h-screen" data-presentation="desktop"><div className="cronograma-workbench flex w-full gap-4"><div className="cronograma-sidenav" aria-hidden="true" /><div className="cronograma-workbench__content flex min-w-0 flex-1 flex-col gap-3"><board.CronogramaTimelineBoard events={data.officialCronogramaEvents} onOpen={() => undefined} onClearFilters={() => undefined} todayKey="2026-09-11" /></div></div></main></BrowserRouter>);
  })();
} else root.render(<BrowserRouter><CommissionAgendaPreviewPage /></BrowserRouter>);
