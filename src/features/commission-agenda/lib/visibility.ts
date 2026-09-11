/**
 * Regras centralizadas de visibilidade e permissão dos eventos das
 * Comissões/Assessorias.
 *
 * Nenhum componente deve decidir acesso por nome de comissão ou por texto:
 * tudo aqui trabalha com identificadores reais. O banco replica as mesmas
 * regras via RLS — estas funções apenas mantêm a interface coerente.
 */

export type UnitRelationRole = 'principal' | 'participante';

export interface EventUnitLink {
  commissionId: string | null;
  slug: string | null;
  name: string | null;
  role: UnitRelationRole;
}

export interface EventAccessSubject {
  id: string;
  units: EventUnitLink[];
  /** IDs de usuário das pessoas relacionadas ao evento. */
  peopleUserIds: string[];
  originSource: 'agenda_central' | 'unidade';
  originCommissionId?: string | null;
}

export interface EventAccessContext {
  userId?: string | null;
  /** Papel do usuário na organização. */
  orgRole?: 'admin' | 'gestor' | 'operador' | 'leitura' | null;
  /** IDs das comissões/assessorias em que o usuário é responsável/membro. */
  memberCommissionIds?: string[];
  /** Capacidade global de escrita no cronograma. */
  hasCronogramaWrite?: boolean;
}

export interface CentralAgendaContext {
  /** ID real da Comissão Central. */
  centralCommissionId?: string | null;
  /** IDs de usuário das pessoas da Comissão Central. */
  centralMemberUserIds?: string[];
}

const MANAGER_ROLES = new Set(['admin', 'gestor']);

function isManager(context: EventAccessContext): boolean {
  return Boolean(context.orgRole && MANAGER_ROLES.has(context.orgRole));
}

function unitIds(subject: EventAccessSubject): string[] {
  return subject.units.map((unit) => unit.commissionId).filter((id): id is string => Boolean(id));
}

/** Unidade proprietária (relação `principal`), quando houver. */
export function getOwnerUnitId(subject: EventAccessSubject): string | null {
  return subject.units.find((unit) => unit.role === 'principal')?.commissionId ?? null;
}

export function isOwnerUnit(subject: EventAccessSubject, commissionId: string): boolean {
  return getOwnerUnitId(subject) === commissionId;
}

export function isRelatedUnit(subject: EventAccessSubject, commissionId: string): boolean {
  return unitIds(subject).includes(commissionId);
}

/** Todo membro da organização enxerga o evento; o banco restringe o que for sigiloso. */
export function canViewEvent(subject: EventAccessSubject, context: EventAccessContext): boolean {
  if (isManager(context)) return true;
  if (context.userId && subject.peopleUserIds.includes(context.userId)) return true;
  const member = new Set(context.memberCommissionIds ?? []);
  if (unitIds(subject).some((id) => member.has(id))) return true;
  // Leitura geral da organização continua permitida (as políticas do banco decidem).
  return true;
}

/** Editar exige vínculo com alguma unidade do evento (ou papel de gestão). */
export function canEditEvent(subject: EventAccessSubject, context: EventAccessContext): boolean {
  if (isManager(context) || context.hasCronogramaWrite) return true;
  const member = new Set(context.memberCommissionIds ?? []);
  return unitIds(subject).some((id) => member.has(id));
}

/** Ações críticas: excluir evento, trocar/remover a unidade proprietária. */
export function canManageEvent(subject: EventAccessSubject, context: EventAccessContext): boolean {
  if (isManager(context)) return true;
  const owner = getOwnerUnitId(subject);
  if (!owner) return false;
  return (context.memberCommissionIds ?? []).includes(owner);
}

/** Publicar/remover documentos segue a mesma regra de edição da unidade. */
export function canManageDocuments(
  context: EventAccessContext,
  commissionId: string | null | undefined,
): boolean {
  if (isManager(context) || context.hasCronogramaWrite) return true;
  if (!commissionId) return false;
  return (context.memberCommissionIds ?? []).includes(commissionId);
}

/**
 * O evento entra na timeline principal da Agenda Fenasoja quando:
 * - a Comissão Central está relacionada;
 * - alguma pessoa da Comissão Central está relacionada;
 * - ou o evento nasceu na própria Agenda Fenasoja.
 */
export function canViewInCentralAgenda(
  subject: EventAccessSubject,
  central: CentralAgendaContext = {},
): boolean {
  if (subject.originSource !== 'unidade') return true;
  if (central.centralCommissionId && isRelatedUnit(subject, central.centralCommissionId)) return true;
  const centralPeople = new Set(central.centralMemberUserIds ?? []);
  return subject.peopleUserIds.some((userId) => centralPeople.has(userId));
}

/**
 * Evento restrito continua contando nos indicadores gerenciais, mesmo quando
 * não aparece na timeline central: "ser contabilizado" ≠ "ser exibido".
 */
export function canCountInAnalytics(): boolean {
  return true;
}
