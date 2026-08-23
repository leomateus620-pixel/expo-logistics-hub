import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';
import type {
  AuthorityLevel,
  OrgDataAnomaly,
  OrgEdge,
  OrgNode,
  OrgNodeResponsibility,
  OrgPerson,
  OrganizationalGraph,
  OrganizationalMemberRecord,
  OrganizationalRawData,
  OrganizationalUnitRecord,
} from './types';

export const ORGANIZATIONAL_ROOT_NODE_ID = 'org:ccp';
export const CCPF_SHORT_LABEL = 'CCPF';
export const CCPF_FULL_LABEL = 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA';

const CENTRAL_COMMISSION_EXCLUDED_NAME = 'ivan squinzani';
const GLOBALLY_EXCLUDED_NAME = 'jardel hillesheim';
const GLOBALLY_EXCLUDED_UNIT_NAMES = new Set([
  'assessoria de projetos e captacoes',
  'assessoria projetos captacoes institucionais',
]);

/**
 * Authority aliases supplied by the institutional brief. They only promote an
 * identity that is present in the current member registry; they never create a person.
 */
const CCP_AUTHORITY_ALIASES = [
  'Marcos Eduardo Servat',
  'Dário Júnior da Motta Germano',
  'Elemar Antonio Lenz',
] as const;

/**
 * Audited repair for the duplicate active executive account observed in the
 * authenticated 2028 registry on 2026-08-22. It is deliberately ID-based and
 * name-guarded: unrelated people with the same display name are never merged.
 */
const EXECUTIVE_IDENTITY_REPAIRS = [
  {
    canonicalUserId: 'b8fd1e36-b46c-4eff-bb75-372b676ce123',
    duplicateUserId: 'efb4e097-5d6d-4d27-96ec-df0d9c9f2de6',
    normalizedName: 'fabiano soltis',
  },
] as const;

const CENTRAL_COMMISSION_NAMES = new Set(['central', 'comissao central']);

interface PersonAccumulator extends OrgPerson {
  normalizedNames: Set<string>;
  roleSet: Set<string>;
  sourceIdSet: Set<string>;
  sourceUserIds: Set<string>;
  sourcePriority: number;
}

interface PersonRegistry {
  people: Map<string, PersonAccumulator>;
  byName: Map<string, string>;
  byUserId: Map<string, string>;
  ambiguousNames: Set<string>;
}

interface UpsertPersonInput {
  fullName: string | null | undefined;
  userId?: string | null;
  avatarUrl?: string | null;
  roles?: Array<string | null | undefined>;
  sourceIds?: Array<string | null | undefined>;
  sourcePriority: number;
}

export function normalizeOrganizationalText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toOrganizationalPresentationText(
  value: string | null | undefined,
): string {
  return (value ?? '').trim().toLocaleUpperCase('pt-BR');
}

function isExactNormalizedName(
  value: string | null | undefined,
  expected: string,
): boolean {
  return normalizeOrganizationalText(value) === expected;
}

function isGloballyExcludedName(value: string | null | undefined): boolean {
  return isExactNormalizedName(value, GLOBALLY_EXCLUDED_NAME);
}

function isCentralCommissionRole(value: string | null | undefined): boolean {
  const normalized = normalizeOrganizationalText(value);
  return isCentralCommissionName(value)
    || normalized.includes('comissao central');
}

function stablePersonId(userId: string | null, normalizedName: string): string {
  if (userId) return `person:user:${userId}`;
  return `person:name:${normalizedName.replace(/\s+/g, '-')}`;
}

const IDENTITY_PARTICLES = new Set([
  'cap',
  'cel',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'ten',
]);

function identityTokens(value: string): string[] {
  return normalizeOrganizationalText(value)
    .split(' ')
    .filter((token) => token && !IDENTITY_PARTICLES.has(token));
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let differences = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) differences += 1;
  return differences <= 1;
}

/**
 * Reconciles real long/short institutional spellings without treating a loose
 * substring as identity. Every token of the shorter name must have a distinct
 * exact (or one-character typo) counterpart and the result must be unique in
 * the loaded registry before it is accepted.
 */
function namesRepresentSameIdentity(left: string, right: string): boolean {
  const leftTokens = identityTokens(left);
  const rightTokens = identityTokens(right);
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;

  const [shorter, longer] = leftTokens.length <= rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  if (longer.length - shorter.length > 2) return false;

  const available = [...longer];
  let fuzzyMatches = 0;
  return shorter.every((token) => {
    const exactIndex = available.indexOf(token);
    if (exactIndex >= 0) {
      available.splice(exactIndex, 1);
      return true;
    }
    if (token.length < 5) return false;
    const typoIndex = available.findIndex((candidate) => (
      candidate.length >= 5 && editDistanceAtMostOne(token, candidate)
    ));
    if (typoIndex < 0) return false;
    fuzzyMatches += 1;
    if (fuzzyMatches > 1) return false;
    available.splice(typoIndex, 1);
    return true;
  });
}

