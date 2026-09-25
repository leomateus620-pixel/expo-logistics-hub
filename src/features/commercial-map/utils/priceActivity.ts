import { formatBrl } from './lotPricing2028';

interface ActivityLike {
  action: string;
  beforeState: unknown;
  afterState: unknown;
}

const STAGE: Record<string, string> = { RENOVACAO: 'Renovação', SEGUNDA_ETAPA: '2ª Etapa' };

function read(state: unknown): Record<string, unknown> {
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
}

function money(value: unknown): string {
  if (value === null || value === undefined) return 'sem valor';
  return formatBrl(Number(value)) ?? 'sem valor';
}

/** Texto do histórico para alterações manuais de preço; null para outros eventos. */
export function describePriceActivity(item: ActivityLike): { title: string; detail: string; actor: string | null } | null {
  if (item.action !== 'price_override_set' && item.action !== 'price_override_cleared') return null;
  const before = read(item.beforeState);
  const after = read(item.afterState);
  const stage = STAGE[String(after.stage ?? before.stage)] ?? 'etapa';
  const title = item.action === 'price_override_set' ? `Valor da ${stage} alterado` : `Valor da ${stage} restaurado ao oficial`;
  const actor = typeof after.actor_name === 'string' && after.actor_name.trim() ? after.actor_name.trim() : null;
  return { title, detail: `${money(before.total)} → ${money(after.total)}`, actor };
}
