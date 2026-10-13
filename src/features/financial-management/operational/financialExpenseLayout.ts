export const EXPENSE_SPLIT_KEY = 'financial-expense-split-2028';

export function readExpenseSplit(): number {
  try {
    const saved = Number(localStorage.getItem(EXPENSE_SPLIT_KEY));
    return saved >= 35 && saved <= 65 ? saved : 50;
  } catch { return 50; }
}