function findUniqueLikelyPersonId(
  registry: PersonRegistry,
  fullName: string,
  userId: string | null,
): string | undefined {
  const matches = [...registry.people.values()].filter((person) => (
    namesRepresentSameIdentity(person.fullName, fullName)
    && (
      !userId
      || person.sourceUserIds.size === 0
      || person.sourceUserIds.has(userId)
    )
  ));
  return matches.length === 1 ? matches[0].id : undefined;
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function addAnomaly(
  anomalies: OrgDataAnomaly[],
  anomaly: OrgDataAnomaly,
): void {
  const key = `${anomaly.code}:${uniqueSorted(anomaly.entityIds).join('|')}:${anomaly.message}`;
  const exists = anomalies.some(
    (item) => `${item.code}:${uniqueSorted(item.entityIds).join('|')}:${item.message}` === key,
  );
  if (!exists) anomalies.push({ ...anomaly, entityIds: uniqueSorted(anomaly.entityIds) });
}

function chooseDisplayName(
  current: PersonAccumulator,
  candidate: string,
  candidatePriority: number,
): void {
  const currentTokens = normalizeOrganizationalText(current.fullName).split(' ').filter(Boolean).length;
  const candidateTokens = normalizeOrganizationalText(candidate).split(' ').filter(Boolean).length;
  const shouldReplace =
    candidatePriority > current.sourcePriority ||
    (candidatePriority === current.sourcePriority && candidateTokens > currentTokens) ||
    (candidatePriority === current.sourcePriority &&
      candidateTokens === currentTokens &&
      candidate.length > current.fullName.length);

  if (shouldReplace) {
    current.fullName = candidate;
    current.sourcePriority = candidatePriority;
  }
}

function createPersonRegistry(): PersonRegistry {
  return {
    people: new Map(),
    byName: new Map(),
    byUserId: new Map(),
    ambiguousNames: new Set(),
  };
}

function upsertPerson(
  registry: PersonRegistry,
  input: UpsertPersonInput,
  anomalies: OrgDataAnomaly[],
): string | null {
  const fullName = nonEmpty(input.fullName);
  if (!fullName) {
    addAnomaly(anomalies, {
      code: 'missing-person-name',
      severity: 'warning',
      message: 'Um registro organizacional sem nome foi ignorado.',
      entityIds: input.sourceIds?.filter((id): id is string => Boolean(id)) ?? [],
    });
    return null;
  }

  const normalizedName = normalizeOrganizationalText(fullName);
  const userId = nonEmpty(input.userId);
  const byUserId = userId ? registry.byUserId.get(userId) : undefined;
  const nameCandidateId = registry.ambiguousNames.has(normalizedName)
    ? undefined
    : registry.byName.get(normalizedName);
  const nameCandidate = nameCandidateId
    ? registry.people.get(nameCandidateId)
    : undefined;
  const nameHasConflictingUser = Boolean(
    userId
    && nameCandidate
    && nameCandidate.sourceUserIds.size > 0
    && !nameCandidate.sourceUserIds.has(userId),
  );
  const byName = nameHasConflictingUser ? undefined : nameCandidateId;
  const byUniqueInstitutionalName = byUserId || byName
    ? undefined
    : findUniqueLikelyPersonId(registry, fullName, userId);
  let personId = byUserId ?? byName ?? byUniqueInstitutionalName;

  if (nameHasConflictingUser && nameCandidateId) {
    addAnomaly(anomalies, {
      code: 'duplicate-person',
      severity: 'warning',
      message: `Contas distintas compartilham o nome ${fullName} e foram mantidas separadas.`,
      entityIds: [nameCandidateId, userId as string],
    });
  }

  if (byUserId && byName && byUserId !== byName) {
    // This is intentionally conservative: keep the user-backed identity and
    // report the competing name identity rather than silently joining graphs.
    personId = byUserId;
    addAnomaly(anomalies, {
      code: 'duplicate-person',
      severity: 'warning',
      message: `Identidades concorrentes foram encontradas para ${fullName}.`,
      entityIds: [byUserId, byName],
    });
  }

  if (!personId) {
    personId = stablePersonId(userId, normalizedName);
    if (!registry.people.has(personId)) {
      const photo = input.avatarUrl ?? getPersonPhoto(fullName, userId);
      registry.people.set(personId, {
        id: personId,
        userId,
        fullName,
        avatarUrl: photo,
        roles: [],
        highestAuthorityLevel: 5,
        sourceIds: [],
        normalizedNames: new Set([normalizedName]),
        roleSet: new Set(),
        sourceIdSet: new Set(),
        sourceUserIds: new Set(userId ? [userId] : []),
        sourcePriority: input.sourcePriority,
      });
    }
  }

  const person = registry.people.get(personId);
  if (!person) return null;

  if (!person.normalizedNames.has(normalizedName) && person.normalizedNames.size > 0) {
    addAnomaly(anomalies, {
      code: 'conflicting-person-name',
      severity: 'info',
      message: `Mais de uma grafia real foi conciliada para ${person.fullName}.`,
      entityIds: [personId],
    });
  }

  if (userId && person.sourceUserIds.size > 0 && !person.sourceUserIds.has(userId)) {
    addAnomaly(anomalies, {
      code: 'duplicate-person',
      severity: 'warning',
      message: `Mais de um usuário foi conciliado para ${person.fullName}.`,
      entityIds: [personId, ...person.sourceUserIds, userId],
    });
  }

  chooseDisplayName(person, fullName, input.sourcePriority);
  person.normalizedNames.add(normalizedName);
  if (userId) {
    person.sourceUserIds.add(userId);
    registry.byUserId.set(userId, personId);
    if (!person.userId) person.userId = userId;
  }
  const existingNamePersonId = registry.byName.get(normalizedName);
  if (existingNamePersonId && existingNamePersonId !== personId) {
    registry.byName.delete(normalizedName);
    registry.ambiguousNames.add(normalizedName);
  } else if (!registry.ambiguousNames.has(normalizedName)) {
    registry.byName.set(normalizedName, personId);
  }

  input.roles?.forEach((role) => {
    const value = nonEmpty(role);
    if (value) person.roleSet.add(value);
  });
  input.sourceIds?.forEach((sourceId) => {
    const value = nonEmpty(sourceId);
    if (value) person.sourceIdSet.add(value);
  });
  if (input.avatarUrl && !person.avatarUrl) person.avatarUrl = input.avatarUrl;
  if (!person.avatarUrl) person.avatarUrl = getPersonPhoto(person.fullName, person.userId);

  return personId;
}

function personIdForMember(
  registry: PersonRegistry,
  member: OrganizationalMemberRecord,
): string | null {
  const userId = nonEmpty(member.user_id);
  if (userId) {
    const match = registry.byUserId.get(userId);
    if (match) return match;
  }
  const name = normalizeOrganizationalText(member.nome_exibicao);
  return name ? registry.byName.get(name) ?? null : null;
}

function personIdForIdentity(
  registry: PersonRegistry,
  name: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  const normalizedUserId = nonEmpty(userId);
  if (normalizedUserId) {
    const match = registry.byUserId.get(normalizedUserId);
    if (match) return match;
  }
  const normalizedName = normalizeOrganizationalText(name);
  return normalizedName ? registry.byName.get(normalizedName) ?? null : null;
}

function isCentralCommissionName(value: string | null | undefined): boolean {
  return CENTRAL_COMMISSION_NAMES.has(normalizeOrganizationalText(value));
}

function isCentralCommissionUnit(unit: OrganizationalUnitRecord): boolean {
  return isCentralCommissionName(unit.name) || isCentralCommissionName(unit.slug);
}

function findCentralUnits(units: readonly OrganizationalUnitRecord[]): OrganizationalUnitRecord[] {
  return units.filter(isCentralCommissionUnit);
}

function isCentralMember(
  member: OrganizationalMemberRecord,
  centralUnitIds: ReadonlySet<string>,
): boolean {
  const commissionId = nonEmpty(member.commission_id);
  return Boolean(
    (commissionId && centralUnitIds.has(commissionId)) ||
      isCentralCommissionName(member.commission_nome),
  );
}

export type ExecutiveRole = 'president' | 'vice-president';

/** Explicit cargo mapping; commission presidents are not promoted by a substring. */
export function resolveExecutiveRole(
  cargo: string | null | undefined,
): ExecutiveRole | null {
  const normalized = normalizeOrganizationalText(cargo);
  if (!normalized) return null;

  if (
    normalized === 'vice presidente' ||
    normalized === 'vice presidente fenasoja' ||
    normalized === 'vice presidente fenasoja 2028' ||
    normalized === 'vice presidente da fenasoja' ||
    normalized === 'vice presidente da fenasoja 2028'
  ) {
    return 'vice-president';
  }

  if (
    normalized === 'presidente' ||
    normalized === 'presidente fenasoja' ||
    normalized === 'presidente fenasoja 2028' ||
    normalized === 'presidente da fenasoja' ||
    normalized === 'presidente da fenasoja 2028'
  ) {
    return 'president';
  }

  return null;
}

function repairedExecutiveGroupId(
  registry: PersonRegistry,
  personId: string,
): string {
  const person = registry.people.get(personId);
  if (!person) return personId;

  const repair = EXECUTIVE_IDENTITY_REPAIRS.find(({ canonicalUserId, duplicateUserId }) =>
    person.sourceUserIds.has(canonicalUserId) || person.sourceUserIds.has(duplicateUserId),
  );
  if (!repair) return personId;

  const canonicalPersonId = registry.byUserId.get(repair.canonicalUserId);
  const canonical = canonicalPersonId ? registry.people.get(canonicalPersonId) : null;
  const matchesAuditedName = normalizeOrganizationalText(person.fullName)
    === repair.normalizedName
    && normalizeOrganizationalText(canonical?.fullName) === repair.normalizedName;
  return canonicalPersonId && canonical && matchesAuditedName
    ? canonicalPersonId
    : personId;
}

/**
 * Applies only the audited duplicate-account repair above. All other distinct
 * user IDs remain separate, including exact homonyms in the executive layer.
 */
function reconcileExecutiveIdentities(
  registry: PersonRegistry,
  executiveRoles: Map<string, Set<ExecutiveRole>>,
  anomalies: OrgDataAnomaly[],
): Map<string, Set<ExecutiveRole>> {
  const groups = new Map<
    string,
    Array<{ personId: string; roles: Set<ExecutiveRole> }>
  >();

  executiveRoles.forEach((roles, personId) => {
    const key = repairedExecutiveGroupId(registry, personId);
    const candidates = groups.get(key) ?? [];
    candidates.push({ personId, roles });
    groups.set(key, candidates);
  });

  const reconciled = new Map<string, Set<ExecutiveRole>>();

  groups.forEach((candidates, canonicalGroupId) => {
    candidates.sort((left, right) => {
      const leftIsAuditedCanonical = left.personId === canonicalGroupId ? 1 : 0;
      const rightIsAuditedCanonical = right.personId === canonicalGroupId ? 1 : 0;
      if (leftIsAuditedCanonical !== rightIsAuditedCanonical) {
        return rightIsAuditedCanonical - leftIsAuditedCanonical;
      }
      const leftPresident = left.roles.has('president') ? 1 : 0;
      const rightPresident = right.roles.has('president') ? 1 : 0;
      if (leftPresident !== rightPresident) return rightPresident - leftPresident;

      const leftPerson = registry.people.get(left.personId);
      const rightPerson = registry.people.get(right.personId);
      const priorityDifference =
        (rightPerson?.sourcePriority ?? 0) - (leftPerson?.sourcePriority ?? 0);
      if (priorityDifference !== 0) return priorityDifference;
      return left.personId.localeCompare(right.personId);
    });

    const canonicalCandidate = candidates[0];
    if (!canonicalCandidate) return;
    const canonical = registry.people.get(canonicalCandidate.personId);
    if (!canonical) return;
    const normalizedName = normalizeOrganizationalText(canonical.fullName);

    const mergedRoles = new Set<ExecutiveRole>();
    const reconciledIdentityIds = new Set<string>();

    candidates.forEach(({ personId, roles }) => {
      roles.forEach((role) => mergedRoles.add(role));
      const source = registry.people.get(personId);
      if (!source) return;

      reconciledIdentityIds.add(personId);
      source.sourceUserIds.forEach((userId) => reconciledIdentityIds.add(userId));
      if (personId === canonical.id) return;

      chooseDisplayName(canonical, source.fullName, source.sourcePriority);
      source.normalizedNames.forEach((name) => canonical.normalizedNames.add(name));
      source.roleSet.forEach((role) => canonical.roleSet.add(role));
      source.sourceIdSet.forEach((sourceId) => canonical.sourceIdSet.add(sourceId));
      source.sourceUserIds.forEach((userId) => {
        canonical.sourceUserIds.add(userId);
        registry.byUserId.set(userId, canonical.id);
      });
      if (!canonical.avatarUrl && source.avatarUrl) canonical.avatarUrl = source.avatarUrl;
      if (source.highestAuthorityLevel < canonical.highestAuthorityLevel) {
        canonical.highestAuthorityLevel = source.highestAuthorityLevel;
      }
      canonical.sourcePriority = Math.max(canonical.sourcePriority, source.sourcePriority);
      registry.people.delete(personId);
    });

    if (candidates.length > 1) {
      for (let index = anomalies.length - 1; index >= 0; index -= 1) {
        const anomaly = anomalies[index];
        const namesThisExecutive = normalizeOrganizationalText(anomaly.message)
          .includes(normalizedName);
        const touchesThisExecutive = anomaly.entityIds.some((entityId) =>
          reconciledIdentityIds.has(entityId),
        );
        if (anomaly.code === 'duplicate-person' && namesThisExecutive && touchesThisExecutive) {
          anomalies.splice(index, 1);
        }
      }

      addAnomaly(anomalies, {
        code: 'duplicate-person',
        severity: 'info',
        message: `Registros executivos duplicados de ${canonical.fullName} foram conciliados em uma identidade visual canônica.`,
        entityIds: [...reconciledIdentityIds],
      });
    }

    const remainingCollision = [...registry.people.values()].some((person) =>
      person.id !== canonical.id && person.normalizedNames.has(normalizedName),
    );
    if (remainingCollision) {
      registry.byName.delete(normalizedName);
      registry.ambiguousNames.add(normalizedName);
    } else {
      registry.byName.set(normalizedName, canonical.id);
      registry.ambiguousNames.delete(normalizedName);
    }

    reconciled.set(canonical.id, mergedRoles);
  });

  return reconciled;
}

function sortedMembers(
  members: readonly OrganizationalMemberRecord[],
): OrganizationalMemberRecord[] {
  return [...members]
    .filter((member) => member.is_active !== false)
    .sort((a, b) => {
      const nameOrder = normalizeOrganizationalText(a.nome_exibicao).localeCompare(
        normalizeOrganizationalText(b.nome_exibicao),
        'pt-BR',
      );
      if (nameOrder !== 0) return nameOrder;
      return (a.user_id ?? '').localeCompare(b.user_id ?? '');
    });
}

function sortedUnits(units: readonly OrganizationalUnitRecord[]): OrganizationalUnitRecord[] {
  return [...units].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const nameOrder = a.name.localeCompare(b.name, 'pt-BR');
    return nameOrder !== 0 ? nameOrder : a.id.localeCompare(b.id);
  });
}

