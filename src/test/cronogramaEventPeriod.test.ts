import { describe, expect, it } from 'vitest';
import {
  eventCoversDay,
  eventCoversMonthNumber,
  eventOverlapsRange,
  formatEventDurationLabel,
  formatEventPeriodShort,
  getEventPeriod,
} from '@/lib/cronograma-event-period';
import { toDisplayUpper } from '@/lib/textNormalize';

const base = { date: '2028-04-28', endDate: '2028-05-09' };

describe('período canônico de eventos de vários dias', () => {
  it('calcula duração inclusiva e detecta múltiplos dias', () => {
    const period = getEventPeriod(base);
    expect(period.isMultiDay).toBe(true);
    expect(period.days).toBe(12);
    expect(formatEventDurationLabel(base)).toBe('12 dias');
    expect(formatEventDurationLabel({ date: '2028-04-28', endDate: '2028-04-28' })).toBeNull();
  });

  it('normaliza data final inválida para a data inicial', () => {
    expect(getEventPeriod({ date: '2028-04-28', endDate: '2028-04-20' })).toMatchObject({
      end: '2028-04-28',
      days: 1,
      isMultiDay: false,
    });
  });

  it('sobrepõe intervalos nas bordas e cobre meses atravessados', () => {
    expect(eventOverlapsRange(base, '2028-05-09', '2028-05-20')).toBe(true);
    expect(eventOverlapsRange(base, '2028-05-10', null)).toBe(false);
    expect(eventOverlapsRange(base, null, '2028-04-27')).toBe(false);
    expect(eventCoversDay(base, '2028-05-01')).toBe(true);
    expect(eventCoversMonthNumber(base, 5)).toBe(true);
    expect(eventCoversMonthNumber(base, 6)).toBe(false);
  });

  it('formata o período curto com seta', () => {
    expect(formatEventPeriodShort(base)).toContain('→');
    expect(formatEventPeriodShort({ date: null, endDate: null })).toBe('Sem data');
  });
});

describe('uppercase de exibição', () => {
  it('preserva acentos e ignora valores técnicos', () => {
    expect(toDisplayUpper('reunião comissão')).toBe('REUNIÃO COMISSÃO');
    expect(toDisplayUpper('leo@fenasoja.com')).toBe('leo@fenasoja.com');
    expect(toDisplayUpper('https://fenasoja.com/a')).toBe('https://fenasoja.com/a');
    expect(toDisplayUpper(null)).toBeNull();
  });
});
