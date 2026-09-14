import type { CronogramaCategory, CronogramaKind } from '@/components/cronograma-eventos/types';

/** Canonical taxonomy (10 categories) used by the Agenda Fenasoja classification engine. */
export const CRONOGRAMA_CATEGORY_ORDER: CronogramaCategory[] = [
  'governanca',
  'programacao',
  'infraestrutura',
  'logistica',
  'comunicacao',
  'comercial',
  'cerimonial',
  'representacoes',
  'financeiro',
  'tecnologia',
];

export const CRONOGRAMA_CATEGORY_LABELS: Record<CronogramaCategory, string> = {
  governanca: 'Governança e Gestão',
  programacao: 'Programação e Eventos',
  infraestrutura: 'Infraestrutura e Operações',
  logistica: 'Logística e Mobilidade',
  comunicacao: 'Comunicação e Marketing',
  comercial: 'Comercial e Patrocínios',
  cerimonial: 'Cerimonial e Protocolo',
  representacoes: 'Relações Institucionais e Representações',
  financeiro: 'Financeiro e Administrativo',
  tecnologia: 'Tecnologia e Sistemas',
};

export const CRONOGRAMA_KIND_LABELS: Record<CronogramaKind, string> = {
  event: 'Evento',
  meeting: 'Reunião',
  deadline: 'Prazo',
  decision: 'Decisão',
  milestone: 'Marco',
};

export const CRONOGRAMA_KIND_HINTS: Record<CronogramaKind, string> = {
  event: 'Atividade, cerimônia, apresentação, visita ou programação realizada em determinada data.',
  meeting: 'Encontro de pessoas ou equipes para alinhamento, planejamento ou acompanhamento.',
  deadline: 'Data limite para entrega, inscrição, pagamento, contratação ou documentação.',
  decision: 'Registro de uma deliberação, aprovação ou definição formal relevante.',
  milestone: 'Momento que representa o avanço ou a conclusão de uma etapa relevante do projeto.',
};

/** Legacy labels/keys seen in the database mapped onto the canonical taxonomy. */
const LEGACY_CATEGORY_PATTERNS: Array<[CronogramaCategory, RegExp]> = [
  ['tecnologia', /tecnolog|sistema|software|portal|aplicativ|\bti\b|dados/i],
  ['financeiro', /financ|or[çc]ament|contabil|administrativ|presta[çc][ãa]o de contas|pagament|tesourar/i],
  ['cerimonial', /cerimoni|protocolo|solenidad|autoridade/i],
  ['representacoes', /representa|comitiva|institucional \/ relacionamento|relacionamento|feriado|data especial/i],
  ['comercial', /comercial|patroc[ií]n|cota|espa[çc]os|ind[úu]stria|com[ée]rcio|servi[çc]os|exporural|capta[çc][ãa]o/i],
  ['comunicacao', /comunica|m[íi]dia|imprensa|marketing|divulga|publicidade|propaganda|revista/i],
  ['logistica', /log[íi]stica|transporte|mobilidade|hotelaria|turismo|estacionamento|frota/i],
  ['infraestrutura', /infra|obra|montagem|pavilh|seguran[çc]a|limpeza|manuten|el[ée]tric|fornecedor|opera[çc][ãa]o|gastronom/i],
  ['programacao', /programa|evento|feira|show|arte|cultura|lan[çc]amento|atra[çc]|novas gera/i],
  ['governanca', /governan|reuni|comiss[ãa]o|planejament|gest[ãa]o|dire[çc][ãa]o|presid|conselho|assessoria/i],
];

/** Old 8-slug taxonomy keys remain valid; only labels changed. */
export function normalizeLegacyCategory(raw: string | null | undefined): CronogramaCategory | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if ((CRONOGRAMA_CATEGORY_ORDER as string[]).includes(value)) return value as CronogramaCategory;
  return LEGACY_CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}