function addAuthority(person: PersonAccumulator | undefined, level: AuthorityLevel): void {
  if (person) person.highestAuthorityLevel = Math.min(person.highestAuthorityLevel, level) as AuthorityLevel;
}

function deduplicateResponsibilities(
  responsibilities: OrgNodeResponsibility[],
): OrgNodeResponsibility[] {
  const reconciled = new Map<string, OrgNodeResponsibility>();
  responsibilities.forEach((responsibility) => {
    const identity = responsibility.personId
      ? `person:${responsibility.personId}`
      : `${responsibility.responsibleType}:${normalizeOrganizationalText(responsibility.displayName)}`;
    const key = `${identity}:${normalizeOrganizationalText(responsibility.relationshipRole)}`;
    const current = reconciled.get(key);
    if (!current) {
      reconciled.set(key, responsibility);
      return;
    }
    if (responsibility.isPrimary && !current.isPrimary) {
      reconciled.set(key, {
        ...responsibility,
        isPrimary: true,
      });
    }
  });
  return [...reconciled.values()];
}

function node(
  value: Omit<OrgNode, 'childIds' | 'isRenderable'> & { isRenderable?: boolean },
): OrgNode {
  return {
    ...value,
    title: toOrganizationalPresentationText(value.title),
    subtitle: value.subtitle
      ? toOrganizationalPresentationText(value.subtitle)
      : null,
    responsibilities: value.responsibilities.map((responsibility) => ({
      ...responsibility,
      displayName: toOrganizationalPresentationText(responsibility.displayName),
      relationshipRole: toOrganizationalPresentationText(responsibility.relationshipRole),
    })),
    childIds: [],
    isRenderable: value.isRenderable ?? value.authorityLevel <= 4,
  };
}

