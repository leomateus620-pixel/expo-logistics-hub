/** Esc belongs first to a dialog, popup, or the field currently being edited. */
export function canHandleCommercialMapEscape(event: KeyboardEvent, owner: Document = document) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
  const target = event.target instanceof Element ? event.target : owner.activeElement;
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return false;
  return !owner.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], [data-commercial-map-escape-priority="true"]');
}
