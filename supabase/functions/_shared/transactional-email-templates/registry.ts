/// <reference types="npm:@types/react@18.3.1" />
import type { ComponentType } from 'npm:react@18.3.1'
import { normalizeEventReminderTemplateData, type EventReminderTemplateData } from '../eventReminderModel.ts'
import { EventReminderEmail } from './event-reminder.tsx'

export interface TemplateEntry {
  component: ComponentType<Record<string, unknown>>
  subject: string | ((data: Record<string, unknown>) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string | ((data: Record<string, unknown>) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'event-reminder': {
    component: EventReminderEmail as unknown as ComponentType<Record<string, unknown>>,
    subject: (data) =>
      normalizeEventReminderTemplateData(data as unknown as EventReminderTemplateData).subject,
    displayName: 'Lembrete de evento',
    previewData: {
      eventTitle: 'Reunião com a Presidência da FENASOJA 2028',
      reminderType: '24h',
      dateLabel: 'Quarta-feira, 22 de julho de 2026',
      timeLabel: '13h30–15h',
      location: 'Sede FENASOJA — Santa Rosa/RS',
      commissionNames: ['Comissão Central'],
      subevents: [
        { title: 'Validar pauta institucional', detail: 'Conferir materiais antes da reunião' },
        { title: 'Confirmar participantes' },
      ],
      pendingItems: ['Revisar a apresentação da presidência'],
      ctaUrl: 'https://fenasojagestao.com/cronograma-eventos?event=preview-event',
      googleCalendarUrl: 'https://calendar.google.com/calendar/u/0/r',
    },
  },
}