function appendEdgesAndChildren(nodes: OrgNode[]): OrgEdge[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const edges: OrgEdge[] = [];

  nodes.forEach((target) => {
    target.parentIds = uniqueSorted(target.parentIds.filter((parentId) => byId.has(parentId)));
    target.parentIds.forEach((sourceId) => {
      const source = byId.get(sourceId);
      if (!source) return;
      source.childIds.push(target.id);
      edges.push({
        id: `edge:${sourceId}->${target.id}`,
        sourceId,
        targetId: target.id,
        authorityLevel: target.authorityLevel,
      });
    });
  });

  nodes.forEach((item) => {
    item.childIds = uniqueSorted(item.childIds);
  });

  return edges.sort((a, b) => a.id.localeCompare(b.id));
}

function finalizePerson(person: PersonAccumulator): OrgPerson {
  const visibleRoles = [...person.roleSet].filter((role) => (
    !isExactNormalizedName(person.fullName, CENTRAL_COMMISSION_EXCLUDED_NAME)
    || !isCentralCommissionRole(role)
  ));
  return {
    id: person.id,
    userId: person.userId,
    fullName: toOrganizationalPresentationText(person.fullName),
    avatarUrl: person.avatarUrl,
    roles: uniqueSorted(
      visibleRoles.map(toOrganizationalPresentationText),
    ),
    highestAuthorityLevel: person.highestAuthorityLevel,
    sourceIds: uniqueSorted(person.sourceIdSet),
  };
}

