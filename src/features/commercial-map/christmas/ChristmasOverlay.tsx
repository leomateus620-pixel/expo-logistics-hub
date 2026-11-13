import { useLayoutEffect, useRef, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, SkipForward, Sparkle } from 'lucide-react';
import { useChristmasSession } from './christmasSession';
import './christmas.css';

// The app's local copy of the official symbol has the transparent margin cropped.
const FENASOJA_SYMBOL = '/alvorada/fenasoja-symbol-official.png';

export function ChristmasButton({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      className="commercial-christmas-start"
      data-commercial-map-control="christmas"
      aria-haspopup="dialog"
      aria-disabled={disabled || undefined}
      onClick={onStart}
    >
      <svg viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M3 9.5c2.5 0 4 1.6 4 4.1v.7h10.5l3-3.3c.8-.9 2.5-.5 2.5.8 0 .6-.3 1.1-.8 1.7l-4 4.1H8.7A5.7 5.7 0 0 1 3 12Z" />
        <path d="m9 17.6-1.5 3.1m9.3-3.1-1.5 3.1M3 20.7h17.5c2.5 0 4.5-1.7 4.5-4" />
        <path d="M16.1 2.7c.4 2.1 1.3 3 3.4 3.5-2.1.4-3 1.3-3.4 3.4-.5-2.1-1.4-3-3.5-3.4 2.1-.5 3-1.4 3.5-3.5Z" />
      </svg>
      <span>Modo Natal</span>
    </button>
  );
}

export function ChristmasOverlay({ viewportRef }: { viewportRef: RefObject<HTMLDivElement> }) {
  const id = useChristmasSession((state) => state.id);
  const phase = useChristmasSession((state) => state.phase);
  const greet = useChristmasSession((state) => state.greet);
  const close = useChristmasSession((state) => state.close);
  const closeRef = useRef<HTMLButtonElement>(null);
  const greeting = phase === 'greeting';
  const preparing = phase === 'preparing';

  useLayoutEffect(() => {
    if (greeting) closeRef.current?.focus({ preventScroll: true });
  }, [greeting]);

  return (
    <Dialog.Root open={phase !== 'idle'} onOpenChange={(open) => { if (!open) close(id); }}>
      <Dialog.Portal container={viewportRef.current}>
        <Dialog.Overlay className={greeting ? 'commercial-christmas-shade is-greeting' : 'commercial-christmas-shade'} />
        <div className={greeting ? 'commercial-christmas-position is-greeting' : 'commercial-christmas-position'}>
          <Dialog.Content
            aria-describedby={undefined}
            aria-modal="true"
            className={greeting ? 'commercial-christmas-card' : 'commercial-christmas-hud'}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            data-christmas-phase={phase}
          >
            {greeting ? (
              <>
                <span className="commercial-christmas-card__lights" aria-hidden="true">
                  <Sparkle /><Sparkle /><Sparkle /><Sparkle /><Sparkle />
                </span>
                <span className="commercial-christmas-card__brand">
                  <img src={FENASOJA_SYMBOL} alt="Marca oficial da FENASOJA" width="512" height="512" />
                </span>
                <Dialog.Title className="commercial-christmas-card__title">
                  <span>A FENASOJA TE DESEJA</span>{' '}
                  <strong>FELIZ NATAL</strong>
                </Dialog.Title>
                <Dialog.Close ref={closeRef} type="button" className="commercial-christmas-close">Fechar</Dialog.Close>
              </>
            ) : (
              <>
                <Dialog.Title className="sr-only">Modo Natal</Dialog.Title>
                {preparing && <span role="status" className="commercial-christmas-hud__status"><LoaderCircle aria-hidden="true" />Preparando voo…</span>}
                <button type="button" className="commercial-christmas-skip" onClick={() => greet(id)}>
                  <SkipForward aria-hidden="true" />
                  Pular animação
                </button>
              </>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
