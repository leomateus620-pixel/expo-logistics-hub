import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Scan, HelpCircle } from 'lucide-react';
import { faceUrl, thumbnailUrl, pieceAssets, pieceLabel, type MemorialPiece } from './catalog';
import type { PlateRenderer } from './scene/PlateRenderer';
import { SurfaceControls } from './SurfaceControls';
import { clamp, type Point } from './surfaceMath';
import { initialPose, boundPose, zoomPose, fitPlate } from './inspectionMath';

export default function MemorialViewer({ piece }: { piece: MemorialPiece }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const engine = useRef<PlateRenderer>();
  const input = useRef<SurfaceControls>();
  const pose = useRef(initialPose());
  const size = useRef({ width: 1, height: 1 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [help, setHelp] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const state = useRef(status); state.current = status;
  const asset = pieceAssets(piece), aspect = asset.width / asset.height;
  const apply = (interacting = false) => {
    engine.current?.setPose(pose.current);
    if (image.current) image.current.style.transform = `translate(-50%,-50%) translate(${pose.current.x}px,${pose.current.y}px) scale(${pose.current.scale})`;
    if (stage.current) {
      stage.current.dataset.pose = JSON.stringify(pose.current);
      if (interacting) stage.current.dataset.manipulated = 'true';
    }
  };
  const zoom = (factor: number, anchor: Point = { x: size.current.width / 2, y: size.current.height / 2 }) => {
    pose.current = zoomPose(pose.current, factor, anchor, size.current, aspect); apply(true);
  };
  const reset = () => { input.current?.cancel(); pose.current = initialPose(); engine.current?.resize(); apply(true); };
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const controls = new SurfaceControls(node, delta => {
      if (delta.pan || state.current !== 'ready') {
        pose.current = zoomPose(pose.current, delta.factor, delta.anchor, size.current, aspect);
        pose.current = boundPose({ ...pose.current, x: pose.current.x + delta.dx, y: pose.current.y + delta.dy }, size.current, aspect);
      } else {
        pose.current = { ...pose.current, yaw: clamp(pose.current.yaw + delta.dx * .006, -.85, .85), pitch: clamp(pose.current.pitch + delta.dy * .005, -.55, .55) };
      }
      apply(true);
    }, zoom);
    input.current = controls;
    const resize = () => {
      size.current = { width: node.clientWidth, height: node.clientHeight };
      controls.cancel();
      pose.current = boundPose(pose.current, size.current, aspect);
      const fit = fitPlate(size.current, aspect);
      node.style.setProperty('--plate-width', `${fit.width}px`);
      node.style.setProperty('--plate-height', `${fit.height}px`);
      apply();
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    return () => { controls.dispose(); observer.disconnect(); input.current = undefined; };
    // Refs own the live pose; handlers do not depend on React render frequency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id]);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    const fail = () => {
      if (!active) return;
      input.current?.cancel(); engine.current?.dispose(); engine.current = undefined; setStatus('failed');
    };
    import('./scene/PlateRenderer').then(({ PlateRenderer }) => {
      if (!active || !canvas.current) return;
      try {
        const renderer = new PlateRenderer(canvas.current, piece, () => { if (active) { setStatus('ready'); renderer.setPose(pose.current); } }, fail);
        engine.current = renderer;
        void renderer.initialize();
      } catch { fail(); }
    }).catch(fail);
    return () => { active = false; engine.current?.dispose(); engine.current = undefined; };
  }, [piece, attempt]);
  useEffect(() => { apply(); }, [status]);
  return <div className="memorial-viewer" data-viewer-state={status}>
    <div className="memorial-viewer__stage" ref={stage} tabIndex={0} role="group" aria-label={`Inspeção de ${pieceLabel(piece)}`} aria-describedby="memorial-inspection-help" onKeyDown={event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') zoom(1.25);
      else if (event.key === '-') zoom(1 / 1.25);
      else if (event.key === 'Home') reset();
      else if (event.key.startsWith('Arrow')) {
        const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        pose.current = event.shiftKey || status !== 'ready' ? boundPose({ ...pose.current, x: pose.current.x - dx * 45, y: pose.current.y - dy * 45 }, size.current, aspect)
          : { ...pose.current, yaw: clamp(pose.current.yaw + dx * .12, -.85, .85), pitch: clamp(pose.current.pitch + dy * .1, -.55, .55) };
        apply(true);
      }
    }}>
      {status !== 'ready' && !imageFailed && <img ref={image} className="memorial-viewer__fallback" src={status === 'failed' ? faceUrl(piece) : thumbnailUrl(piece)} alt={`Vista frontal de ${pieceLabel(piece)}`} draggable={false} onError={() => setImageFailed(true)} />}
      <canvas key={attempt} ref={canvas} hidden={status === 'failed'} aria-hidden="true" style={{ opacity: status === 'ready' ? 1 : 0 }} />
      {imageFailed && status !== 'ready' && <p className="memorial-viewer__status" role="status">Imagem indisponível. <button type="button" onClick={() => { setImageFailed(false); setAttempt(value => value + 1); }}>Tentar novamente</button></p>}
    </div>
    <div className="memorial-viewer__bottom">
      <div className="memorial-viewer__controls" aria-label="Controles de inspeção">
        <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Afastar quadro"><Minus size={19} aria-hidden="true" /></button>
        <button type="button" onClick={() => zoom(1.25)} aria-label="Aproximar quadro"><Plus size={19} aria-hidden="true" /></button>
        <button type="button" onClick={reset}><Scan size={17} aria-hidden="true" /> Restaurar vista</button>
        <button type="button" aria-label="Ajuda de gestos" aria-expanded={help} onClick={() => setHelp(value => !value)}><HelpCircle size={17} aria-hidden="true" /></button>
      </div>
      {status === 'failed' && <p className="memorial-viewer__notice" role="status">Vista 2D · Amplie e arraste. <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar 3D</button></p>}
      {status === 'loading' && <p className="memorial-viewer__notice" role="status">Preparando o quadro…</p>}
      <p id="memorial-inspection-help" className={help ? 'memorial-helper' : 'memorial-sr-only'}>Arraste para girar. Pinça ou roda para ampliar. Dois dedos, botão direito ou Shift + arraste para deslocar. Teclado: setas giram, Shift + setas deslocam, + e − ampliam, Home restaura e Escape fecha.</p>
    </div>
  </div>;
}
