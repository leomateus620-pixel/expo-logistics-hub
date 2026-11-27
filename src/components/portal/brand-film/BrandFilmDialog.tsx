import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SkipForward, Volume2, VolumeX } from 'lucide-react';
import markURL from '@/assets/brand/fenasoja-symbol-144.webp';
import flashURL from './lampejo.webp?inline';
import './film.css';

type Props = { trigger: HTMLButtonElement; onClose: () => void };
const format = (): 'paisagem' | 'retrato' =>
  window.innerHeight > window.innerWidth ? 'retrato' : 'paisagem';
const onScreen = (r: DOMRect) =>
  r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

export function BrandFilmDialog({ trigger, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const elapsed = useRef(0);
  const [muted, setMuted] = useState(true);
  const [formatName, setFormat] = useState(format);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [status, setStatus] = useState<'prepare' | 'playing' | 'failed'>('prepare');
  const [slow, setSlow] = useState(false);
  const headerImage = useCallback(
    () => trigger.querySelector<HTMLImageElement>('.fenasoja-brand__mark img'),
    [trigger],
  );

  useLayoutEffect(() => {
    const el = dialog.current!;
    const mark = headerImage();
    const r = mark?.getBoundingClientRect();
    if (!r || !onScreen(r)) {
      onClose();
      return;
    }
    el.showModal();
    skip.current?.focus({ preventScroll: true });
    const sync = () => {
      const bounds = mark!.getBoundingClientRect();
      const pixel = stamp.current;
      if (pixel)
        Object.assign(pixel.style, {
          left: bounds.left + 'px',
          top: bounds.top + 'px',
          width: bounds.width + 'px',
          height: bounds.height + 'px',
        });
      setFormat(format());
    };
    sync();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      elapsed.current = 0;
      setReduced(motion.matches);
    };
    motion.addEventListener('change', change);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      motion.removeEventListener('change', change);
      el.close();
      if (trigger.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true });
      if (audio.current) {
        void audio.current.close().catch(() => {});
        audio.current = null;
      }
    };
  }, [trigger, headerImage, onClose]);

  useEffect(() => {
    let raf = 0,
      finishTimer = 0,
      visibilityTimer = 0,
      disposed = false,
      interrupted = false;
    const abort = new AbortController();
    setSlow(false);
    setStatus('prepare');
    const slowTimer = window.setTimeout(() => setSlow(true), 600);
    const fail = () => {
      if (disposed || interrupted) return;
      interrupted = true;
      abort.abort();
      cancelAnimationFrame(raf);
      setStatus('failed');
      finishTimer = window.setTimeout(onClose, 1500);
    };
    const timeout = window.setTimeout(fail, 7500);
    const exit = () => {
      if (disposed || interrupted) return;
      interrupted = true;
      if (reduced || document.hidden) {
        onClose();
        return;
      }
      dialog.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
      finishTimer = window.setTimeout(onClose, 140);
    };
    const mark = headerImage();
    const ctx = canvas.current?.getContext('2d');
    const check = () => {
      if (document.hidden) {
        exit();
        return;
      }
      // Mobile rotation can report the old header position in the new viewport
      // for one layout pass. Close only after the anchor settles out of view.
      if (mark && onScreen(mark.getBoundingClientRect())) {
        clearTimeout(visibilityTimer);
        visibilityTimer = 0;
      } else if (!visibilityTimer) {
        visibilityTimer = window.setTimeout(() => {
          visibilityTimer = 0;
          if (!mark || !onScreen(mark.getBoundingClientRect())) exit();
        }, 160);
      }
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(check);
    if (mark) observer?.observe(mark);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('scroll', check, true);
    async function run() {
      if (!ctx || !mark) {
        fail();
        return;
      }
      const { loadFrames, project, duration, playCue } = await import('./projection');
      const lowCost =
        reduced ||
        navigator.hardwareConcurrency <= 4 ||
        Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
      const frames = await loadFrames(formatName, reduced, abort.signal, lowCost);
      if (disposed || interrupted) return;
      clearTimeout(timeout);
      clearTimeout(slowTimer);
      setStatus('playing');
      const start = performance.now() - elapsed.current * 1000;
      let r = mark.getBoundingClientRect(),
        last = elapsed.current,
        width = 0,
        height = 0;
      const dpr = Math.min(devicePixelRatio || 1, lowCost ? 1 : 1.5);
      const render = (now: number) => {
        if (disposed || interrupted) return;
        const t = Math.max(0, (now - start) / 1000);
        const w = ctx.canvas.clientWidth,
          h = ctx.canvas.clientHeight;
        if (t >= duration(reduced)) {
          onClose();
          return;
        }
        if (width !== w || height !== h || t < 0.81 || t > 13.0) {
          r = mark.getBoundingClientRect();
          if (!onScreen(r)) {
            check();
            raf = requestAnimationFrame(render);
            return;
          }
        }
        if (width !== w || height !== h) {
          width = w;
          height = h;
          ctx.canvas.width = Math.max(1, Math.round(w * dpr));
          ctx.canvas.height = Math.max(1, Math.round(h * dpr));
          ctx.setTransform(ctx.canvas.width / w, 0, 0, ctx.canvas.height / h, 0, 0);
        }
        project(ctx, frames, t, w, h, r, mark, reduced);
        if (!reduced && audio.current) {
          const cue = last < 0.31 && t >= 0.31 ? 'passagem' : last < 1.54 && t >= 1.54 ? 'papel' : null;
          const current = audio.current;
          if (cue) playCue(current, cue);
        }
        elapsed.current = t;
        last = t;
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
    }
    void run().catch(fail);
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      clearTimeout(slowTimer);
      clearTimeout(finishTimer);
      clearTimeout(visibilityTimer);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('scroll', check, true);
    };
  }, [headerImage, formatName, reduced, onClose]);

  const toggleSound = async () => {
    try {
      if (!audio.current) audio.current = new AudioContext();
      if (muted) await audio.current.resume();
      else await audio.current.suspend();
      setMuted(audio.current?.state !== 'running');
    } catch {
      setMuted(true);
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="brand-film"
      aria-labelledby="brand-film-title"
      aria-describedby="brand-film-description"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="brand-film-title" className="sr-only">
        Por dentro da marca Fenasoja
      </h2>
      <p id="brand-film-description" className="sr-only">
        O símbolo se abre sobre o parque em 2026. O cartaz de 1966 e Willy Klaus abrem uma galeria de 25
        edições. Uma extensionista recebe crianças em 2018. A rua da Exporural leva de volta à mesma vista
        aérea e à marca.
      </p>
      <div
        ref={stamp}
        hidden={status === 'playing'}
        className="brand-film__flash"
        aria-hidden="true"
        style={{
          backgroundImage: 'url(' + flashURL + ')',
          maskImage: 'url(' + markURL + ')',
          WebkitMaskImage: 'url(' + markURL + ')',
        }}
      />
      <canvas ref={canvas} aria-hidden="true" hidden={status !== 'playing'} />
      <div className="brand-film__tools">
        <a
          href="/portal/brand-film/creditos.html"
          target="_blank"
          rel="noreferrer"
          aria-label="Créditos do filme (abre em nova aba)"
        >
          Créditos
        </a>
        {!reduced && (
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? 'Ligar som' : 'Desligar som'}
            aria-pressed={!muted}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}
        <button ref={skip} type="button" onClick={onClose}>
          <SkipForward size={16} aria-hidden="true" /> Pular
        </button>
      </div>
      <div role="status" className="brand-film__status">
        {status === 'failed'
          ? 'Não foi possível carregar o filme. Voltando ao portal…'
          : status === 'prepare' && slow
            ? 'Preparando as imagens…'
            : ''}
      </div>
    </dialog>,
    document.body,
  );
}
