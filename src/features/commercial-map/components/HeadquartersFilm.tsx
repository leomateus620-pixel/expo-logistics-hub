import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Download, Expand, Film, Minimize } from 'lucide-react';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OfficialCountdownDigits } from '@/components/countdown/OfficialCountdownDigits';
import { useFenasojaCountdown } from '@/hooks/useFenasojaCountdown';
import './headquarters-film.css';

const FILM = '/media/fenasoja-2028/amanhecer';
const FULL_HD_FILENAME = 'FENASOJA-2028-Full-HD.mp4';
const CLOSING_CLOCK_SECONDS = 6;

function FilmClosingClock() {
  const { snapshot, accessibleLabel, announcement } = useFenasojaCountdown();
  return <div className="headquarters-film__clock" data-phase={snapshot.phase}>
    {snapshot.phase === 'countdown'
      ? <OfficialCountdownDigits snapshot={snapshot} accessibleLabel={accessibleLabel} variant="immersive" />
      : <p role="status">{accessibleLabel}</p>}
    {snapshot.phase === 'countdown' && <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>}
  </div>;
}

export function HeadquartersFilm() {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const expanded = viewportExpanded || nativeFullscreen;

  useEffect(() => {
    if (!open) return;
    const sync = () => setNativeFullscreen(Boolean(stage.current && document.fullscreenElement === stage.current));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [open]);

  function syncClosingClock(event: SyntheticEvent<HTMLVideoElement>) {
    const { currentTime, duration } = event.currentTarget;
    setShowClock(Number.isFinite(duration) && duration > 0 && currentTime >= duration - CLOSING_CLOCK_SECONDS);
  }

  function leaveFullscreen() {
    setViewportExpanded(false);
    if (stage.current && document.fullscreenElement === stage.current) void document.exitFullscreen().catch(() => {});
  }

  async function toggleFullscreen() {
    if (expanded) { leaveFullscreen(); return; }
    const target = stage.current;
    if (!target) return;
    if (target.requestFullscreen && document.fullscreenEnabled !== false) {
      try { await target.requestFullscreen(); return; } catch { /* Some mobile hosts only allow inline playback. */ }
    }
    if (stage.current === target) setViewportExpanded(true);
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (next) {
      setFailed(false);
      if (document.pointerLockElement) document.exitPointerLock?.();
    } else leaveFullscreen();
    setShowClock(false);
    setNativeFullscreen(false);
    setOpen(next);
  }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" className="commercial-map-film-trigger"
        aria-label="Assistir ao filme FenaSoja 2028">
        <Film aria-hidden="true" className="h-4 w-4 shrink-0" /><span>Assistir ao filme</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="headquarters-film w-[min(96vw,64rem)] max-w-none gap-3 bg-card p-4 sm:p-5"
      viewportClassName="z-[1101]" overlayClassName="z-[1100]" aria-modal="true"
      data-viewport-expanded={viewportExpanded || undefined} data-commercial-map-escape-priority="true"
      onEscapeKeyDown={(event) => { if (expanded) { event.preventDefault(); leaveFullscreen(); } }}>
      <DialogHeader className="space-y-1 pr-10 text-left">
        <DialogTitle>FenaSoja 2028</DialogTitle>
        <DialogDescription>O amanhecer no parque e o encontro da Comissão Central na Casa FenaSoja.</DialogDescription>
      </DialogHeader>
      {open && !failed && <div className="headquarters-film__stage" ref={stage}>
        <div className="headquarters-film__picture">
          <video controls controlsList="nofullscreen" disablePictureInPicture playsInline autoPlay preload="metadata"
            aria-label="Filme FenaSoja 2028, amanhecer no parque" src={`${FILM}.mp4`} poster={`${FILM}.webp`}
            onLoadedMetadata={syncClosingClock} onDurationChange={syncClosingClock} onTimeUpdate={syncClosingClock}
            onSeeking={syncClosingClock} onSeeked={syncClosingClock} onPlay={syncClosingClock}
            onPause={syncClosingClock} onEnded={syncClosingClock}
            onError={() => { leaveFullscreen(); setNativeFullscreen(false); setShowClock(false); setFailed(true); }}>
            <track kind="captions" src={`${FILM}.vtt`} srcLang="pt-BR" label="Português (Brasil)" />
          </video>
          {showClock && <FilmClosingClock />}
        </div>
        <button type="button" className="headquarters-film__fullscreen" onClick={() => void toggleFullscreen()}
          aria-label={expanded ? 'Sair da tela cheia do filme' : 'Ver filme em tela cheia'}>
          {expanded ? <Minimize aria-hidden="true" /> : <Expand aria-hidden="true" />}
        </button>
      </div>}
      {open && failed && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-4">
        <p role="status" className="text-sm">Não foi possível carregar o filme.</p>
        <Button type="button" variant="outline" onClick={() => setFailed(false)}>Tentar novamente</Button>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline">
          <a href={`/media/fenasoja-2028/${FULL_HD_FILENAME}`} download={FULL_HD_FILENAME}>
            <Download aria-hidden="true" className="h-4 w-4" />Baixar em Full HD
          </a>
        </Button>
        <DialogClose asChild>
          <Button type="button" variant="outline">Voltar ao mapa</Button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}
