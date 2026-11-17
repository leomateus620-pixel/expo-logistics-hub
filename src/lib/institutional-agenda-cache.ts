import type { QueryClient } from '@tanstack/react-query';

/** Revalidate added AND removed units, including inactive cached workspaces. */
export async function invalidateInstitutionalAgendas(client: QueryClient, orgId?: string | null) {
  await Promise.all([
    ...['unit-agenda', 'unit-metrics', 'cronograma-eventos', 'cronograma-agenda-access', 'venue-operations', 'restaurant-event-alert']
      .map(key => client.invalidateQueries({ queryKey: orgId ? [key, orgId] : [key] })),
    client.invalidateQueries({ queryKey: ['notifications'] }),
  ]);
}
