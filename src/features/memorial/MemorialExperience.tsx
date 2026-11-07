import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import { writeEcosystemLocation, type EcosystemLocation } from '@/features/alvorada/ecosystemNavigation';
import { findPiece, historicalDocument, type MemorialPiece } from './catalog';
import { Timeline } from './Timeline';
import PieceDetail from './PieceDetail';
import './memorial.css';

export default function MemorialExperience({ navigation, onNavigate }: { navigation: EcosystemLocation; onNavigate: (target: EcosystemLocation) => void }) {
  const gallery = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const returnPiece = useRef<string>();
  const wasDetail = useRef(false);
  const origin = useRef<CSSProperties>({});
  const candidate = findPiece(navigation.pieceId);
  const piece = navigation.document && navigation.pieceId === 'fenasoja-2022' ? historicalDocument : candidate?.kind === 'document' ? undefined : candidate;
  const invalid = Boolean(navigation.pieceId && !piece);
  const home = useCallback(() => onNavigate({ view: 'organization' }), [onNavigate]);
  const timeline = useCallback(() => onNavigate({ view: 'memorial' }), [onNavigate]);
  const open = useCallback((target: MemorialPiece) => {
    if (!piece) {
      returnPiece.current = target.id;
      const card = gallery.current?.querySelector(`[data-piece-id="${target.id}"] .memorial-piece__image`);
      const rect = card?.getBoundingClientRect();
      const root = gallery.current?.getBoundingClientRect();
      origin.current = rect && root ? { '--entry-x': `${rect.left + rect.width / 2 - root.left - root.width / 2}px`, '--entry-y': `${rect.top + rect.height / 2 - root.top - root.height / 2}px` } as CSSProperties : {};
    }
    onNavigate({ view: 'memorial', pieceId: target.kind === 'document' ? 'fenasoja-2022' : target.id, document: target.kind === 'document' });
  }, [piece, onNavigate]);
  const hrefFor = useCallback((target: MemorialPiece) => {
    const url = new URL(window.location.href);
    url.search = writeEcosystemLocation(url.searchParams, { view: 'memorial', pieceId: target.kind === 'document' ? 'fenasoja-2022' : target.id, document: target.kind === 'document' }).toString();
    return `${url.pathname}${url.search}${url.hash}`;
  }, []);
  useLayoutEffect(() => {
    if (!piece) {
      const target = returnPiece.current && gallery.current?.querySelector<HTMLAnchorElement>(`[data-piece-id="${returnPiece.current}"]`);
      if (wasDetail.current && target) target.focus({ preventScroll: true });
      else title.current?.focus({ preventScroll: true });
    } else if (!wasDetail.current) returnPiece.current = piece.kind === 'document' ? 'fenasoja-2022' : piece.id;
    wasDetail.current = Boolean(piece);
  }, [piece]);
  return <section className="memorial" aria-label="Memorial do Voluntariado" data-detail-open={Boolean(piece)}>
    <div className="memorial-environment" aria-hidden="true"><div className="memorial-environment__mineral" /><div className="memorial-environment__edges" /><div className="memorial-environment__light" /></div>
    <div className="memorial-gallery" ref={gallery} aria-hidden={Boolean(piece)} {...(piece ? { inert: '' } : {})}>
      <header className="memorial-gallery__header">
        <div><h1 ref={title} tabIndex={-1}>Memorial do Voluntariado</h1><p>1966–2026 <span aria-hidden="true">·</span> 25 edições</p></div>
        <button type="button" className="memorial-back" onClick={home} aria-label="Voltar ao Ecossistema"><ArrowLeft size={18} aria-hidden="true" /><span>Ecossistema</span></button>
      </header>
      {invalid && <div className="memorial-not-found" role="status">Peça não encontrada. <button type="button" onClick={timeline}>Ver exposição</button></div>}
      <Timeline onOpen={open} hrefFor={hrefFor} active={!piece} />
    </div>
    {piece && <PieceDetail key={piece.id} piece={piece} onTimeline={timeline} onOpen={open} hrefFor={hrefFor} entryStyle={origin.current} />}
  </section>;
}
