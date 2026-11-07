/** Internal views keep the portal pathname, session and existing access boundary. */
export interface EcosystemLocation {
  view: 'organization' | 'memorial';
  pieceId?: string;
  document?: boolean;
}

export function readEcosystemLocation(params: URLSearchParams): EcosystemLocation | null {
  const view = params.get('ecossistema');
  if (view !== 'organizacao' && view !== 'memorial') return null;
  return { view: view === 'memorial' ? 'memorial' : 'organization',
    pieceId: view === 'memorial' ? params.get('edicao') || undefined : undefined,
    document: view === 'memorial' && params.get('edicao') === 'fenasoja-2022' && params.get('documento') === '2020',
  };
}

export function writeEcosystemLocation(current: URLSearchParams, target: EcosystemLocation | null) {
  const next = new URLSearchParams(current);
  for (const key of ['ecossistema', 'edicao', 'documento']) next.delete(key);
  if (target) {
    next.set('ecossistema', target.view === 'memorial' ? 'memorial' : 'organizacao');
    if (target.view === 'memorial' && target.pieceId) next.set('edicao', target.pieceId);
    if (target.view === 'memorial' && target.pieceId === 'fenasoja-2022' && target.document) next.set('documento', '2020');
  }
  return next;
}
