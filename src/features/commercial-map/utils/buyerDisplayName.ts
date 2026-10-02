import { normalizeSearchTerm as normalizeSearchText } from '@/lib/org-units';

/** Nome de exibição: nome fantasia (sem espaços nas extremidades) ou, na falta, nome / razão social. */
export function buyerDisplayName(tradeName: string | null | undefined, legalName: string | null | undefined): string | null {
  const trade = tradeName?.trim() ?? '';
  if (trade) return trade;
  const legal = legalName?.trim() ?? '';
  return legal || null;
}

/** Normaliza o nome fantasia digitado: só espaços equivale a vazio (remove o valor). */
export function normalizeTradeName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

/** Busca por nome fantasia e/ou razão social, ignorando caixa, acentos e espaços extras. */
export function matchesBuyerNames(query: string, ...names: Array<string | null | undefined>): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return names.some((name) => !!name && normalizeSearchText(name).includes(q));
}
