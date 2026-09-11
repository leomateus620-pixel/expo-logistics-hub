import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  enumerateEventLifecycleDays,
  enumerateLifecycleDailyDays,
  isClosedEventStatus,
  isMultiDayEvent,
  LIFECYCLE_DAILY_HOUR,
  LIFECYCLE_TYPE_BY_STATE,
  lifecycleDayFor,
  localDateString,
  localHourInstant,
  normalizeEventRange,
} from '../../supabase/functions/_shared/eventLifecycle';
import {
  buildEventLifecycleMessage,
  buildEventPushMessage,
  displayUpper,
} from '../../supabase/functions/_shared/pushMessage';
import { toDisplayUpper } from '@/lib/textNormalize';

const EVENT_ID = 'event-123';
const USER_ID = 'user-456';

function key(state: keyof typeof LIFECYCLE_TYPE_BY_STATE, date: string) {
  return `${USER_ID}|${EVENT_ID}|${LIFECYCLE_TYPE_BY_STATE[state]}|${date}|push`;
}

describe('ciclo de vida de eventos de vários dias', () => {
  it('evento de um dia mantém apenas o estado inicial', () => {
    const days = enumerateEventLifecycleDays('2026-09-11', '2026-09-11');
    expect(days).toHaveLength(1);
    expect(days[0].state).toBe('START');
    expect(enumerateLifecycleDailyDays('2026-09-11', null)).toHaveLength(0);
    expect(isMultiDayEvent('2026-09-11', null)).toBe(false);
  });

  it('evento de 2 dias tem início e último dia', () => {
    const days = enumerateEventLifecycleDays('2026-09-11', '2026-09-12');
    expect(days.map((day) => day.state)).toEqual(['START', 'FINAL_DAY']);
  });

  it('evento de 5 dias tem início, três dias em andamento e último dia', () => {
    const days = enumerateEventLifecycleDays('2026-09-11', '2026-09-15');
    expect(days.map((day) => day.state)).toEqual([
      'START', 'ONGOING', 'ONGOING', 'ONGOING', 'FINAL_DAY',
    ]);
    expect(days.map((day) => day.date)).toEqual([
      '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
    ]);
    expect(days.every((day) => day.totalDays === 5)).toBe(true);
  });

  it('normaliza fim inválido (antes do início) como evento de um dia', () => {
    expect(normalizeEventRange('2026-09-11', '2026-09-05')).toEqual({
      start: '2026-09-11', end: '2026-09-11', totalDays: 1,
    });
  });

  it('atravessa mês e ano corretamente', () => {
    const crossMonth = enumerateEventLifecycleDays('2026-04-28', '2026-05-02');
    expect(crossMonth.map((day) => day.date)).toEqual([
      '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02',
    ]);
    const crossYear = enumerateEventLifecycleDays('2026-12-30', '2027-01-02');
    expect(crossYear).toHaveLength(4);
    expect(crossYear.at(-1)).toMatchObject({ date: '2027-01-02', state: 'FINAL_DAY' });
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('agenda o aviso diário às 07:00 de Brasília, inclusive na virada de horário', () => {
    const instant = localHourInstant('2026-09-12', LIFECYCLE_DAILY_HOUR)!;
    expect(localDateString(instant)).toBe('2026-09-12');
    expect(instant.toISOString()).toBe('2026-09-12T10:00:00.000Z');
    // Data local nunca deve ser derivada de UTC: 23h local ainda é o mesmo dia.
    const lateNight = localHourInstant('2026-09-12', 23)!;
    expect(localDateString(lateNight)).toBe('2026-09-12');
  });
});

describe('idempotência das entregas', () => {
  it('mesma pessoa, evento, tipo e dia gera sempre a mesma chave', () => {
    expect(key('ONGOING', '2026-09-12')).toBe(key('ONGOING', '2026-09-12'));
    expect(key('ONGOING', '2026-09-12')).toBe('user-456|event-123|event_ongoing|2026-09-12|push');
    expect(key('FINAL_DAY', '2026-09-15')).toBe('user-456|event-123|event_final_day|2026-09-15|push');
  });

  it('agendador rodando duas vezes, retentativa ou reinício produzem chaves idênticas', () => {
    const firstRun = enumerateLifecycleDailyDays('2026-09-11', '2026-09-15')
      .map((day) => key(day.state, day.date));
    const secondRun = enumerateLifecycleDailyDays('2026-09-11', '2026-09-15')
      .map((day) => key(day.state, day.date));
    expect(secondRun).toEqual(firstRun);
    expect(new Set(firstRun).size).toBe(firstRun.length);
  });

  it('um único aviso de ciclo por dia', () => {
    const dates = enumerateLifecycleDailyDays('2026-09-11', '2026-09-15').map((day) => day.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('vários destinatários e vários aparelhos não multiplicam a chave do dia', () => {
    const recipients = ['user-1', 'user-2'];
    const keys = recipients.map((user) => `${user}|${EVENT_ID}|event_ongoing|2026-09-12|push`);
    expect(new Set(keys).size).toBe(2);
    // O mesmo usuário em dois aparelhos continua com uma única entrega.
    expect(keys[0]).toBe(`user-1|${EVENT_ID}|event_ongoing|2026-09-12|push`);
  });
});

describe('edição, cancelamento e conclusão', () => {
  it('encurtar de 5 para 3 dias remove os dias 14 e 15', () => {
    const before = enumerateLifecycleDailyDays('2026-09-11', '2026-09-15').map((d) => d.date);
    const after = enumerateLifecycleDailyDays('2026-09-11', '2026-09-13').map((d) => d.date);
    expect(before).toContain('2026-09-15');
    expect(after).toEqual(['2026-09-12', '2026-09-13']);
    const obsolete = before.filter((date) => !after.includes(date));
    expect(obsolete).toEqual(['2026-09-14', '2026-09-15']);
  });

  it('estender de 3 para 6 dias torna os novos dias elegíveis', () => {
    const after = enumerateLifecycleDailyDays('2026-09-11', '2026-09-16').map((d) => d.date);
    expect(after).toContain('2026-09-16');
    expect(lifecycleDayFor('2026-09-11', '2026-09-16', '2026-09-16')?.state).toBe('FINAL_DAY');
  });

  it('dia fora do intervalo atual não resolve mais para nenhum estado', () => {
    expect(lifecycleDayFor('2026-09-11', '2026-09-13', '2026-09-15')).toBeNull();
  });

  it('evento cancelado, concluído ou arquivado interrompe o ciclo', () => {
    for (const status of ['cancelado', 'cancelled', 'concluido', 'completed', 'arquivado']) {
      expect(isClosedEventStatus(status)).toBe(true);
    }
    expect(isClosedEventStatus('planejado')).toBe(false);
  });
});

describe('conteúdo do aviso', () => {
  it('dia intermediário mostra o índice do dia e o encerramento', () => {
    const message = buildEventLifecycleMessage({
      state: 'ONGOING',
      eventTitle: 'Entrevista Rádio Regional - Soltis - Selo ONU',
      eventId: EVENT_ID,
      dayIndex: 3,
      totalDays: 5,
      endDateLabel: '15 SET',
      endTimeLabel: '18h',
      location: 'Sede FENASOJA',
    });
    expect(message.title).toBe('Evento em andamento: ENTREVISTA RÁDIO REGIONAL - SOLTIS - SELO ONU');
    expect(message.body).toBe('Dia 3 de 5 · Encerra em 15 SET · 18h · Sede FENASOJA');
    expect(message.path).toBe(`/cronograma?event=${EVENT_ID}`);
  });

  it('véspera do fim avisa que encerra amanhã', () => {
    const message = buildEventLifecycleMessage({
      state: 'ONGOING',
      eventTitle: 'Evento X',
      eventId: EVENT_ID,
      dayIndex: 4,
      totalDays: 5,
      endDateLabel: '15 SET',
      endTimeLabel: '18h',
    });
    expect(message.body).toBe('Dia 4 de 5 · Encerra amanhã às 18h');
  });

  it('último dia tem mensagem própria', () => {
    const message = buildEventLifecycleMessage({
      state: 'FINAL_DAY',
      eventTitle: 'Evento X',
      eventId: EVENT_ID,
      dayIndex: 5,
      totalDays: 5,
      endTimeLabel: '17h',
    });
    expect(message.title).toBe('Último dia: EVENTO X');
    expect(message.body).toBe('Encerra hoje às 17h');
  });

  it('primeiro dia de evento de vários dias indica até quando segue', () => {
    const message = buildEventPushMessage({
      offsetMinutes: 60,
      eventTitle: 'Evento X',
      dateLabel: 'Sexta-feira, 11 de setembro de 2026',
      timeLabel: '8h–18h',
      eventId: EVENT_ID,
      multiDayEndLabel: '15 SET · 18h',
    });
    expect(message.body).toContain('Segue até 15 SET · 18h');
  });

  it('evento de um dia mantém exatamente o texto anterior', () => {
    const message = buildEventPushMessage({
      offsetMinutes: 60,
      eventTitle: 'Reunião',
      dateLabel: 'Quarta-feira, 22 de julho de 2026',
      timeLabel: '13h30–15h',
      eventId: EVENT_ID,
    });
    expect(message.title).toBe('Evento em 1 hora: Reunião');
    expect(message.body).toBe('Quarta-feira, 22 de julho de 2026 · 13h30–15h');
  });

  it('usa a mesma regra de maiúsculas da Agenda', () => {
    expect(displayUpper('comunicação e ação')).toBe(toDisplayUpper('comunicação e ação'));
    expect(displayUpper('leo@fenasoja.com')).toBe('leo@fenasoja.com');
  });

  it('todos os avisos do ciclo abrem o mesmo evento canônico', () => {
    const paths = enumerateEventLifecycleDays('2026-09-11', '2026-09-15').map((day) =>
      buildEventLifecycleMessage({
        state: day.state,
        eventTitle: 'Evento X',
        eventId: EVENT_ID,
        dayIndex: day.dayIndex,
        totalDays: day.totalDays,
      }).path);
    expect(new Set(paths)).toEqual(new Set([`/cronograma?event=${EVENT_ID}`]));
  });
});
