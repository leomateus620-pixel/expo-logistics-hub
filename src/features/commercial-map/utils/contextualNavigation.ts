/** Esc belongs first to a dialog, popup, or the field currently being edited. */
export function canHandleCommercialMapEscape(event: KeyboardEvent, owner: Document = document) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
  const target = event.target instanceof Element ? event.target : owner.activeElement;
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return false;
  return !owner.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], [data-commercial-map-escape-priority="true"]');
}

/** The Dashboard owns Escape only after its nested popup or dialog has closed. */
export function canHandleCommercialDashboardEscape(event: KeyboardEvent, dashboard: HTMLElement | null, owner: Document = document) {
  if (!dashboard || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
  const target = event.target instanceof Element ? event.target : owner.activeElement;
  const nestedOwner = target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-commercial-map-escape-priority="true"]');
  if (nestedOwner && nestedOwner !== dashboard) return false;
  return !Array.from(owner.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], [data-commercial-map-escape-priority="true"]'))
    .some((element) => element !== dashboard && !element.closest('[hidden], [aria-hidden="true"]'));
}

/** Hidden panels and arrow-navigated tab triggers are outside the Tab sequence. */
export function getCommercialDashboardFocusableElements(dashboard: HTMLElement) {
  return Array.from(dashboard.querySelectorAll<HTMLElement>(
    'button, a[href], input, select, textarea, [tabindex]',
  )).filter((element) => element.tabIndex >= 0
    && !element.matches(':disabled')
    && !element.closest('[hidden], [inert], [aria-hidden="true"]')
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden');
}
