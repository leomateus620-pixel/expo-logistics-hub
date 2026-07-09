import type { CronogramaEventDraft } from '@/hooks/useCronogramaEventos';
import {
  isCentralMeeting,
  isMainFenasojaEvent,
  type CronogramaEvent as SourceCronogramaEvent,
} from '@/lib/cronograma-eventos';
import { categoryLabels } from './cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaKind,
  CronogramaPriority,
  CronogramaStatus,
} from './types';

const categoryKeywords: Array<[CronogramaCategory, RegExp]> = [
  ['logistica', /log[ií]stica|estacionamento|ve[ií]culos|acesso|mobilidade/i],
  ['infraestrutura', /infra|seguran[çc]a|limpeza|ppci|internet|pavilh|exporural|banheiro|gerador|c[âa]mera|libras|acessibilidade/i],
  ['comunicacao', /comunica|m[ií]dia|imprensa|propaganda|revista|lan[çc]amento|v[ií]deo|fot[oó]grafo/i],
  ['comercial', /comercial|patroc[ií]nio|ind[uú]stria|com[eé]rcio|servi[çc]os|cota|cess[ãa]o|espa[çc]os/i],
  ['programacao', /programa|arte|cultura|show|soy summit|feira|expointer|expodireto|agrishow|evento externo/i],
  ['cerimonial', /cerimonial|abertura|autoridade|protocolo|jantar|encerramento/i],
  ['governanca', /comiss[ãa]o central|reuni[ãa]o|conselho|planejamento|presidente|assessoria|componentes/i],
];

const sourceToVisualStatus: Record<SourceCronogramaEvent['status'], CronogramaStatus> = {
  planejado: 'planned',
  em_andamento: 'confirmed',
  aguardando_definicao: 'in_definition',
  aguardando_responsavel: 'in_definition',
  concluido: 'confirmed',
  cancelado: 'blocked',
};

const visualToSourceStatus: Record<CronogramaStatus, SourceCronogramaEvent['status']> = {
  confirmed: 'concluido',
  planned: 'planejado',
  in_definition: 'aguardando_definicao',
  blocked: 'cancelado',
};

const sourceToVisualPriority: Record<SourceCronogramaEvent['priority'], CronogramaPriority> = {
  critica: 'critical',
  alta: 'high',
  media: 'medium',
  baixa: 'low',
};

const visualToSourcePriority: Record<CronogramaPriority, SourceCronogramaEvent['priority']> = {
  critical: 'critica',
  high: 'alta',
  medium: 'media',
  low: 'baixa',
};

const sourceToVisualKind: Record<SourceCronogramaEvent['eventType'], CronogramaKind> = {
  reuniao: 'meeting',
  evento_institucional: 'event',
  feira_externa: 'event',
  feriado: 'milestone',
  planejamento: 'milestone',
  contratacao: 'deadline',
  infraestrutura: 'deadline',
  midia_patrocinio: 'deadline',
  acessibilidade: 'deadline',
  operacao: 'event',
  lancamento: 'milestone',
  evento_principal: 'event',
  sem_data: 'decision',
};

const visualToSourceKind: Record<CronogramaKind, SourceCronogramaEvent['eventType']> = {
  milestone: 'planejamento',
  event: 'evento_institucional',
  meeting: 'reuniao',
  deadline: 'contratacao',
  decision: 'sem_data',
};

function normalizeYear(year: number): 2026 | 2027 | 2028 {
  if (year === 2026 || year === 2027 || year === 2028) return year;
  return 2028;
}

function getVisualCategory(event: SourceCronogramaEvent): CronogramaCategory {
  const haystack = [
    event.category,
    event.eventType,
    event.commissionSlug,
    event.commissionName,
    event.responsibleName,
    event.title,
  ]
    .filter(Boolean)
    .join(' ');

  return categoryKeywords.find(([, pattern]) => pattern.test(haystack))?.[0] ?? 'governanca';
}

function fallbackSummary(event: SourceCronogramaEvent): string {
  if (event.description) return event.description;
  if (event.sourceNote) return event.sourceNote;
  return `${event.category} conforme planilha oficial ${event.sourceYear}.`;
}

