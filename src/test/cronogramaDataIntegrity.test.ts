import { describe, expect, it } from 'vitest';
import { fenasoja2028CronogramaSeed } from '@/data/fenasoja2028CronogramaSeed';
import { mergeOfficialSeedWithDb } from '@/hooks/useCronogramaEventos';
import { isCentralMeeting, normalizeCronogramaSeed } from '@/lib/cronograma-eventos';

describe('integridade do cronograma oficial', () => {
  it('preserva os totais oficiais por ano e os registros sem data', () => {
    expect(fenasoja2028CronogramaSeed).toHaveLength(145);
    expect(fenasoja2028CronogramaSeed.filter((event) => event.sourceYear === 2026)).toHaveLength(48);
    expect(fenasoja2028CronogramaSeed.filter((event) => event.sourceYear === 2027)).toHaveLength(60);
    expect(fenasoja2028CronogramaSeed.filter((event) => event.sourceYear === 2028)).toHaveLength(37);
    expect(fenasoja2028CronogramaSeed.filter((event) => !event.hasExactDate)).toHaveLength(23);
  });

  it('preserva reuniões centrais, períodos e a realização da Fenasoja 2028', () => {
    const normalized = normalizeCronogramaSeed(fenasoja2028CronogramaSeed);
    const centralMeetings = normalized.filter(isCentralMeeting);
    const mainEvent = fenasoja2028CronogramaSeed.find(
      (event) => event.sourceKey === '2028-realizacao-fenasoja-2028',
    );
    const periodEvents = fenasoja2028CronogramaSeed.filter(
      (event) => event.startDate && event.endDate && event.startDate !== event.endDate,
    );

    expect(centralMeetings).toHaveLength(28);
    expect(periodEvents.length).toBeGreaterThan(0);
    expect(mainEvent).toMatchObject({
      startDate: '2028-04-29',
      endDate: '2028-05-07',
    });
  });

  it('mescla banco e seed sem apagar oficiais ou eventos manuais', () => {
    const official = normalizeCronogramaSeed(fenasoja2028CronogramaSeed);
    const target = official[0];
    const databaseVersion = { ...target, id: 'db-edited', title: 'Título editado no banco' };
    const manual = {
      ...target,
      id: 'db-manual',
      sourceKey: 'manual-test-event',
      title: 'Evento manual preservado',
      isOfficialSeed: false,
    };

    const merged = mergeOfficialSeedWithDb(official, [databaseVersion, manual]);

    expect(merged).toHaveLength(146);
    expect(merged.find((event) => event.sourceKey === target.sourceKey)?.title).toBe('Título editado no banco');
    expect(merged.some((event) => event.sourceKey === 'manual-test-event')).toBe(true);
  });
});
