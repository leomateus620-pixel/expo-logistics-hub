import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { pieceAssets, pieceLabel, thumbnailUrl, timelinePieces, type MemorialPiece } from './catalog';

import { timelinePath } from './timelinePath';

export function Timeline({ onOpen, hrefFor }: { onOpen: (piece: MemorialPiece) => void; hrefFor: (piece: MemorialPiece) => string }) {
  const root = useRef<HTMLOListElement>(null);
  const [layout, setLayout] = useState({ columns: 1, width: 0, height: 0, path: '' });
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!container.getClientRects().length) return;
        const rect = container.getBoundingClientRect();
        const columns = rect.width >= 1150 ? 4 : rect.width >= 860 ? 3 : rect.width >= 600 ? 2 : 1;
        const points = [...container.querySelectorAll<HTMLElement>('[data-memorial-marker]')].map(marker => {
          const point = marker.getBoundingClientRect();
          return { x: point.left + point.width / 2 - rect.left, y: point.top + point.height / 2 - rect.top };
        });
        setLayout(current => {
          const next = { columns, width: rect.width, height: container.scrollHeight, path: timelinePath(points, rect.width, columns, true) };
          return JSON.stringify(current) === JSON.stringify(next) ? current : next;
        });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll('li').forEach(item => observer.observe(item));
    document.fonts?.ready.then(measure);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [layout.columns]);

  const lastRow = Math.floor(24 / layout.columns);
  const lastColumn = lastRow % 2 === 0 ? 24 % layout.columns + 1 : layout.columns - 24 % layout.columns;
  return <ol className="memorial-timeline" ref={root} data-columns={layout.columns} style={{ '--memorial-columns': layout.columns } as CSSProperties} aria-label="Linha do tempo: 25 edições e epílogo de 2028">
    {layout.width > 0 && <svg className="memorial-route" width={layout.width} height={layout.height} aria-hidden="true" focusable="false">
      <path d={layout.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>}
    {timelinePieces.map((piece, index) => {
      const row = Math.floor(index / layout.columns);
      const isEpilogue = piece.kind === 'epilogue';
      const placement = {
        gridRow: isEpilogue ? lastRow + 2 : row + 1,
        gridColumn: isEpilogue ? lastColumn : row % 2 === 0 ? index % layout.columns + 1 : layout.columns - index % layout.columns,
      };
      const asset = pieceAssets(piece);
      return <li key={piece.id} id={`memorial-${piece.id}`} style={placement} className={isEpilogue ? 'memorial-timeline__epilogue' : undefined}>
        <a className="memorial-piece" data-piece-id={piece.id} href={hrefFor(piece)} onClick={event => {
          if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onOpen(piece);
        }} aria-label={`${piece.year} / ${pieceLabel(piece)}. ${isEpilogue ? 'Conhecer o próximo capítulo' : 'Abrir quadro e consultar as inscrições'}`}>
          <span className="memorial-piece__image" data-profile={piece.model.profile}>
            <img src={thumbnailUrl(piece)} srcSet={`${thumbnailUrl(piece, true)} 240w, ${thumbnailUrl(piece)} 420w`} sizes="(max-width: 639px) 210px, 200px" width={asset.width} height={asset.height} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; event.currentTarget.parentElement?.setAttribute('data-media-failed', 'true'); }} />
            <span className="memorial-piece__unavailable">Prévia indisponível. Abrir a ficha.</span>
          </span>
          <span className="memorial-piece__caption"><strong>{piece.year}</strong><span>{isEpilogue ? 'O PRÓXIMO CAPÍTULO' : pieceLabel(piece)}</span><ArrowUpRight size={16} aria-hidden="true" /></span>
          <span className="memorial-piece__marker" data-memorial-marker aria-hidden="true" />
        </a>
        {index === 0 && <span className="memorial-piece__start">O início de uma história <ArrowDown size={12} aria-hidden="true" /></span>}
      </li>;
    })}
  </ol>;
}