export function adaptCronogramaEvent(event: SourceCronogramaEvent): CronogramaEvent {
  const category = getVisualCategory(event);
  const centralMeeting = isCentralMeeting(event);

  return {
    id: event.id,
    sourceKey: event.sourceKey,
    sourceCategory: event.category,
    title: event.title,
    summary: fallbackSummary(event),
    date: event.hasExactDate ? event.startDate : null,
    endDate: event.hasExactDate ? event.endDate : null,
    startTime: event.time ?? undefined,
    year: event.sourceYear,
    category,
    status: sourceToVisualStatus[event.status] ?? 'planned',
    priority: sourceToVisualPriority[event.priority] ?? 'medium',
    kind: centralMeeting ? 'meeting' : sourceToVisualKind[event.eventType] ?? 'event',
    location: event.location ?? undefined,
    owner: event.responsibleName ?? event.commissionName ?? undefined,
    commission: event.commissionName ?? event.linkedCommissions?.[0]?.name,
    relatedCommissionIds: [
      event.commissionSlug,
      ...(event.linkedCommissions ?? []).map((commission) => commission.slug),
    ].filter(Boolean) as string[],
    isMain: isMainFenasojaEvent(event),
    isOfficial: event.isOfficialSeed,
    isCentralMeeting: centralMeeting,
    pendingReason: event.hasExactDate ? undefined : event.sourceNote ?? 'Aguardando definição de data oficial.',
    decisionNeeded: event.hasExactDate ? undefined : 'Definir data oficial e confirmar responsáveis vinculados.',
    subevents: event.subevents?.map((subevent) => ({
      title: subevent.title,
      date: subevent.startDate ?? null,
      owner: subevent.responsibleName ?? subevent.commissionSlug ?? undefined,
      status: subevent.status ? sourceToVisualStatus[subevent.status] : 'planned',
    })),
  };
}

export function visualEventToSourceUpdates(
  event: CronogramaEvent,
  current: SourceCronogramaEvent,
): Partial<SourceCronogramaEvent> {
  const hasExactDate = Boolean(event.date);

  return {
    title: event.title,
    description: event.summary,
    category: event.sourceCategory || categoryLabels[event.category],
    eventType: visualToSourceKind[event.kind],
    sourceYear: normalizeYear(event.date ? Number(event.date.slice(0, 4)) : event.year),
    startDate: event.date,
    endDate: event.endDate ?? null,
    status: visualToSourceStatus[event.status],
    priority: visualToSourcePriority[event.priority],
    location: event.location ?? null,
    time: event.startTime ?? null,
    responsibleName: event.owner ?? null,
    commissionName: event.commission ?? current.commissionName,
    commissionSlug: current.commissionSlug,
    sourceNote: event.pendingReason ?? event.decisionNeeded ?? current.sourceNote,
    hasExactDate,
    linkedCommissions: current.linkedCommissions,
    subevents: event.subevents?.map((subevent, index) => ({
      title: subevent.title,
      startDate: subevent.date ?? null,
      endDate: subevent.date ?? null,
      responsibleName: subevent.owner ?? null,
      status: subevent.status ? visualToSourceStatus[subevent.status] : 'planejado',
      priority: 'media',
      sortOrder: index,
    })) ?? current.subevents,
  };
}

export function visualEventToDraft(event: CronogramaEvent): CronogramaEventDraft {
  const hasExactDate = Boolean(event.date);

  return {
    sourceKey: event.sourceKey,
    title: event.title,
    description: event.summary,
    category: event.sourceCategory || categoryLabels[event.category],
    eventType: visualToSourceKind[event.kind],
    sourceYear: normalizeYear(event.date ? Number(event.date.slice(0, 4)) : event.year),
    startDate: event.date,
    endDate: event.endDate ?? null,
    status: visualToSourceStatus[event.status],
    priority: visualToSourcePriority[event.priority],
    location: event.location ?? null,
    time: event.startTime ?? null,
    responsibleName: event.owner ?? null,
    commissionName: event.commission ?? null,
    sourceSheet: 'Cadastro manual',
    sourceNote: event.pendingReason ?? event.decisionNeeded ?? null,
    isOfficialSeed: false,
    hasExactDate,
    linkedCommissions: [],
    subevents: event.subevents?.map((subevent, index) => ({
      title: subevent.title,
      startDate: subevent.date ?? null,
      endDate: subevent.date ?? null,
      responsibleName: subevent.owner ?? null,
      status: subevent.status ? visualToSourceStatus[subevent.status] : 'planejado',
      priority: 'media',
      sortOrder: index,
    })) ?? [],
  };
}
