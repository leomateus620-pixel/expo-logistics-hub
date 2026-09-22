import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PortalPrimaryEntry } from '@/components/portal/PortalPrimaryEntry';
import { portalPrimaryEntries } from '@/modules/portal/portalRegistry';
import { commercialMapPrewarmTasks, createCommercialMapPrewarm } from '../utils/commercialMapPrewarm';
import type { CommercialMapPrewarmSnapshot } from '../utils/commercialMapPrewarm';

declare global {
  interface Window { __commercialMapPrewarmQa?: { snapshot: () => CommercialMapPrewarmSnapshot; activateAt?: number } }
}

/** Same admission scheduler, code loaders, worker and entry control as Portal.
 * Explicit fixture override: no authentication, permission or network SLA claim. */
export default function CommercialMapPrewarmDiagnosticsPage() {
  const queryClient = useQueryClient();
  const controller = useRef<ReturnType<typeof createCommercialMapPrewarm>>();
  const policy = new URLSearchParams(window.location.search).get('policy') ?? 'idle';
  const quality = new URLSearchParams(window.location.search).get('qualityQa');
  const qualityQuery = quality && ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].includes(quality) ? `&qualityQa=${quality}` : '';
  useEffect(() => {
    const tasks = commercialMapPrewarmTasks(queryClient, 'qa-fixture', 'qa-fixture');
    const job = createCommercialMapPrewarm({ authorized: () => true, tasks: {
      ...tasks,
      async data(record, signal) {
        const fixture = await import('./commercialMapDiagnosticsData');
        if (signal.aborted) throw new DOMException('QA cancelled', 'AbortError');
        await queryClient.prefetchQuery({ queryKey: fixture.DIAGNOSTICS_DATA_QUERY_KEY, queryFn: async () => fixture.DIAGNOSTICS_MAP_DATA,
          staleTime: 30_000, gcTime: 600_000, meta: { persist: false } });
        record('fixture-data-ready', { privateQuery: false });
      },
    } });
    controller.current = job;
    window.__commercialMapPrewarmQa = { snapshot: job.snapshot };
    if (policy === 'idle') job.schedule();
    return () => { job.dispose({ abortRunning: !job.snapshot().handedOff }); controller.current = undefined; };
  }, [policy, queryClient]);
  const entry = portalPrimaryEntries.find(value => value.id === 'mapa-comercial')!;
  return <main style={{ padding: 32, maxWidth: 720, margin: 'auto' }}>
    <h1>Diagnóstico de preparação do mapa</h1>
    <p>Fixture local. Não mede autenticação, permissões ou consulta comercial remota.</p>
    <PortalPrimaryEntry entry={entry} index={0} access={{ state: 'allowed', label: 'Fixture de diagnóstico',
      target: `/__dev/commercial-map-rendering?persistedStage=1${qualityQuery}` }}
      onIntent={() => { if (policy !== 'none') controller.current?.promote(); }}
      onSelect={() => {
        if (window.__commercialMapPrewarmQa) window.__commercialMapPrewarmQa.activateAt = performance.now();
        controller.current?.handoff();
      }} />
  </main>;
}
