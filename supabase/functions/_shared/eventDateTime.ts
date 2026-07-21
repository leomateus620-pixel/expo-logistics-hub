export const EVENT_TIME_ZONE = 'America/Sao_Paulo'

export type EventDateTimeErrorCode =
  | 'missing_date'
  | 'invalid_date'
  | 'invalid_start_time'
  | 'invalid_end_time'
  | 'invalid_time_pair'
  | 'nonexistent_local_time'
  | 'end_before_start'

export interface EventDateTimeInput {
  date: unknown
  startTime?: unknown
  endDate?: unknown
  endTime?: unknown
  allDay?: boolean
}

export interface NormalizedEventDateTime {
  date: string
  endDate: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  scheduleAt: Date
  endAt: Date | null
  dateLong: string
  dateCompact: string
  timeLabel: string
  absoluteLabel: string
  googleStart: { date: string } | { dateTime: string; timeZone: typeof EVENT_TIME_ZONE }
  googleEnd: { date: string } | { dateTime: string; timeZone: typeof EVENT_TIME_ZONE }
}

export type NormalizeEventDateTimeResult =
  | { ok: true; value: NormalizedEventDateTime }
  | { ok: false; error: EventDateTimeErrorCode }

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/

interface DateParts { year: number; month: number; day: number }
interface DateTimeParts extends DateParts { hour: number; minute: number; second: number }

function isValidDateParts(parts: DateParts) {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return probe.getUTCFullYear() === parts.year
    && probe.getUTCMonth() === parts.month - 1
    && probe.getUTCDate() === parts.day
}

