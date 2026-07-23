export type EventReminderType = '24h' | '2h' | '1h'

export interface EventReminderRelatedItem {
  title: string
  detail?: string | null
}

export interface EventReminderTemplateData {
  eventTitle: string
  reminderType: EventReminderType
  dateLabel: string
  timeLabel: string
  location?: string | null
  commissionNames?: string[]
  mainEventTitle?: string | null
  subevents?: EventReminderRelatedItem[]
  pendingItems?: string[]
  ctaUrl: string
  googleCalendarUrl?: string | null
}

export interface EventReminderViewModel extends EventReminderTemplateData {
  heading: string
  intro: string
  subject: string
  recipientContext: string
  commissionLabel: string | null
  location: string | null
  mainEventTitle: string | null
  googleCalendarUrl: string | null
  subevents: EventReminderRelatedItem[]
  pendingItems: string[]
}

const BROKEN_VALUE = /(?:^|\b)(invalid date|undefined|null|nan)(?:\b|$)/i
const EMPTY_PLACEHOLDER = /^(?:[-–—]+|n\/?a|não informado)$/i

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string') throw new Error(`invalid_template_data:${field}`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || BROKEN_VALUE.test(normalized) || EMPTY_PLACEHOLDER.test(normalized)) {
    throw new Error(`invalid_template_data:${field}`)
  }
  return normalized
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || BROKEN_VALUE.test(normalized) || EMPTY_PLACEHOLDER.test(normalized)) return null
  return normalized
}

function safeHttpsUrl(value: unknown, field: string, allowedHosts?: string[]) {
  const raw = requiredText(value, field)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`invalid_template_data:${field}`)
  }
  if (parsed.protocol !== 'https:' || (allowedHosts && !allowedHosts.includes(parsed.hostname))) {
    throw new Error(`invalid_template_data:${field}`)
  }
  return parsed.toString()
}

function normalizeTextList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(optionalText).filter((item): item is string => Boolean(item)))].slice(0, limit)
}

function normalizeRelatedItems(value: unknown) {
  if (!Array.isArray(value)) return []
  const items: EventReminderRelatedItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const title = optionalText((item as EventReminderRelatedItem).title)
    if (!title) continue
    items.push({ title, detail: optionalText((item as EventReminderRelatedItem).detail) })
    if (items.length === 6) break
  }
  return items
}

export function normalizeEventReminderTemplateData(raw: EventReminderTemplateData): EventReminderViewModel {
  const eventTitle = requiredText(raw.eventTitle, 'eventTitle')
  const dateLabel = requiredText(raw.dateLabel, 'dateLabel')
  const timeLabel = requiredText(raw.timeLabel, 'timeLabel')
  const reminderType: EventReminderType = raw.reminderType === '24h' || raw.reminderType === '2h' || raw.reminderType === '1h'
    ? raw.reminderType
    : (() => { throw new Error('invalid_template_data:reminderType') })()
  const ctaUrl = safeHttpsUrl(raw.ctaUrl, 'ctaUrl', ['fenasojagestao.com', 'www.fenasojagestao.com'])
  const googleCalendarUrl = raw.googleCalendarUrl
    ? safeHttpsUrl(raw.googleCalendarUrl, 'googleCalendarUrl', ['calendar.google.com'])
    : null
  const commissionNames = normalizeTextList(raw.commissionNames, 4)
  const commissionLabel = commissionNames.length ? commissionNames.join(' · ') : null
  const isAllDay = timeLabel.toLocaleLowerCase('pt-BR') === 'dia inteiro'

  const heading = reminderType === '24h'
    ? 'Seu evento é amanhã'
    : reminderType === '1h'
      ? isAllDay
        ? 'Seu evento acontece hoje'
        : 'Seu evento começa em 1 hora'
      : isAllDay
        ? 'Seu evento acontece hoje'
        : 'Seu evento começa em 2 horas'
  const intro = reminderType === '24h'
    ? isAllDay
      ? `Este é um lembrete de que “${eventTitle}” acontece amanhã, durante todo o dia.`
      : `Este é um lembrete de que “${eventTitle}” começa amanhã, às ${timeLabel.split('–')[0]}.`
    : reminderType === '1h'
      ? isAllDay
        ? `Confira os detalhes de “${eventTitle}”, programado para hoje durante todo o dia.`
        : `“${eventTitle}” começa em 1 hora. Revise os detalhes finais e confirme presença antes do início.`
      : isAllDay
        ? `Confira os detalhes de “${eventTitle}”, programado para hoje durante todo o dia.`
        : `“${eventTitle}” começa em 2 horas. Confira os detalhes e as demandas relacionadas antes do início.`
  const recipientContext = commissionNames.length === 1
    ? `Você recebeu este lembrete porque participa da ${commissionNames[0]}, vinculada a este evento.`
    : commissionNames.length > 1
      ? `Você recebeu este lembrete porque participa de comissões vinculadas a este evento: ${commissionNames.join(', ')}.`
      : 'Você recebeu este lembrete porque participa de uma comissão vinculada a este evento.'

  return {
    eventTitle,
    reminderType,
    dateLabel,
    timeLabel,
    location: optionalText(raw.location),
    commissionNames,
    commissionLabel,
    mainEventTitle: optionalText(raw.mainEventTitle),
    subevents: normalizeRelatedItems(raw.subevents),
    pendingItems: normalizeTextList(raw.pendingItems, 5),
    ctaUrl,
    googleCalendarUrl,
    heading,
    intro,
    subject: `${heading}: ${eventTitle}`,
    recipientContext,
  }
}

export function buildCronogramaEventUrl(eventId: unknown) {
  const id = requiredText(eventId, 'eventId')
  const url = new URL('https://fenasojagestao.com/cronograma-eventos')
  url.searchParams.set('event', id)
  return url.toString()
}

export function buildGoogleCalendarEventUrl(googleEventId: unknown, googleCalendarId: unknown) {
  const eventId = optionalText(googleEventId)
  const calendarId = optionalText(googleCalendarId)
  if (!eventId || !calendarId) return null
  const encoded = btoa(`${eventId} ${calendarId}`)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  const url = new URL('https://calendar.google.com/calendar/event')
  url.searchParams.set('eid', encoded)
  return url.toString()
}
