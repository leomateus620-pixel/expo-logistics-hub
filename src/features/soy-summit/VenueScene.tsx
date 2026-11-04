import { useEffect, useRef } from 'react';
import { VenueRenderer, type Quality, type ResolvedQuality } from './scene/venue-renderer';
import type { VisitNode } from './venue-layout';

declare global { interface Window { __soyVisit?: VenueRenderer } }
export interface VenueSceneProps {
  quality: Quality;
  onReady: () => void;
  onMove: (node: VisitNode, moving: boolean) => void;
  onQuality: (quality: ResolvedQuality) => void;
  onError: (message: string) => void;
  onPreparing: (message: string) => void;
  onPresentation: (active: boolean) => void;
  controlRef: React.MutableRefObject<VenueRenderer | null>;
}
export default function VenueScene({ quality, controlRef, ...callbacks }: VenueSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef(callbacks);callbacksRef.current = callbacks;
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    let engine: VenueRenderer | undefined;
    try {
      engine = new VenueRenderer(canvasRef.current, overlayRef.current, {
        onReady: () => callbacksRef.current.onReady(),
        onMove: (node, moving) => callbacksRef.current.onMove(node, moving),
        onQuality: q => callbacksRef.current.onQuality(q),
        onError: message => callbacksRef.current.onError(message),
        onPreparing: message => callbacksRef.current.onPreparing(message),
        onPresentation: active => callbacksRef.current.onPresentation(active),
      });
      controlRef.current = engine;
      if (import.meta.env.DEV) window.__soyVisit = engine;
      void engine.initialize();
    } catch (error) { callbacksRef.current.onError(error instanceof Error ? error.message : 'WebGL indisponível neste dispositivo.'); }
    return () => { engine?.dispose();controlRef.current = null;if (window.__soyVisit === engine) delete window.__soyVisit; };
  }, [controlRef]);
  useEffect(() => { controlRef.current?.setQuality(quality); }, [quality, controlRef]);
  return <>
    <canvas ref={canvasRef} className="soy-visit__canvas" tabIndex={0} aria-label="Visita 3D ao Centro Cívico. Arraste para olhar. Setas para olhar e Enter para avançar. Diante do painel, toque nos cards ou use as teclas 1 a 4 para destacá-los. Use também os botões de percurso." />
    <div ref={overlayRef} className="soy-visit__hotspots" aria-label="Acessos no ambiente" />
  </>;
}
