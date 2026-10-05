/** Prévia do recálculo de uma revisão de venda — espelha a regra do servidor (centavos inteiros). */
export interface RevisionInstallment { number: number; amount: number; paid: boolean }

export function previewRevision(input: {
  keptItemTotals: number[];
  addedItemTotals: number[];
  feesCents: number;
  installments: RevisionInstallment[];
  installmentCount: number;
  originalTotal: number;
}) {
  const toC = (v: number) => Math.round(v * 100);
  const subtotalCents = [...input.keptItemTotals, ...input.addedItemTotals].reduce((s, v) => s + toC(v), 0);
  const totalCents = subtotalCents + input.feesCents;
  const paid = input.installments.filter((i) => i.paid);
  const paidCents = paid.reduce((s, i) => s + toC(i.amount), 0);
  const count = Math.max(input.installmentCount, paid.length);
  const unchanged = totalCents === toC(input.originalTotal) && count === input.installments.length;
  let schedule: RevisionInstallment[];
  if (unchanged || input.installments.length === 0) {
    schedule = input.installments;
  } else {
    const kept = input.installments.filter((i) => i.paid || i.number <= count);
    const maxNumber = kept.reduce((m, i) => Math.max(m, i.number), 0);
    const all = [...kept];
    for (let n = maxNumber + 1; n <= count; n += 1) all.push({ number: n, amount: 0, paid: false });
    const open = all.filter((i) => !i.paid);
    const remaining = totalCents - paidCents;
    const each = open.length ? Math.floor(remaining / open.length) : 0;
    const lastOpen = open[open.length - 1];
    schedule = all.map((i) => i.paid ? i : {
      ...i, amount: (i === lastOpen ? each + (remaining - each * open.length) : each) / 100,
    });
  }
  return {
    subtotal: subtotalCents / 100,
    total: totalCents / 100,
    paid: paidCents / 100,
    belowPaid: totalCents < paidCents,
    schedule,
  };
}
