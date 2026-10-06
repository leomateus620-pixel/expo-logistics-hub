/** Edição ativa do Financeiro: parâmetro explícito na URL, lembrado só nesta aba. */
export type FinancialEditionCode = '2026' | '2028';
const STORAGE_KEY = 'financial-active-edition';

export function resolveFinancialEdition(search: string, stored: string | null): FinancialEditionCode {
  const requested = new URLSearchParams(search).get('edicao');
  if (requested === '2026' || requested === '2028') return requested;
  return stored === '2028' ? '2028' : '2026';
}

export function readStoredEdition(): string | null {
  try { return window.sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function storeEdition(code: FinancialEditionCode): void {
  try { window.sessionStorage.setItem(STORAGE_KEY, code); } catch { /* armazenamento indisponível */ }
}
