/** Aritmética financeira em centavos inteiros (nunca ponto flutuante para fechar valores). */

export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Divide o total em n parcelas; os centavos restantes vão para as primeiras, 1 a 1. */
export function splitCents(totalCents: number, count: number): number[] {
  if (count <= 0 || totalCents < 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Converte o texto digitado (qualquer máscara) em centavos: "1.234,56" → 123456. */
export function parseMoneyInputToCents(input: string): number {
  const digits = input.replace(/\D+/g, '').slice(0, 12);
  return digits ? Number(digits) : 0;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

export function formatCentsPlain(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
