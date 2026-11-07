import { useCallback, useLayoutEffect, useRef } from 'react';
import { ArrowLeft, ArrowDown, Landmark } from 'lucide-react';
import { writeEcosystemLocation, type EcosystemLocation } from '@/features/alvorada/ecosystemNavigation';
import { findPiece, historicalDocument, historicalEditions, pieceLabel, timelinePieces, type MemorialPiece } from './catalog';
import { Timeline } from './Timeline';
import PieceDetail from './PieceDetail';
import './memorial.css';

export default function MemorialExperience({ navigation, onNavigate }: { navigation: EcosystemLocation; onNavigate: (target: EcosystemLocation) => void }) {
  const gallery = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const returnPosition = useRef(0);
  const returnPiece = useRef<string>();
  const wasDetail = useRef(false);
  const visitedGallery = useRef(!navigation.pieceId);
  const candidate = findPiece(navigation.pieceId);
  const piece = navigation.document && navigation.pieceId === 'fenasoja-2022' ? historicalDocument : candidate?.kind === 'document' ? undefined : candidate;
  const invalid = Boolean(navigation.pieceId && !piece);
  const home = useCallback(() => onNavigate({ view: 'organization' }), [onNavigate]);
  const timeline = useCallback(() => onNavigate({ view: 'memorial' }), [onNavigate]);
  const open = useCallback((target: MemorialPiece) => {
    if (!piece) {
      returnPosition.current = gallery.current?.scrollTop ?? 0;
      returnPiece.current = target.id;
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
      if (gallery.current) gallery.current.scrollTop = returnPosition.current;
      const target = returnPiece.current && gallery.current?.querySelector<HTMLAnchorElement>(`[data-piece-id="${returnPiece.current}"]`);
      if (wasDetail.current && target) {
        const targetRect = target.getBoundingClientRect();
        const viewport = gallery.current!.getBoundingClientRect();
        // A breakpoint can change while the detail is open. Keep the edition
        // visible when the old pixel position belongs to a different row layout.
        if (!visitedGallery.current || targetRect.bottom <= viewport.top || targetRect.top >= viewport.bottom) target.scrollIntoView({ block: 'center' });
        target.focus({ preventScroll: true });
      }
      else title.current?.focus({ preventScroll: true });
      visitedGallery.current = true;
    } else if (!wasDetail.current) {
      // Also covers browser forward and direct links, which do not pass through the click handler.
      returnPosition.current = gallery.current?.scrollTop ?? 0;
      returnPiece.current = piece.kind === 'document' ? 'fenasoja-2022' : piece.id;
    }
    wasDetail.current = Boolean(piece);
  }, [piece]);
  return <section className="memorial" aria-label="Memorial do Voluntariado" data-detail-open={Boolean(piece)}>
    <div className="memorial-environment" aria-hidden="true"><div className="memorial-environment__mineral" /><div className="memorial-environment__edges" /><div className="memorial-environment__light" /><div className="memorial-environment__veil" /></div>
    <div className="memorial-gallery memorial-scroll" ref={gallery} aria-hidden={Boolean(piece)} {...(piece ? { inert: '' } : {})} style={{ visibility: piece ? 'hidden' : 'visible' }}>
      <header className="memorial-gallery__header">
        <button type="button" className="memorial-back" onClick={home}><ArrowLeft size={17} aria-hidden="true" /> Voltar ao Ecossistema</button>
        <div className="memorial-gallery__intro"><span className="memorial-eyebrow"><Landmark size={15} aria-hidden="true" /> ACERVO FENASOJA · 1966—2026</span>
          <h1 ref={title} tabIndex={-1}>MEMORIAL <span>DO VOLUNTARIADO</span></h1>
          <p>As pessoas que fizeram a FENASOJA acontecer.</p>
          <div className="memorial-gallery__guide"><span>25 edições. Uma história feita por pessoas.</span><a href="#memorial-fenasoja-1966" onClick={event => { event.preventDefault(); document.getElementById('memorial-fenasoja-1966')?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>Começar a visita <ArrowDown size={15} aria-hidden="true" /></a></div>
        </div>
        <label className="memorial-index">Ir para uma edição<select defaultValue="" onChange={event => {
          const target = document.getElementById(`memorial-${event.target.value}`);
          target?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          target?.querySelector('a')?.focus({ preventScroll: true });
          event.target.value = '';
        }}><option value="" disabled>Escolha o ano</option>{timelinePieces.map(item => <option value={item.id} key={item.id}>{item.year} / {pieceLabel(item)}</option>)}</select></label>
      </header>
      {invalid && <div className="memorial-not-found" role="status"><p>Esta peça não foi encontrada no acervo.</p><button type="button" onClick={timeline}>Voltar à linha do tempo</button></div>}
      <Timeline onOpen={open} hrefFor={hrefFor} />
      <footer className="memorial-gallery__footer"><span>FENASOJA · MEMORIAL DO VOLUNTARIADO</span><p>Uma história preservada nos nomes, nas marcas e nas memórias de cada edição.</p><span>{historicalEditions.length} quadros históricos · 1 documento associado · epílogo 2028</span></footer>
    </div>
    {piece && <div className="memorial-detail-scroll memorial-scroll" key={piece.id}><PieceDetail piece={piece} onTimeline={timeline} onOpen={open} hrefFor={hrefFor} onHome={home} /></div>}
  </section>;
}
