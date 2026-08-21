import { describe, expect, it } from 'vitest';
import {
  CRONOGRAMA_PLANNING_SHEETS,
  isPlanningSeedEvent,
  selectVisibleSeedEvents,
} from '@/hooks/useCronogramaEventos';
import type { CronogramaEvent } from '@/lib/cronograma-eventos';

const planningSheets = Array.from(CRONOGRAMA_PLANNING_SHEETS);

function makeEvent(sourceKey: string, sourceSheet: string): CronogramaEvent {
  return {
    id: sourceKey,
    sourceKey,
    sourceSheet,
    sourceYear: 2026,
    title: sourceKey,
    description: '',
    startDate: '2026-07-01',
    endDate: null,
    hasExactDate: true,
    category: 'governanca',
    eventType: 'reuniao',
    status: 'planejado',
    priority: 'media',
    isOfficialSeed: true,
  } as unknown as CronogramaEvent;
}

describe('escopo de planejamento (planilhas anuais)', () => {
  it('reconhece as três planilhas anuais como material de planejamento', () => {
    expect(planningSheets).toHaveLength(3);
    for (const sheet of planningSheets) {
      expect(isPlanningSeedEvent({ sourceSheet: sheet })).toBe(true);
    }
    expect(isPlanningSeedEvent({ sourceSheet: 'Cadastro manual' })).toBe(false);
    expect(isPlanningSeedEvent({})).toBe(false);
  });

  it('remove os eventos de planilha para quem não é do grupo de planejamento', () => {
    const events = [
      ...planningSheets.map((sheet, index) => makeEvent(`planilha-${index}`, sheet)),
      makeEvent('manual-1', 'Cadastro manual'),
    ];
    const visible = selectVisibleSeedEvents(events, false);
    expect(visible.map((event) => event.sourceKey)).toEqual(['manual-1']);
  });

  it('mantém todos os eventos para Cléo e Zélia (grupo de planejamento)', () => {
    const events = [
      makeEvent('planilha-2027', planningSheets[1]),
      makeEvent('manual-1', 'Cadastro manual'),
    ];
    expect(selectVisibleSeedEvents(events, true)).toHaveLength(2);
  });

  it('não deixa nenhum evento de planilha ser reinserido no auto-seed', () => {
    const seed = planningSheets.map((sheet, index) => makeEvent(`planilha-${index}`, sheet));
    expect(selectVisibleSeedEvents(seed, false)).toHaveLength(0);
  });
});
