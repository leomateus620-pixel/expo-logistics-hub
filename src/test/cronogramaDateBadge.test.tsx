import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CronogramaDateBadge, getDateBadgeTone } from '@/components/cronograma-eventos/CronogramaDateBadge';
import {
  formatLongDateWithWeekday,
  formatWeekday,
  formatWeekdayShort,
  getCalendarDateParts,
} from '@/components/cronograma-eventos/dateUtils';

describe('getCalendarDateParts', () => {
  it('derives the PT-BR short weekday from the real calendar date', () => {
    const week = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
    expect(week.map((date) => formatWeekdayShort(date))).toEqual(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
  });

  it('returns day, month and weekend flags without depending on the viewer time zone', () => {
    expect(getCalendarDateParts('2026-10-19')).toMatchObject({
      iso: '2026-10-19',
      day: '19',
      monthShort: 'OUT',
      weekdayShort: 'Seg',
      weekdayLong: 'segunda-feira',
      isWeekend: false,
    });
    expect(getCalendarDateParts('2028-01-01')).toMatchObject({ day: '01', monthShort: 'JAN', weekdayShort: 'Sáb', isWeekend: true });
  });

  it('handles missing or malformed dates gracefully', () => {
    expect(getCalendarDateParts(null)).toBeNull();
    expect(getCalendarDateParts('sem-data')).toBeNull();
    expect(formatWeekday(null)).toBe('pendente');
    expect(formatWeekday('2026-10-19')).toBe('seg');
    expect(formatLongDateWithWeekday('2026-10-19')).toBe('segunda-feira, 19 de outubro de 2026');
  });
});

describe('CronogramaDateBadge', () => {
  it('renders day, month, weekday and time in a semantic time element', () => {
    const { container } = render(<CronogramaDateBadge date="2026-10-19" startTime="13:30" />);
    const badge = container.querySelector('.cronograma-date-badge')!;
    expect(badge.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-19');
    expect(badge.querySelector('.cronograma-date-badge__weekday')?.textContent).toBe('Seg');
    expect(badge.querySelector('.cronograma-date-badge__day')?.textContent).toBe('19');
    expect(badge.querySelector('.cronograma-date-badge__month')?.textContent).toBe('OUT');
    expect(badge.querySelector('.cronograma-date-badge__time')?.textContent).toBe('13:30');
    expect(badge.hasAttribute('data-weekend')).toBe(false);
  });

  it('flags weekends and shows a placeholder when the time is not defined', () => {
    const { container } = render(<CronogramaDateBadge date="2026-10-24" size="compact" />);
    const badge = container.querySelector('.cronograma-date-badge')!;
    expect(badge.getAttribute('data-size')).toBe('compact');
    expect(badge.hasAttribute('data-weekend')).toBe(true);
    const time = badge.querySelector('.cronograma-date-badge__time')!;
    expect(time.getAttribute('data-empty')).toBe('true');
    expect(time.textContent).toBe('A definir');
  });

  it('maps event state to a visual tone', () => {
    expect(getDateBadgeTone({ status: 'planned', isToday: false, isNext: false })).toBe('default');
    expect(getDateBadgeTone({ status: 'planned', isToday: true, isNext: true })).toBe('today');
    expect(getDateBadgeTone({ status: 'confirmed', isToday: false, isNext: true })).toBe('next');
    expect(getDateBadgeTone({ status: 'overdue', isToday: false, isNext: false })).toBe('alert');
    expect(getDateBadgeTone({ status: 'completed', isToday: true, isNext: false })).toBe('completed');
    expect(getDateBadgeTone({ status: 'cancelled', isToday: false, isNext: false })).toBe('muted');
    expect(getDateBadgeTone({ status: 'planned', isToday: false, isNext: false, archived: true })).toBe('muted');
  });
});
