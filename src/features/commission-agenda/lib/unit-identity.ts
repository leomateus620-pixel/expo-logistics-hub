import type { OrgUnit } from '@/lib/org-units';
import { resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import type { UnitSummary } from '../types';
import type { UnitRef } from './event-draft';

/** Names reconcile old catalogs only; persisted UUIDs remain the relationship identity. */
export function resolveUnitDirectory(units: OrgUnit[], entryId?: string | null) {
  const byCanonicalId = new Map<string, UnitRef>();
  const bySlug = new Map<string, UnitSummary>();
  const candidates = new Map<string, OrgUnit[]>();
  for (const unit of units) {
    const official = resolveOfficialUnit(unit.slug) ?? resolveOfficialUnit(unit.name);
    const canonicalId = official?.entry.id ?? unit.slug;
    const ref = { commissionId: unit.id, slug: unit.slug, name: unit.name };
    byCanonicalId.set(unit.id, ref);
    bySlug.set(unit.slug, {
      id: unit.id, commissionId: unit.id, slug: unit.slug,
      name: unit.name, shortName: official?.entry.shortName,
      type: unit.type === 'assessoria' ? 'assessoria' : unit.type === 'conselho' ? 'conselho' : 'comissao',
    });
    candidates.set(canonicalId, [...(candidates.get(canonicalId) ?? []), unit]);
  }
  const ambiguous = new Set<string>();
  for (const [canonicalId, matches] of candidates) {
    const rank = (unit: OrgUnit) => Number(!unit.isLegacy) * 8 + Number(unit.isOfficial) * 4
      + Number(unit.slug === canonicalId) * 2 + Number(Boolean(resolveOfficialUnit(unit.slug)));
    const ordered = [...matches].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
    if (ordered.length > 1 && rank(ordered[0]) === rank(ordered[1])) {
      ambiguous.add(canonicalId);
      continue;
    }
    const unit = ordered[0];
    byCanonicalId.set(canonicalId, { commissionId: unit.id, slug: unit.slug, name: unit.name });
  }
  const owner = entryId ? byCanonicalId.get(entryId) : undefined;
  return {
    commissionId: owner?.commissionId ?? null,
    commissionIdBySlug: owner?.commissionId ?? null,
    commissionSlug: owner?.slug ?? null,
    identityError: entryId && !owner ? (ambiguous.has(entryId)
      ? 'Há mais de um cadastro institucional para esta unidade. Solicite a revisão do cadastro antes de salvar.'
      : 'Unidade institucional não identificada nesta organização. Solicite a vinculação ao cadastro oficial.') : null,
    byCanonicalId,
    unitOptions: [...bySlug.values()].filter(unit => {
      const source = units.find(item => item.id === unit.id);
      return !source?.isLegacy;
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)),
    resolveUnit: (slug: string) => bySlug.get(slug),
  };
}
