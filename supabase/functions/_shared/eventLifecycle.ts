// Ciclo de vida temporal de um evento de vários dias.
// Um único evento canônico continua sendo um único registro: os dias são
// derivados do intervalo (start_date → end_date), nunca materializados como
// eventos separados.

export const EVENT_TIME_ZONE = 'America/Sao_Paulo'

/** Horário local (Brasília) do aviso diário dos dias intermediários e do último dia. */
export const LIFECYCLE_DAILY_HOUR = 7

export type EventLifecycleState = 'START' | 'ONGOING' | 'FINAL_DAY'

export const LIFECYCLE_TYPE_BY_STATE: Record<EventLifecycleState, string> = {
  START: 'event_start',
  ONGOING: 'event_ongoing',
  FINAL_DAY: 'event_final_day',
}

export interface LifecycleDay {
  /** Dia local no formato YYYY-MM-DD. */
  date: string
  /** 1-based. */
  dayIndex: number
  totalDays: number
  state: EventLifecycleState
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value.trim())
}

function toUtcNoon(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day, 12)
}

function fromUtc(ms: number) {
  const probe = new Date(ms)
  return `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, '0')}-${String(probe.getUTCDate()).padStart(2, '0')}`
}

export function addCalendarDays(date: string, days: number) {
  return fromUtc(toUtcNoon(date) + days * 86_400_000)
}

export function calendarDaysBetween(start: string, end: string) {
  return Math.round((toUtcNoon(end) - toUtcNoon(start)) / 86_400_000)
}

/** Normaliza o intervalo: fim nunca antes do início; sem fim = evento de um dia. */
export function normalizeEventRange(startDate: unknown, endDate: unknown) {
  if (!isDateKey(startDate)) return null
  const start = String(startDate).trim()
  const rawEnd = isDateKey(endDate) ? String(endDate).trim() : null
  const end = rawEnd && rawEnd > start ? rawEnd : start
  return { start, end, totalDays: calendarDaysBetween(start, end) + 1 }
}

export function isMultiDayEvent(startDate: unknown, endDate: unknown) {
  const range = normalizeEventRange(startDate, endDate)
  return Boolean(range && range.totalDays > 1)
}

/**
 * Todos os dias do evento, com o estado semântico de cada um.
 * Evento de um dia devolve apenas START (comportamento legado preservado).
 */
export function enumerateEventLifecycleDays(startDate: unknown, endDate: unknown): LifecycleDay[] {
  const range = normalizeEventRange(startDate, endDate)
  if (!range) return []
  const days: LifecycleDay[] = []
  for (let index = 0; index < range.totalDays; index += 1) {
    const date = addCalendarDays(range.start, index)
    const state: EventLifecycleState = index === 0
      ? 'START'
      : index === range.totalDays - 1
        ? 'FINAL_DAY'
        : 'ONGOING'
    days.push({ date, dayIndex: index + 1, totalDays: range.totalDays, state })
  }
  return days
}

/** Dias que geram aviso diário (todos menos o primeiro, que usa o lembrete de 1h). */
export function enumerateLifecycleDailyDays(startDate: unknown, endDate: unknown): LifecycleDay[] {
  return enumerateEventLifecycleDays(startDate, endDate).filter((day) => day.dayIndex > 1)
}

export function lifecycleDayFor(startDate: unknown, endDate: unknown, date: string): LifecycleDay | null {
  return enumerateEventLifecycleDays(startDate, endDate).find((day) => day.date === date) ?? null
}

function zonedParts(instant: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>
  return parts
}

/** Instante UTC correspondente a HH:00 local de Brasília no dia informado (à prova de DST). */
export function localHourInstant(date: string, hour: number): Date | null {
  if (!isDateKey(date)) return null
  const [year, month, day] = date.split('-').map(Number)
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, 0, 0)
  const offsets = new Set<number>()
  for (const delta of [-36, -12, 0, 12, 36]) {
    const probe = new Date(wallClockUtc + delta * 3_600_000)
    const zoned = zonedParts(probe)
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second)
    offsets.add(zonedAsUtc - probe.getTime())
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wallClockUtc - offset))
    .filter((candidate) => {
      const zoned = zonedParts(candidate)
      return zoned.year === year && zoned.month === month && zoned.day === day && zoned.hour === hour
    })
    .sort((left, right) => left.getTime() - right.getTime())
  // Em lacuna de horário de verão (hora inexistente), cai para o instante seguinte válido.
  return candidates[0] ?? new Date(wallClockUtc + 3_600_000)
}

export function localDateString(instant: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

const CLOSED_STATUSES = new Set([
  'cancelado', 'cancelled', 'canceled',
  'concluido', 'concluído', 'completed', 'done',
  'arquivado', 'archived',
])

/** Evento cancelado/concluído/arquivado não gera mais avisos de ciclo. */
export function isClosedEventStatus(status: unknown) {
  return CLOSED_STATUSES.has(String(status ?? '').trim().toLowerCase())
}
