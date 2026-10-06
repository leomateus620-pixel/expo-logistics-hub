import { describe, expect, it } from 'vitest';
import {
  CRONOGRAMA_PLANNING_SHEETS,
  isPlanningSeedEvent,
  selectAutomaticSeedEvents,
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

  it('keeps historical Center events visible without automatically forwarding them', () => {
    const events = [
      { ...makeEvent('canonical-center', 'Cadastro manual'), locationCode: 'centro_eventos_fenasoja', location: 'Outro texto histórico' },
      { ...makeEvent('legacy-center', 'Cadastro manual'), location: '  centro   de eventos fenasoja  ' },
      { ...makeEvent('volunteers', 'Cadastro manual'), locationCode: 'sala_voluntarios', location: 'SALA DOS VOLUNTÁRIOS' },
    ];
    expect(selectVisibleSeedEvents(events, true)).toEqual(events);
    expect(selectAutomaticSeedEvents(events).map((event) => event.sourceKey)).toEqual(['volunteers']);
  });

  it('uses canonical location rules before automatic seeding, respecting an explicit different code', () => {
    const events = [
      { ...makeEvent('explicit-other', 'Cadastro manual'), locationCode: 'sala_voluntarios', location: 'CENTRO DE EVENTOS FENASOJA' },
      { ...makeEvent('similar-label', 'Cadastro manual'), location: 'CENTRO DE EVENTOS FENASOJA - ANEXO' },
    ];
    expect(selectAutomaticSeedEvents(events)).toEqual(events);
  });
});
