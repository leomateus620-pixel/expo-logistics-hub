import {
  cronogramaCommissionOptions,
  type CronogramaSubeventSeed,
} from '@/data/fenasoja2028CronogramaSeed';
import type { CronogramaEventDraft, CronogramaSubeventDraft } from '@/hooks/useCronogramaEventos';
import {
  isCentralMeeting,
  isMainFenasojaEvent,
  type CronogramaEvent as SourceCronogramaEvent,
} from '@/lib/cronograma-eventos';
import { deriveOperationalStatus, getTodayKey } from '@/lib/cronograma-timeline';
import { categoryLabels } from './cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaKind,
  CronogramaPriority,
  CronogramaStatus,
  CronogramaSubevent,
} from './types';

const commissionBySlug = new Map(cronogramaCommissionOptions.map((commission) => [commission.slug, commission.name]));

const categoryKeywords: Array<[CronogramaCategory, RegExp]> = [
  ['representacoes', /representa[çc][ãa]o|representa[çc][õo]es|agenda institucional|compromisso externo/i],
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
  em_andamento: 'in_progress',
  aguardando_definicao: 'in_definition',
  aguardando_responsavel: 'blocked',
  concluido: 'completed',
  cancelado: 'cancelled',
};

const visualToSourceStatus: Record<CronogramaStatus, SourceCronogramaEvent['status']> = {
  confirmed: 'planejado',
  planned: 'planejado',
  in_progress: 'em_andamento',
  completed: 'concluido',
  overdue: 'planejado',
  rescheduled: 'planejado',
  cancelled: 'cancelado',
  undated: 'aguardando_definicao',
  in_definition: 'aguardando_definicao',
  blocked: 'aguardando_responsavel',
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
  representacao: 'event',
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

export function adaptCronogramaEvent(
  event: SourceCronogramaEvent,
  todayKey = getTodayKey(),
): CronogramaEvent {
  const category = getVisualCategory(event);
  const centralMeeting = isCentralMeeting(event);
  const sourceStatus = sourceToVisualStatus[event.status] ?? 'planned';
  const primaryCommission = event.commissionsRel?.find((link) => link.isPrimary) ?? event.commissionsRel?.[0];
  const primaryResponsible = event.responsiblesRel?.find((link) => link.isPrimary) ?? event.responsiblesRel?.[0];

  const adapted: CronogramaEvent = {
    id: event.id,
    sourceKey: event.sourceKey,
    sourceCategory: event.category,
    sourceSheet: event.sourceSheet,
    title: event.title,
    summary: fallbackSummary(event),
    date: event.hasExactDate ? event.startDate : null,
    endDate: event.hasExactDate ? event.endDate : null,
    startTime: event.startTime ?? event.time ?? undefined,
    endTime: event.endTime ?? undefined,
    year: event.sourceYear,
    category,
    status: sourceStatus,
    priority: sourceToVisualPriority[event.priority] ?? 'medium',
    kind: centralMeeting ? 'meeting' : sourceToVisualKind[event.eventType] ?? 'event',
    location: event.location ?? undefined,
    owner: primaryResponsible?.name ?? event.responsibleName ?? event.commissionName ?? undefined,
    commission: primaryCommission?.commissionName ?? event.commissionName ?? event.linkedCommissions?.[0]?.name,
    relatedCommissionIds: [
      event.commissionSlug,
      ...(event.commissionsRel ?? []).flatMap((commission) => [commission.commissionId, commission.commissionSlug]),
      ...(event.linkedCommissions ?? []).map((commission) => commission.slug),
    ].filter(Boolean) as string[],
    isMain: isMainFenasojaEvent(event),
    isOfficial: event.isOfficialSeed,
    isCentralMeeting: centralMeeting,
    pendingReason: event.hasExactDate ? undefined : event.sourceNote ?? 'Aguardando definição de data oficial.',
    decisionNeeded: event.hasExactDate ? undefined : 'Definir data oficial e confirmar responsáveis vinculados.',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    subevents: event.subevents?.map(adaptCronogramaSubevent),
    lockVersion: event.lockVersion,
    commissionsRel: event.commissionsRel ?? [],
    responsiblesRel: event.responsiblesRel ?? [],
  };
  adapted.status = deriveOperationalStatus(adapted, todayKey);
  adapted.subevents = adapted.subevents?.map((subevent) => ({
    ...subevent,
    status: deriveOperationalStatus({
      date: subevent.date ?? null,
      status: subevent.status ?? 'planned',
    }, todayKey),
  }));
  return adapted;
}

export function adaptCronogramaSubevent(subevent: CronogramaSubeventSeed): CronogramaSubevent {
  const status = subevent.status ? sourceToVisualStatus[subevent.status] : 'planned';
  return {
    id: subevent.id,
    title: subevent.title,
    description: subevent.description ?? null,
    date: subevent.startDate ?? null,
    endDate: subevent.endDate ?? null,
    startTime: subevent.startTime ?? undefined,
    endTime: subevent.endTime ?? undefined,
    owner: subevent.responsibleName ?? undefined,
    status,
    priority: subevent.priority ? sourceToVisualPriority[subevent.priority] : 'medium',
    commissionSlug: subevent.commissionSlug ?? undefined,
    commission: subevent.commissionName
      ?? (subevent.commissionSlug ? commissionBySlug.get(subevent.commissionSlug) : undefined),
    sortOrder: subevent.sortOrder,
    storage: subevent.storage,
    syncState: subevent.syncState,
    syncError: subevent.syncError,
    createdAt: subevent.createdAt,
    updatedAt: subevent.updatedAt,
    lockVersion: subevent.lockVersion,
  };
}

export function visualSubeventToSourceDraft(
  subevent: CronogramaSubevent,
  sortOrder = 0,
): CronogramaSubeventDraft {
  return {
    title: subevent.title.trim(),
    description: subevent.description?.trim() || null,
    startDate: subevent.date ?? null,
    endDate: subevent.endDate ?? subevent.date ?? null,
    startTime: subevent.startTime ?? null,
    endTime: subevent.endTime ?? null,
    responsibleName: subevent.owner?.trim() || null,
    commissionSlug: subevent.commissionSlug ?? null,
    status: subevent.status ? visualToSourceStatus[subevent.status] : 'planejado',
    priority: subevent.priority ? visualToSourcePriority[subevent.priority] : 'media',
    sortOrder,
  };
}

function embeddedSubevents(event: CronogramaEvent, current: SourceCronogramaEvent) {
  const embedded = event.subevents?.filter((subevent) => !subevent.storage || subevent.storage === 'embedded');
  if (!embedded) return current.subevents;
  return embedded.map((subevent, index) => ({
    id: subevent.id,
    title: subevent.title,
    description: subevent.description ?? null,
    startDate: subevent.date ?? null,
    endDate: subevent.endDate ?? subevent.date ?? null,
    responsibleName: subevent.owner ?? null,
    commissionSlug: subevent.commissionSlug ?? null,
    commissionName: subevent.commission ?? null,
    status: subevent.status ? visualToSourceStatus[subevent.status] : 'planejado',
    priority: subevent.priority ? visualToSourcePriority[subevent.priority] : 'media',
    sortOrder: subevent.sortOrder ?? index,
    storage: 'embedded' as const,
  }));
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
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
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
    commissionsRel: event.commissionsRel ?? current.commissionsRel ?? [],
    responsiblesRel: event.responsiblesRel ?? current.responsiblesRel ?? [],
    subevents: embeddedSubevents(event, current),
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
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
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
    commissionsRel: event.commissionsRel ?? [],
    responsiblesRel: event.responsiblesRel ?? [],
    subevents: (event.subevents ?? [])
      .filter((subevent) => !subevent.storage || subevent.storage === 'embedded')
      .map((subevent, index) => ({
        id: subevent.id,
        title: subevent.title,
        description: subevent.description ?? null,
        startDate: subevent.date ?? null,
        endDate: subevent.endDate ?? subevent.date ?? null,
        startTime: subevent.startTime ?? null,
        endTime: subevent.endTime ?? null,
        responsibleName: subevent.owner ?? null,
        commissionSlug: subevent.commissionSlug ?? null,
        commissionName: subevent.commission ?? null,
        status: subevent.status ? visualToSourceStatus[subevent.status] : 'planejado',
        priority: subevent.priority ? visualToSourcePriority[subevent.priority] : 'media',
        sortOrder: subevent.sortOrder ?? index,
        storage: 'embedded',
      })),
  };
}
