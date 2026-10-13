import type { MouseEvent } from 'react';

/** Safari does not focus pointer-clicked buttons; retain an accessible dialog return point. */
export function focusFinancialControl(event: MouseEvent<HTMLElement>) {
  const button = (event.target as Element).closest('button') as HTMLElement | null;
  button?.focus({ preventScroll: true });
}
