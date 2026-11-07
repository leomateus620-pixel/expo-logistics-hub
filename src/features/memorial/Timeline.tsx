import { useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { pieceAssets, pieceLabel, thumbnailUrl, timelinePieces, type MemorialPiece } from './catalog';
import { timelinePath } from './timelinePath';
import { boundView, galleryLayout, zoomAt, type SurfaceView } from './surfaceMath';
import { SurfaceControls } from './SurfaceControls';

export function Timeline({ onOpen, hrefFor, active = true }: { onOpen: (piece: MemorialPiece) => void; hrefFor: (piece: MemorialPiece) => string; active?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLOListElement>(null);
  const controls = useRef<SurfaceControls>();
  const view = useRef<SurfaceView>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const layout = galleryLayout(size);
  const current = useRef({ size, layout });
  current.current = { size, layout };
  const paint = () => {
    const node = world.current;
    if (!node) return;
    const { x, y, scale } = view.current;
    node.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
    node.dataset.scale = String(scale); node.dataset.x = String(x); node.dataset.y = String(y);
  };
  const fit = () => {
    if (world.current) world.current.dataset.overview = 'true';
    const { size: available, layout: content } = current.current;
    view.current = boundView({ x: 0, y: 0, scale: content.initial }, available, content); paint();
  };
  const zoom = (factor: number) => {
    if (world.current) world.current.dataset.overview = 'false';
    const { size: available, layout: content } = current.current;
    view.current = boundView(zoomAt(view.current, factor, { x: available.width / 2, y: available.height / 2 }, content.min, content.max), available, content); paint();
  };
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const next = { width: node.clientWidth, height: node.clientHeight };
      if (!next.width || !next.height) return;
      setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
      controls.current?.cancel();
    };
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const previous = view.current;
    const isOverview = world.current?.dataset.overview !== 'false';
    view.current = boundView({ ...previous, scale: isOverview ? layout.initial : Math.max(layout.min, Math.min(layout.max, previous.scale)) }, size, layout); paint();
    // Only viewport changes may reframe the composition; inspection never unmounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  useLayoutEffect(() => {
    if (!active || !viewport.current) return;
    const change = (factor: number, anchor: { x: number; y: number }, dx = 0, dy = 0) => {
      const { size: available, layout: content } = current.current;
      const next = zoomAt(view.current, factor, anchor, content.min, content.max);
      view.current = boundView({ ...next, x: next.x + dx, y: next.y + dy }, available, content);
      if (world.current) world.current.dataset.overview = 'false';
      paint();
    };
    const input = new SurfaceControls(viewport.current, d => change(d.factor, d.anchor, d.dx, d.dy), (factor, anchor) => change(factor, anchor));
    controls.current = input;
    return () => { input.dispose(); controls.current = undefined; };
  }, [active]);
  const points = layout.cells.map(cell => ({ x: cell.x + layout.cellWidth / 2, y: cell.y + layout.cellHeight - 10 }));
  return <div className="memorial-exhibition">
    <div className="memorial-gallery-tools" aria-label="Controles da exposição">
      <label className="memorial-index"><span className="memorial-sr-only">Abrir uma edição</span><select value="" onChange={event => { const piece = timelinePieces.find(item => item.id === event.target.value); if (piece) onOpen(piece); }}><option value="">Edições</option>{timelinePieces.map(piece => <option key={piece.id} value={piece.id}>{piece.year} · {pieceLabel(piece)}</option>)}</select></label>
      <div className="memorial-tool-group"><button type="button" aria-label="Reduzir exposição" onClick={() => { if (world.current) world.current.dataset.overview = 'false'; zoom(1 / 1.25); }}><Minus size={18} /></button><button type="button" aria-label="Ampliar exposição" onClick={() => { if (world.current) world.current.dataset.overview = 'false'; zoom(1.25); }}><Plus size={18} /></button><button type="button" onClick={() => { if (world.current) world.current.dataset.overview = 'true'; fit(); }}><Scan size={16} /><span>Ajustar à tela</span></button></div>
    </div>
    <div ref={viewport} className="memorial-viewport" tabIndex={0} role="group" aria-label="Exposição navegável" aria-describedby="memorial-gallery-help"
      onClickCapture={event => { if (event.detail > 0 && controls.current?.gesture.moved) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
        if (['+', '=', '-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) event.preventDefault();
        if (event.key === '+' || event.key === '=') zoom(1.25);
        else if (event.key === '-') zoom(1 / 1.25);
        else if (event.key === 'Home') fit();
        else if (event.key.startsWith('Arrow')) { view.current = boundView({ ...view.current, x: view.current.x + (event.key === 'ArrowLeft' ? 80 : event.key === 'ArrowRight' ? -80 : 0), y: view.current.y + (event.key === 'ArrowUp' ? 80 : event.key === 'ArrowDown' ? -80 : 0) }, size, layout); paint(); }
      }}>
      <ol ref={world} className="memorial-timeline" data-columns={layout.columns} style={{ width: layout.width, height: layout.height }} aria-label="Linha do tempo: 25 edições e epílogo de 2028">
        <svg className="memorial-route" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false"><path d={timelinePath(points, layout.width, layout.columns)} fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        {timelinePieces.map((piece, index) => {
          const asset = pieceAssets(piece), cell = layout.cells[index];
          return <li key={piece.id} id={`memorial-${piece.id}`} style={{ left: cell.x, top: cell.y, width: layout.cellWidth, height: layout.cellHeight }}>
            <a className="memorial-piece" data-piece-id={piece.id} href={hrefFor(piece)}
              onFocus={event => {
                const rect = event.currentTarget.getBoundingClientRect(), bounds = viewport.current!.getBoundingClientRect();
                if (rect.top < bounds.top || rect.bottom > bounds.bottom || rect.left < bounds.left || rect.right > bounds.right) {
                  view.current = boundView({ ...view.current, x: size.width / 2 - (cell.x + layout.cellWidth / 2) * view.current.scale, y: size.height / 2 - (cell.y + layout.cellHeight / 2) * view.current.scale }, size, layout); paint();
                }
              }}
              onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpen(piece); }}
              aria-label={`${piece.year} / ${pieceLabel(piece)}. Abrir quadro`}>
              <span className="memorial-piece__image" data-profile={piece.model.profile}><img src={thumbnailUrl(piece, true)} width={asset.width} height={asset.height} draggable={false} decoding="async" alt="" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.setAttribute('data-media-failed', 'true'); }} /><span className="memorial-piece__unavailable">Abrir quadro</span></span>
              <span className="memorial-piece__caption"><strong>{piece.year}</strong><span>{piece.kind === 'epilogue' ? 'FENASOJA · LOADING…' : pieceLabel(piece)}</span></span><span className="memorial-piece__marker" aria-hidden="true" />
            </a>
          </li>;
        })}
      </ol>
    </div>
    <p id="memorial-gallery-help" className="memorial-gallery-hint">Arraste para explorar · Amplie com a pinça ou a roda do mouse<span className="memorial-sr-only">. Use Tab para escolher um quadro, Enter para abrir. Na exposição, use setas para deslocar, + e − para ampliar e Home para ajustar.</span></p>
  </div>;
}
