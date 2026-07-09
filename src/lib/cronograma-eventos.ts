import type {
  CronogramaEventSeed,
  CronogramaEventType,
  CronogramaPriority,
  CronogramaStatus,
} from '@/data/fenasoja2028CronogramaSeed';

export interface CronogramaEvent extends CronogramaEventSeed {
  id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CronogramaFilters {
  search: string;
  year: 'all' | '2026' | '2027' | '2028';
  month: string;
  category: string;
  status: string;
  commission: string;
  responsible: string;
  type: string;
  dateMode: 'all' | 'dated' | 'undated';
}

export const defaultCronogramaFilters: CronogramaFilters = {
  search: '',
  year: 'all',
  month: 'all',
  category: 'all',
  status: 'all',
  commission: 'all',
  responsible: 'all',
  type: 'all',
  dateMode: 'all',
};

export const statusLabels: Record<CronogramaStatus, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  aguardando_definicao: 'Aguardando definição',
  aguardando_responsavel: 'Aguardando responsável',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const priorityLabels: Record<CronogramaPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export const typeLabels: Record<CronogramaEventType, string> = {
  reuniao: 'Reunião',
  evento_institucional: 'Evento institucional',
  feira_externa: 'Feira externa',
  feriado: 'Feriado',
  planejamento: 'Planejamento',
  contratacao: 'Contratação',
  infraestrutura: 'Infraestrutura',
  midia_patrocinio: 'Mídia e patrocínio',
  acessibilidade: 'Acessibilidade',
  operacao: 'Operação',
  lancamento: 'Lançamento',
  evento_principal: 'Evento principal',
  sem_data: 'Sem data',
};

export const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function parseDateKey(dateKey: string | null | undefined): Date | null {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function getYearFromDate(dateKey: string | null | undefined): number | null {
  return dateKey ? Number(dateKey.slice(0, 4)) : null;
}

export function getMonthValue(dateKey: string | null | undefined): string {
  if (!dateKey) return 'sem-data';
  return dateKey.slice(5, 7);
}

export function getMonthLabel(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  const monthIndex = Number(dateKey.slice(5, 7)) - 1;
  return monthNames[monthIndex] ?? null;
}

export function getWeekLabel(dateKey: string | null | undefined): string | null {
  if (!dateKey) return null;
  const day = Number(dateKey.slice(8, 10));
  if (!day) return null;
  return `${Math.min(5, Math.ceil(day / 7))}ª semana`;
}

export function formatDateBR(dateKey: string | null | undefined): string {
  const date = parseDateKey(dateKey);
  return date ? dateFormatter.format(date).replace('.', '') : 'Sem data definida';
}

export function formatEventRange(event: Pick<CronogramaEvent, 'startDate' | 'endDate' | 'hasExactDate'>): string {
  if (!event.hasExactDate || !event.startDate) return 'Sem data definida';
  if (event.endDate && event.endDate !== event.startDate) {
    return `${formatDateBR(event.startDate)} a ${formatDateBR(event.endDate)}`;
  }
  return formatDateBR(event.startDate);
}

export function normalizeCronogramaSeed(seed: CronogramaEventSeed[]): CronogramaEvent[] {
  return seed.map((event) => ({
    ...event,
    id: event.sourceKey,
    monthLabel: event.monthLabel ?? getMonthLabel(event.startDate),
    weekLabel: event.weekLabel ?? getWeekLabel(event.startDate),
  }));
}

export function sortCronogramaEvents(events: CronogramaEvent[]): CronogramaEvent[] {
  return [...events].sort((a, b) => {
    if (!a.startDate && !b.startDate) return a.title.localeCompare(b.title, 'pt-BR');
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'pt-BR');
  });
}

export function eventMatchesSearch(event: CronogramaEvent, term: string): boolean {
  if (!term.trim()) return true;
  const query = term.trim().toLocaleLowerCase('pt-BR');
  const haystack = [
    event.title,
    event.description,
    event.category,
    event.eventType,
    event.status,
    event.priority,
    event.location,
    event.responsibleName,
    event.commissionName,
    event.sourceSheet,
    ...(event.linkedCommissions ?? []).map((c) => c.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('pt-BR');
  return haystack.includes(query);
}

export function filterCronogramaEvents(events: CronogramaEvent[], filters: CronogramaFilters): CronogramaEvent[] {
  return sortCronogramaEvents(
    events.filter((event) => {
      if (!eventMatchesSearch(event, filters.search)) return false;
      if (filters.year !== 'all' && String(event.sourceYear) !== filters.year) return false;
      if (filters.month !== 'all' && getMonthValue(event.startDate) !== filters.month) return false;
      if (filters.category !== 'all' && event.category !== filters.category) return false;
      if (filters.status !== 'all' && event.status !== filters.status) return false;
      if (filters.type !== 'all' && event.eventType !== filters.type) return false;
      if (filters.dateMode === 'dated' && !event.hasExactDate) return false;
      if (filters.dateMode === 'undated' && event.hasExactDate) return false;
      if (filters.responsible !== 'all' && (event.responsibleName ?? '') !== filters.responsible) return false;
      if (filters.commission !== 'all') {
        const slugs = new Set([
          event.commissionSlug,
          ...(event.linkedCommissions ?? []).map((commission) => commission.slug),
        ].filter(Boolean));
        if (!slugs.has(filters.commission)) return false;
      }
      return true;
    }),
  );
}

export function groupByYear(events: CronogramaEvent[]): Record<number, CronogramaEvent[]> {
  return events.reduce<Record<number, CronogramaEvent[]>>((acc, event) => {
    (acc[event.sourceYear] ||= []).push(event);
    return acc;
  }, {});
}

export function groupByMonth(events: CronogramaEvent[]): Record<string, CronogramaEvent[]> {
  return events.reduce<Record<string, CronogramaEvent[]>>((acc, event) => {
    const key = event.startDate ? `${event.sourceYear}-${getMonthValue(event.startDate)}` : `${event.sourceYear}-sem-data`;
    (acc[key] ||= []).push(event);
    return acc;
  }, {});
}

export function getEventDurationDays(event: CronogramaEvent): number {
  if (!event.startDate) return 0;
  const start = parseDateKey(event.startDate);
  const end = parseDateKey(event.endDate ?? event.startDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

export function isMainFenasojaEvent(event: CronogramaEvent): boolean {
  return event.sourceKey === '2028-realizacao-fenasoja-2028' || event.eventType === 'evento_principal';
}

export function isCentralMeeting(event: CronogramaEvent): boolean {
  return event.eventType === 'reuniao' && event.commissionSlug === 'comissao-central' && event.title.includes('Comissão Central');
}

export function buildCronogramaKpis(events: CronogramaEvent[]) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const todayDate = parseDateKey(today);
  const plus30 = todayDate ? new Date(todayDate.getTime() + 30 * 86400000) : null;
  const upcoming30 = events.filter((event) => {
    const start = parseDateKey(event.startDate);
    return start && todayDate && plus30 && start >= todayDate && start <= plus30;
  }).length;

  return {
    total: events.length,
    byYear: {
      2026: events.filter((event) => event.sourceYear === 2026).length,
      2027: events.filter((event) => event.sourceYear === 2027).length,
      2028: events.filter((event) => event.sourceYear === 2028).length,
    },
    centralMeetings: events.filter(isCentralMeeting).length,
    undated: events.filter((event) => !event.hasExactDate).length,
    upcoming30,
    linkedCommissions: events.filter((event) => (event.linkedCommissions?.length ?? 0) > 0 || event.commissionSlug).length,
  };
}
