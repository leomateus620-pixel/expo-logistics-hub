import { describe, expect, it } from 'vitest';
import { visualEventToDraft, visualEventToSourceUpdates } from '@/components/cronograma-eventos/modelAdapter';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

const baseEvent: CronogramaEvent = {
  id: 'evt-1',
  title: 'Reunião da Comissão Central',
  summary: '',
  date: '2028-04-10',
  year: 2028,
  category: 'governanca',
  status: 'planned',
  priority: 'medium',
  kind: 'meeting',
  commissionsRel: [],
  responsiblesRel: [],
};

describe('público dos avisos de evento', () => {
  it('novo evento nasce restrito às lideranças e relacionados', () => {
    expect(visualEventToDraft(baseEvent).notifyAllCommissionMembers).toBe(false);
  });

  it('a opção de avisar toda a comissão é preservada ao salvar', () => {
    const event = { ...baseEvent, notifyAllCommissionMembers: true };
    expect(visualEventToDraft(event).notifyAllCommissionMembers).toBe(true);
    const updates = visualEventToSourceUpdates(event, {
      commissionSlug: null,
      commissionName: null,
      sourceNote: null,
      linkedCommissions: [],
      commissionsRel: [],
      responsiblesRel: [],
    } as never);
    expect(updates.notifyAllCommissionMembers).toBe(true);
  });
});
