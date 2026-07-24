export function resolveCronogramaReturnFocus(
  preferred: HTMLElement | null | undefined,
) {
  if (preferred?.isConnected) return preferred;
  const viewPanel = document.getElementById('cronograma-view-panel');
  return viewPanel instanceof HTMLElement && viewPanel.isConnected ? viewPanel : null;
}