function datePartsToString(parts: DateParts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function parseSqlDate(value: unknown): { date: string; embeddedTime: string | null } | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  const dateMatch = DATE_PATTERN.exec(input)
  if (dateMatch) {
    const parts = { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
    return isValidDateParts(parts) ? { date: datePartsToString(parts), embeddedTime: null } : null
  }

  const isoMatch = ISO_PATTERN.exec(input)
  if (!isoMatch) return null
  if (isoMatch[7]) {
    const instant = new Date(input)
    if (Number.isNaN(instant.getTime())) return null
    const zoned = getZonedParts(instant)
    return {
      date: datePartsToString(zoned),
      embeddedTime: `${pad(zoned.hour)}:${pad(zoned.minute)}:${pad(zoned.second)}`,
    }
  }

  const dateParts = { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
  if (!isValidDateParts(dateParts)) return null
  const time = normalizeTime(`${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6] ?? '00'}`)
  return time ? { date: datePartsToString(dateParts), embeddedTime: time } : null
}

function normalizeTime(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? '0')
  if (hour > 23 || minute > 59 || second > 59) return undefined
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function splitDate(date: string): DateParts {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function splitTime(time: string): Pick<DateTimeParts, 'hour' | 'minute' | 'second'> {
  const [hour, minute, second] = time.split(':').map(Number)
  return { hour, minute, second }
}

function getZonedParts(date: Date): DateTimeParts {
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
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function sameDateTime(left: DateTimeParts, right: DateTimeParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute && left.second === right.second
}

/** Converte horário civil de São Paulo em instante, rejeitando lacunas de horário de verão. */
function zonedDateTimeToInstant(parts: DateTimeParts) {
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offsets = new Set<number>()
  for (const delta of [-36, -12, 0, 12, 36]) {
    const probe = new Date(wallClockUtc + delta * 3_600_000)
    const zoned = getZonedParts(probe)
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second)
    offsets.add(zonedAsUtc - probe.getTime())
  }

  const candidates = [...offsets]
    .map((offset) => new Date(wallClockUtc - offset))
    .filter((candidate) => sameDateTime(getZonedParts(candidate), parts))
    .sort((left, right) => left.getTime() - right.getTime())
  return candidates[0] ?? null
}

function addCalendarDays(date: string, days: number) {
  const parts = splitDate(date)
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return datePartsToString({
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  })
}

function localDateTime(date: string, time: string) {
  return `${date}T${time}`
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':')
  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toLocaleUpperCase('pt-BR')}${value.slice(1)}` : value
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  const parts = splitDate(date)
  const atNoon = zonedDateTimeToInstant({ ...parts, hour: 12, minute: 0, second: 0 })
  if (!atNoon) return null
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: EVENT_TIME_ZONE }).format(atNoon)
}

export function normalizeEventDateTime(input: EventDateTimeInput): NormalizeEventDateTimeResult {
  if (input.date === null || input.date === undefined || input.date === '') {
    return { ok: false, error: 'missing_date' }
  }
  const parsedStartDate = parseSqlDate(input.date)
  if (!parsedStartDate) return { ok: false, error: 'invalid_date' }

  const explicitStartTime = normalizeTime(input.startTime)
  if (explicitStartTime === undefined) return { ok: false, error: 'invalid_start_time' }
  const startTime = explicitStartTime ?? parsedStartDate.embeddedTime
  const allDay = input.allDay ?? !startTime

  const parsedEndDate = input.endDate === null || input.endDate === undefined || input.endDate === ''
    ? { date: parsedStartDate.date, embeddedTime: null }
    : parseSqlDate(input.endDate)
  if (!parsedEndDate) return { ok: false, error: 'invalid_date' }

  const explicitEndTime = normalizeTime(input.endTime)
  if (explicitEndTime === undefined) return { ok: false, error: 'invalid_end_time' }
  const endTime = explicitEndTime ?? parsedEndDate.embeddedTime
  if (!startTime && endTime) return { ok: false, error: 'invalid_time_pair' }
  if (input.allDay === false && !startTime) return { ok: false, error: 'invalid_time_pair' }

  const scheduleTime = allDay ? '08:00:00' : startTime!
  const startAt = zonedDateTimeToInstant({ ...splitDate(parsedStartDate.date), ...splitTime(scheduleTime) })
  if (!startAt) return { ok: false, error: 'nonexistent_local_time' }

  let endAt: Date | null = null
  if (allDay && parsedEndDate.date < parsedStartDate.date) {
    return { ok: false, error: 'end_before_start' }
  }
  if (!allDay && endTime) {
    endAt = zonedDateTimeToInstant({ ...splitDate(parsedEndDate.date), ...splitTime(endTime) })
    if (!endAt) return { ok: false, error: 'nonexistent_local_time' }
    if (endAt.getTime() <= startAt.getTime()) return { ok: false, error: 'end_before_start' }
  }

  const naturalDate = formatDate(parsedStartDate.date, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const compactDate = formatDate(parsedStartDate.date, {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  if (!naturalDate || !compactDate) return { ok: false, error: 'invalid_date' }

  const timeLabel = allDay
    ? 'Dia inteiro'
    : endTime
      ? `${formatTime(startTime!)}–${formatTime(endTime)}`
      : formatTime(startTime!)
  const dateLong = capitalize(naturalDate)
  const absoluteLabel = allDay ? `${dateLong} · Dia inteiro` : `${dateLong}, às ${formatTime(startTime!)}`
  const defaultEndParts = getZonedParts(new Date(startAt.getTime() + 60 * 60_000))
  const timedEndDate = endTime ? parsedEndDate.date : datePartsToString(defaultEndParts)
  const timedEndTime = endTime
    ?? `${pad(defaultEndParts.hour)}:${pad(defaultEndParts.minute)}:${pad(defaultEndParts.second)}`

  return {
    ok: true,
    value: {
      date: parsedStartDate.date,
      endDate: parsedEndDate.date,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      allDay,
      scheduleAt: startAt,
      endAt,
      dateLong,
      dateCompact: compactDate.replace(/\.$/, ''),
      timeLabel,
      absoluteLabel,
      googleStart: allDay
        ? { date: parsedStartDate.date }
        : { dateTime: localDateTime(parsedStartDate.date, startTime!), timeZone: EVENT_TIME_ZONE },
      googleEnd: allDay
        ? { date: addCalendarDays(parsedEndDate.date, 1) }
        : {
            dateTime: localDateTime(timedEndDate, timedEndTime),
            timeZone: EVENT_TIME_ZONE,
          },
    },
  }
}

export function eventDateDiagnosticShape(input: EventDateTimeInput) {
  return {
    dateType: typeof input.date,
    hasDate: input.date !== null && input.date !== undefined && input.date !== '',
    startTimeType: typeof input.startTime,
    hasStartTime: input.startTime !== null && input.startTime !== undefined && input.startTime !== '',
    hasEndDate: input.endDate !== null && input.endDate !== undefined && input.endDate !== '',
    hasEndTime: input.endTime !== null && input.endTime !== undefined && input.endTime !== '',
  }
}