function errorForMissingAuthority(
  anomalies: OrgDataAnomaly[],
  code: 'missing-president' | 'missing-vice-president',
  label: string,
): void {
  addAnomaly(anomalies, {
    code,
    severity: 'warning',
    message: `Nenhum cargo real de ${label} foi localizado na Comissão Central.`,
    entityIds: [],
  });
}

/**
 * Converts current Agenda/organization records into the deterministic graph
 * consumed by the Alvorada experience. No person or assignment is synthesized.
 */
export function buildOrganizationalGraph(raw: OrganizationalRawData): OrganizationalGraph {
  const anomalies: OrgDataAnomaly[] = [];
  const registry = createPersonRegistry();
  const allMembers = sortedMembers(raw.members);
  const globallyExcludedMembers = allMembers.filter((member) => (
    isGloballyExcludedName(member.nome_exibicao)
  ));
  const globallyExcludedUserIds = new Set(
    globallyExcludedMembers
      .map((member) => nonEmpty(member.user_id))
      .filter((userId): userId is string => Boolean(userId)),
  );
  const globallyExcludedUnitIds = new Set(
    globallyExcludedMembers
      .map((member) => nonEmpty(member.commission_id))
      .filter((unitId): unitId is string => Boolean(unitId)),
  );
  const globallyExcludedUnitNames = new Set([
    ...GLOBALLY_EXCLUDED_UNIT_NAMES,
    ...globallyExcludedMembers
      .map((member) => normalizeOrganizationalText(member.commission_nome))
      .filter(Boolean),
  ]);
  const members = allMembers.filter(
    (member) => !isGloballyExcludedName(member.nome_exibicao),
  );
  const units = sortedUnits(raw.units).filter((unit) => (
    isCentralCommissionUnit(unit)
    || (
      !globallyExcludedUnitIds.has(unit.id)
      && !globallyExcludedUnitNames.has(normalizeOrganizationalText(unit.name))
      && !globallyExcludedUnitNames.has(normalizeOrganizationalText(unit.slug))
      && !unit.responsibles.some((responsible) => (
        isGloballyExcludedName(responsible.displayName)
        || Boolean(responsible.userId && globallyExcludedUserIds.has(responsible.userId))
      ))
    )
  ));
  const volunteers = raw.volunteers?.filter((volunteer) => (
    !isGloballyExcludedName(volunteer.fullName)
    && !(volunteer.userId && globallyExcludedUserIds.has(volunteer.userId))
  )) ?? [];
  const centralUnits = findCentralUnits(units);
  const centralUnitIds = new Set(centralUnits.map((unit) => unit.id));
  const hasCentralMembership = members.some((member) =>
    isCentralMember(member, centralUnitIds),
  );

  members.forEach((member) => {
    upsertPerson(
      registry,
      {
        fullName: member.nome_exibicao,
        userId: member.user_id,
        avatarUrl: member.avatar_url ?? member.photo_url,
        // `role` is an authorization value (admin/gestor/operador), not an
        // institutional responsibility and must never surface in this graph.
        roles: [member.cargo, member.commission_nome],
        sourceIds: [member.id, member.user_id],
        sourcePriority: 3,
      },
      anomalies,
    );
  });

  const levelFourUnits = units.filter((unit) => {
    const supportedType = unit.type === 'comissao' || unit.type === 'assessoria';
    const isCentral = isCentralCommissionUnit(unit);
    const included =
      supportedType && unit.isOfficial && !unit.isLegacy && !isCentral;
    if (!included && !isCentral) {
      addAnomaly(anomalies, {
        code: 'excluded-unit',
        severity: 'info',
        message: `A unidade ${unit.name} não pertence ao conjunto oficial e atual do nível 4.`,
        entityIds: [unit.id],
      });
    }
    return included;
  });

  levelFourUnits.forEach((unit) => {
    unit.responsibles.forEach((responsible) => {
      if (responsible.responsibleType !== 'pessoa') return;
      upsertPerson(
        registry,
        {
          fullName: responsible.displayName,
          userId: responsible.userId,
          roles: [responsible.relationshipRole, unit.name],
          sourceIds: [responsible.id, responsible.userId],
          sourcePriority: 2,
        },
        anomalies,
      );
    });
  });

  volunteers.forEach((volunteer) => {
    upsertPerson(
      registry,
      {
        fullName: volunteer.fullName,
        userId: volunteer.userId,
        avatarUrl: volunteer.avatarUrl,
        roles: volunteer.roles,
        sourceIds: [volunteer.id, volunteer.userId],
        sourcePriority: 1,
      },
      anomalies,
    );
  });

  const ccpAliasKeys = new Set(CCP_AUTHORITY_ALIASES.map(normalizeOrganizationalText));
  const ccpPersonIds = uniqueSorted(
    members.flatMap((member) => {
      if (!ccpAliasKeys.has(normalizeOrganizationalText(member.nome_exibicao))) return [];
      const personId = personIdForMember(registry, member);
      return personId ? [personId] : [];
    }),
  );

  CCP_AUTHORITY_ALIASES.forEach((alias) => {
    const normalized = normalizeOrganizationalText(alias);
    if (!members.some((member) => normalizeOrganizationalText(member.nome_exibicao) === normalized)) {
      addAnomaly(anomalies, {
        code: 'missing-ccp-member',
        severity: 'info',
        message: `${alias} não foi incluído no CCPF porque não existe nos membros ativos carregados.`,
        entityIds: [],
      });
    }
  });

  ccpPersonIds.forEach((personId) => addAuthority(registry.people.get(personId), 1));

  let executiveRoles = new Map<string, Set<ExecutiveRole>>();
  members.forEach((member) => {
    const role = resolveExecutiveRole(member.cargo);
    if (!role) return;
    const explicitlyFenasoja = normalizeOrganizationalText(member.cargo).includes('fenasoja');
    if (!isCentralMember(member, centralUnitIds) && !explicitlyFenasoja) return;
    const personId = personIdForMember(registry, member);
    if (!personId || ccpPersonIds.includes(personId)) return;
    const roles = executiveRoles.get(personId) ?? new Set<ExecutiveRole>();
    roles.add(role);
    executiveRoles.set(personId, roles);
    addAuthority(registry.people.get(personId), 2);
  });

  executiveRoles = reconcileExecutiveIdentities(registry, executiveRoles, anomalies);

  const presidentPersonIds = [...executiveRoles.entries()]
    .filter(([, roles]) => roles.has('president'))
    .map(([personId]) => personId);
  const vicePresidentPersonIds = [...executiveRoles.entries()]
    .filter(([, roles]) => roles.has('vice-president'))
    .map(([personId]) => personId);
  const sharedExecutiveIdentity = presidentPersonIds.some((personId) =>
    vicePresidentPersonIds.includes(personId),
  );
  if (
    presidentPersonIds.length > 1
    || vicePresidentPersonIds.length > 1
    || sharedExecutiveIdentity
  ) {
    addAnomaly(anomalies, {
      code: 'executive-cardinality',
      severity: 'warning',
      message: `O cadastro executivo contém ${presidentPersonIds.length} vínculo(s) de Presidência e ${vicePresidentPersonIds.length} de Vice-Presidência; os papéis reais foram preservados sem criar retratos duplicados.`,
      entityIds: [...presidentPersonIds, ...vicePresidentPersonIds],
    });
  }

  if (![...executiveRoles.values()].some((roles) => roles.has('president'))) {
    errorForMissingAuthority(anomalies, 'missing-president', 'Presidente');
  }
  if (![...executiveRoles.values()].some((roles) => roles.has('vice-president'))) {
    errorForMissingAuthority(anomalies, 'missing-vice-president', 'Vice-Presidente');
  }

  const executivePersonIds = new Set(executiveRoles.keys());
  const centralPersonIds = uniqueSorted(
    members.flatMap((member) => {
      if (!isCentralMember(member, centralUnitIds)) return [];
      const personId = personIdForMember(registry, member);
      if (!personId || ccpPersonIds.includes(personId) || executivePersonIds.has(personId)) return [];
      if (isExactNormalizedName(
        registry.people.get(personId)?.fullName,
        CENTRAL_COMMISSION_EXCLUDED_NAME,
      )) return [];
      return [personId];
    }),
  );
  centralPersonIds.forEach((personId) => addAuthority(registry.people.get(personId), 3));

  if (centralUnits.length === 0) {
    addAnomaly(anomalies, {
      code: 'missing-central-commission',
      severity: 'warning',
      message: hasCentralMembership
        ? 'A Comissão Central foi resolvida pelos memberships, mas sua unidade não foi localizada.'
        : 'Nenhuma unidade ou membership real de Comissão Central foi localizado.',
      entityIds: [],
    });
  }

  const nodes: OrgNode[] = [
    node({
      id: ORGANIZATIONAL_ROOT_NODE_ID,
      type: 'ccp',
      authorityLevel: 1,
      title: CCPF_SHORT_LABEL,
      subtitle: CCPF_FULL_LABEL,
      personIds: ccpPersonIds,
      parentIds: [],
      commissionId: null,
      advisoryId: null,
      sortOrder: 0,
      responsibilities: [],
      metadata: { presentationCode: CCPF_SHORT_LABEL },
    }),
  ];

  const executiveNodes = [...executiveRoles.entries()]
    .sort(([personIdA, rolesA], [personIdB, rolesB]) => {
      const roleA = rolesA.has('president') ? 0 : 1;
      const roleB = rolesB.has('president') ? 0 : 1;
      if (roleA !== roleB) return roleA - roleB;
      return (registry.people.get(personIdA)?.fullName ?? '').localeCompare(
        registry.people.get(personIdB)?.fullName ?? '',
        'pt-BR',
      );
    })
    .map(([personId, roles], index) => {
      const person = registry.people.get(personId);
      const executiveRole = roles.has('president') ? 'president' : 'vice-president';
      return node({
        id: `executive:${personId}`,
        type: 'executive',
        authorityLevel: 2,
        title: person?.fullName ?? '',
        subtitle: executiveRole === 'president' ? 'Presidente' : 'Vice-Presidente',
        personIds: [personId],
        parentIds: [ORGANIZATIONAL_ROOT_NODE_ID],
        commissionId: centralUnits[0]?.id ?? null,
        advisoryId: null,
        sortOrder: index,
        responsibilities: [],
        metadata: { executiveRole: uniqueSorted(roles) },
      });
    });
  nodes.push(...executiveNodes);

  const centralNodeId = centralUnits.length > 0 || hasCentralMembership
    ? 'org:central-commission'
    : null;
  if (centralNodeId) {
    nodes.push(
      node({
        id: centralNodeId,
        type: 'central-commission',
        authorityLevel: 3,
        title: 'Comissão Central',
        subtitle: centralPersonIds.length > 0 ? `${centralPersonIds.length} integrantes` : null,
        personIds: centralPersonIds,
        parentIds:
          executiveNodes.length > 0
            ? executiveNodes.map((item) => item.id)
            : [ORGANIZATIONAL_ROOT_NODE_ID],
        commissionId: centralUnits[0]?.id ?? null,
        advisoryId: null,
        sortOrder: 0,
        responsibilities: [],
        metadata: {
          sourceUnitIds: centralUnits.map((unit) => unit.id),
          resolvedFromMembership: centralUnits.length === 0,
        },
      }),
    );
  }

  const levelFourParentIds = centralNodeId
    ? [centralNodeId]
    : executiveNodes.length > 0
      ? executiveNodes.map((item) => item.id)
      : [ORGANIZATIONAL_ROOT_NODE_ID];

  levelFourUnits.forEach((unit) => {
    const responsibilities = deduplicateResponsibilities(unit.responsibles.map((responsible) => ({
      id: responsible.id,
      personId:
        responsible.responsibleType === 'pessoa'
          ? personIdForIdentity(registry, responsible.displayName, responsible.userId)
          : null,
      displayName: responsible.displayName,
      responsibleType: responsible.responsibleType,
      relationshipRole: responsible.relationshipRole,
      isPrimary: responsible.isPrimary,
    })));
    const personIds = uniqueSorted(
      responsibilities.flatMap((responsibility) =>
        responsibility.personId ? [responsibility.personId] : [],
      ),
    ).filter((personId) => (
      unit.type === 'assessoria'
      || (registry.people.get(personId)?.highestAuthorityLevel ?? 5) >= 4
    ));
    personIds.forEach((personId) => addAuthority(registry.people.get(personId), 4));

    nodes.push(
      node({
        id: `unit:${unit.id}`,
        type: unit.type === 'assessoria' ? 'advisory' : 'commission',
        authorityLevel: 4,
        title: unit.name,
        subtitle: unit.type === 'assessoria' ? 'Assessoria' : 'Comissão',
        personIds,
        parentIds: levelFourParentIds,
        commissionId: unit.type === 'comissao' ? unit.id : null,
        advisoryId: unit.type === 'assessoria' ? unit.id : null,
        sortOrder: unit.displayOrder,
        responsibilities,
        metadata: {
          unitSlug: unit.slug,
          unitType: unit.type,
          teamLabels: responsibilities
            .filter((responsibility) => responsibility.responsibleType === 'equipe')
            .map((responsibility) => (
              toOrganizationalPresentationText(responsibility.displayName)
            )),
        },
      }),
    );
  });

  volunteers.forEach((volunteer, index) => {
    const personId = personIdForIdentity(registry, volunteer.fullName, volunteer.userId);
    if (!personId) return;
    addAuthority(registry.people.get(personId), 5);
    const parentNodeId = `unit:${volunteer.parentCommissionId}`;
    if (!nodes.some((item) => item.id === parentNodeId)) {
      addAnomaly(anomalies, {
        code: 'orphan-volunteer',
        severity: 'warning',
        message: `${volunteer.fullName} referencia uma unidade sem nó organizacional atual.`,
        entityIds: [volunteer.id, volunteer.parentCommissionId],
      });
    }
    nodes.push(
      node({
        id: `volunteer:${volunteer.id}`,
        type: 'volunteer',
        authorityLevel: 5,
        title: volunteer.fullName,
        subtitle: 'Voluntariado',
        personIds: [personId],
        parentIds: [parentNodeId],
        commissionId: volunteer.parentCommissionId,
        advisoryId: null,
        sortOrder: index,
        isRenderable: false,
        responsibilities: [],
        metadata: {},
      }),
    );
  });

  const usedPersonIds = new Set(nodes.flatMap((item) => item.personIds));
  usedPersonIds.forEach((personId) => {
    const person = registry.people.get(personId);
    if (person && !person.avatarUrl) {
      addAnomaly(anomalies, {
        code: 'missing-avatar',
        severity: 'info',
        message: `${person.fullName} permanece renderizável com o estado neutro sem retrato.`,
        entityIds: [personId],
      });
    }
  });

  const people = Object.fromEntries(
    [...usedPersonIds]
      .map((personId) => registry.people.get(personId))
      .filter((person): person is PersonAccumulator => Boolean(person))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((person) => [person.id, finalizePerson(person)]),
  );

  nodes.sort((a, b) => {
    if (a.authorityLevel !== b.authorityLevel) return a.authorityLevel - b.authorityLevel;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, 'pt-BR');
  });
  const edges = appendEdgesAndChildren(nodes);

  anomalies.sort((a, b) => {
    const severityOrder = a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1;
    return severityOrder !== 0 ? severityOrder : a.message.localeCompare(b.message, 'pt-BR');
  });

  return {
    people,
    nodes,
    edges,
    anomalies,
    rootNodeId: ORGANIZATIONAL_ROOT_NODE_ID,
    renderableNodeIds: nodes
      .filter((item) => item.isRenderable && item.authorityLevel <= 4)
      .map((item) => item.id),
  };
}
