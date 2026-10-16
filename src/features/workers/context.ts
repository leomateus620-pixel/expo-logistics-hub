const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve an existing selected record only after the contextual copilot opens. */
export async function resolveWorkersRecord(pathname: string, search: string): Promise<string | undefined> {
  const params = new URLSearchParams(search);
  const candidate = pathname.startsWith('/cronograma-eventos') ? params.get('event')
    : pathname.startsWith('/eventos-restaurante-arena') ? params.get('evento') : null;
  if (candidate && UUID.test(candidate)) return candidate;
  if (/mapa-comercial/.test(pathname)) {
    const { useCommercialMapStore } = await import('@/features/commercial-map/state/useCommercialMapStore');
    const selected = useCommercialMapStore.getState();
    const id = selected.selectedModuleId ?? selected.selectedEntityId;
    if (id && UUID.test(id)) return id;
  }
  return undefined;
}
