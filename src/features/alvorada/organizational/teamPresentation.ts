import type { OrgNode, OrgNodeResponsibility } from './types';

/** Presentation only: management rights are checked separately by the server. */
export function isSupportResponsibility(responsibility: OrgNodeResponsibility): boolean {
  return responsibility.relationshipRole.trim().toLocaleLowerCase('pt-BR').replace(/[\s-]+/g, '_') === 'equipe_apoio';
}

export function supportPersonIds(node: OrgNode): Set<string> {
  const leaders = new Set(node.responsibilities.filter((item) => !isSupportResponsibility(item)).map((item) => item.personId));
  return new Set(node.responsibilities.flatMap((item) =>
    item.personId && isSupportResponsibility(item) && !leaders.has(item.personId) ? [item.personId] : [],
  ));
}
