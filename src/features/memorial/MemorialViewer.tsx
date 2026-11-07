import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Scan } from 'lucide-react';
import { faceUrl, pieceLabel, type MemorialPiece } from './catalog';
import type { PlateRenderer } from './scene/PlateRenderer';

export default function MemorialViewer({ piece }: { piece: MemorialPiece }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PlateRenderer>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    const fail = () => {
      if (!active) return;
      engine.current?.dispose(); engine.current = undefined; setStatus('failed');
    };
    import('./scene/PlateRenderer').then(({ PlateRenderer }) => {
      if (!active || !canvas.current) return;
      try {
        engine.current = new PlateRenderer(canvas.current, piece, () => { if (active) setStatus('ready'); }, fail);
        void engine.current.initialize();
      } catch { fail(); }
    }).catch(fail);
    return () => { active = false; engine.current?.dispose(); engine.current = undefined; };
  }, [piece, attempt]);
  return <div className="memorial-viewer" data-viewer-state={status}>
    <div className="memorial-viewer__stage">
      {status !== 'ready' && <img className="memorial-viewer__fallback" src={faceUrl(piece)} alt={`Vista frontal de ${pieceLabel(piece)}`} />}
      <canvas key={attempt} ref={canvas} hidden={status === 'failed'} tabIndex={status === 'ready' ? 0 : -1} role="img" aria-label={`Inspeção 3D de ${pieceLabel(piece)}. Use as setas para girar, mais e menos para aproximar e Home para vista frontal.`} aria-describedby="memorial-inspection-help" style={{ opacity: status === 'ready' ? 1 : 0 }} />
      {status === 'loading' && <p className="memorial-viewer__status" role="status">Preparando a inspeção 3D…</p>}
      {status === 'failed' && <div className="memorial-viewer__status" role="status"><p>A inspeção 3D está indisponível. A vista frontal, a fotografia e a transcrição continuam acessíveis.</p><button type="button" onClick={() => setAttempt(value => value+1)}>Tentar o 3D novamente</button></div>}
    </div>
    <div className="memorial-viewer__controls" aria-label="Controles de inspeção">
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.rotate(-.15)} aria-label="Girar à esquerda"><RotateCcw size={18} aria-hidden="true" /></button>
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.rotate(.15)} aria-label="Girar à direita"><RotateCw size={18} aria-hidden="true" /></button>
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.zoom(-1)} aria-label="Afastar quadro"><ZoomOut size={18} aria-hidden="true" /></button>
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.zoom(1)} aria-label="Aproximar quadro"><ZoomIn size={18} aria-hidden="true" /></button>
      <button type="button" disabled={status !== 'ready'} onClick={() => engine.current?.frontal()}><Scan size={17} aria-hidden="true" /> Vista frontal</button>
    </div>
    <p id="memorial-inspection-help" className="memorial-helper">Arraste na horizontal para inspecionar. Use os controles para aproximar. A rolagem e o zoom da página permanecem disponíveis.</p>
  </div>;
}
