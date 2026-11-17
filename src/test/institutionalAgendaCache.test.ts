import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, auth: {} } }));
import { fetchCronogramaDatasetForOrg, cronogramaEventsQueryKey } from '@/hooks/useCronogramaEventos';
import { invalidateInstitutionalAgendas } from '@/lib/institutional-agenda-cache';

describe('institutional agenda pagination and authorization cache', () => {
  it('reads every authorized row beyond 1000 and all deletion markers', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: `event-${i}`, source_key: `key-${i}`, title: `Evento ${i}`, source_year: 2028, start_date: '2028-05-01', status: 'planejado', category: 'agenda', event_type: 'reuniao' }));
    const ranges: Array<[string, number, number]> = [];
    from.mockImplementation((table: string) => {
      const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
      for (const key of ['select', 'eq', 'order'] as const) query[key].mockReturnValue(query);
      query.range.mockImplementation(async (start: number, end: number) => {
        ranges.push([table, start, end]);
        return { data: (table === 'cronograma_eventos_full' ? rows : [{ source_key: 'deleted' }]).slice(start, end + 1), error: null };
      });
      return query;
    });
    const result = await fetchCronogramaDatasetForOrg('org-a');
    expect(result.events).toHaveLength(1201);
    expect(result.deletedSourceKeys).toEqual(['deleted']);
    expect(ranges).toContainEqual(['cronograma_eventos_full', 1000, 1499]);
    expect(cronogramaEventsQueryKey('org-a', 'user-a')).not.toEqual(cronogramaEventsQueryKey('org-a', 'user-b'));
  });
  it('invalidates current, added and removed units while preserving another organization', async () => {
    const client = new QueryClient();
    const keys = ['current', 'added', 'removed'].flatMap(unit => [['unit-agenda', 'org-a', 'user', unit], ['unit-metrics', 'org-a', 'user', unit]]);
    keys.push(['cronograma-eventos', 'org-a', 'user']);
    keys.forEach(key => client.setQueryData(key, []));
    const foreign = ['unit-agenda', 'org-b', 'other-user', 'foreign'];
    client.setQueryData(foreign, []);
    await invalidateInstitutionalAgendas(client, 'org-a');
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    client.clear();
  });
});
