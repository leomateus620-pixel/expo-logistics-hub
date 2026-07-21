/// <reference types="npm:@types/react@18.3.1" />
import type { ComponentType } from 'npm:react@18.3.1'
import { template as eventReminder } from './event-reminder.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, unknown>) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string | ((data: Record<string, unknown>) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'event-reminder': eventReminder,
}
