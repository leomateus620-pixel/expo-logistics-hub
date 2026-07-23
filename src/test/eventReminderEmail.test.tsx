import * as React from 'react';
import { renderAsync } from '@react-email/components';
import { describe, expect, it } from 'vitest';
import { EventReminderEmail } from '../../supabase/functions/_shared/transactional-email-templates/event-reminder';
import {
  buildCronogramaEventUrl,
  buildGoogleCalendarEventUrl,
  normalizeEventReminderTemplateData,
  type EventReminderTemplateData,
} from '../../supabase/functions/_shared/eventReminderModel';

const timedReminder: EventReminderTemplateData = {
  eventTitle: 'Reunião com a Presidência da FENASOJA 2028',
  reminderType: '24h',
  dateLabel: 'Quarta-feira, 22 de julho de 2026',
  timeLabel: '13h30–15h',
  location: 'Sede FENASOJA',
  commissionNames: ['Comissão Central'],
  subevents: [
    { title: 'Validar pauta institucional', detail: '22 jul. 2026 · 10h' },
    { title: 'Confirmar participantes' },
  ],
  pendingItems: ['Revisar a apresentação da presidência'],
  ctaUrl: buildCronogramaEventUrl('event-123'),
  googleCalendarUrl: buildGoogleCalendarEventUrl('google-event', 'calendar@group.calendar.google.com'),
};

async function renderReminder(data: EventReminderTemplateData, plainText = false) {
  return renderAsync(React.createElement(EventReminderEmail, data), { plainText });
}

describe('e-mail de lembrete de evento', () => {
  it('renderiza o lembrete de 24 horas com hierarquia, relações e URL direta correta', async () => {
    const html = await renderReminder(timedReminder);
    const text = await renderReminder(timedReminder, true);

    expect(html).toContain('Seu evento é amanhã');
    expect(html).toContain('Reunião com a Presidência da FENASOJA 2028');
    expect(html).toContain('Comissão Central');
    expect(html).toContain('Subeventos relacionados');
    expect(html).toContain('Demandas para revisar');
    expect(html).toContain('Abrir evento no cronograma');
    expect(html).toContain('event=event-123');
    expect(html).not.toContain('eventId=');
    expect(text).toContain('Você recebeu este lembrete porque participa da Comissão Central');
    expect(`${html}\n${text}`).not.toMatch(/\b(?:Invalid Date|undefined|null|NaN)\b/i);
  });

  it('renderiza o lembrete de 2 horas sem criar linha vazia de local', async () => {
    const data: EventReminderTemplateData = {
      ...timedReminder,
      reminderType: '2h',
      location: null,
      subevents: [],
      pendingItems: [],
      googleCalendarUrl: null,
    };
    const text = await renderReminder(data, true);
    const normalizedText = text.replace(/\s+/g, ' ');
    expect(normalizedText).toMatch(/seu evento começa em 2 horas/i);
    expect(text).not.toMatch(/^Local$/m);
    expect(text).not.toContain('Ver também no Google Agenda');
  });

  it('renderiza o lembrete de 1 hora com título e intro dedicados', async () => {
    const data: EventReminderTemplateData = {
      ...timedReminder,
      reminderType: '1h',
      subevents: [],
      pendingItems: [],
    };
    const html = await renderReminder(data);
    const text = await renderReminder(data, true);
    expect(html).toContain('Seu evento começa em 1 hora');
    expect(text).toMatch(/começa em 1 hora/i);
    expect(`${html}\n${text}`).not.toMatch(/\b(?:Invalid Date|undefined|null|NaN)\b/i);

  it('distingue evento de dia inteiro sem inventar horário', async () => {
    const data: EventReminderTemplateData = {
      ...timedReminder,
      timeLabel: 'Dia inteiro',
      location: null,
      reminderType: '24h',
    };
    const text = await renderReminder(data, true);
    const normalizedText = text.replace(/\s+/g, ' ');
    expect(normalizedText).toContain('acontece amanhã, durante todo o dia');
    expect(text).toContain('Dia inteiro');
  });

  it('inclui preheader, estilos mobile e overrides seguros de dark mode', async () => {
    const html = await renderReminder(timedReminder);
    expect(html).toContain('width=device-width, initial-scale=1.0');
    expect(html).toContain('color-scheme');
    expect(html).toContain('supported-color-schemes');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('max-width: 620px');
    expect(html).toContain('data-ogsc');
    expect(html).toContain('background-image');
  });

  it('bloqueia sentinelas quebradas e URLs não HTTPS antes do render', () => {
    expect(() => normalizeEventReminderTemplateData({
      ...timedReminder,
      dateLabel: 'Invalid Date',
    })).toThrow('invalid_template_data:dateLabel');
    expect(() => normalizeEventReminderTemplateData({
      ...timedReminder,
      dateLabel: '—',
    })).toThrow('invalid_template_data:dateLabel');
    expect(normalizeEventReminderTemplateData({
      ...timedReminder,
      location: 'Não informado',
    }).location).toBeNull();
    expect(() => normalizeEventReminderTemplateData({
      ...timedReminder,
      ctaUrl: 'javascript:alert(1)',
    })).toThrow('invalid_template_data:ctaUrl');
  });

  it('gera link opcional do Google Agenda apenas com os dois identificadores', () => {
    expect(buildGoogleCalendarEventUrl(null, 'calendar')).toBeNull();
    const url = buildGoogleCalendarEventUrl('event', 'calendar@group.calendar.google.com');
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=/);
  });
});
