import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import '@/styles/portal-action-phrase.css';

const HOLD_MS = 5600;
const STAGGER_MS = 1400;
const EXIT_MS = 180;

interface PortalActionPhraseProps {
  phrases: readonly string[];
  /** Card position; staggers the first write-on and the rotation rhythm. */
  order: number;
}

/**
 * Rotation runs only while the phrase is on screen, the tab is visible, the
 * user allows motion and the card is not hovered or focused, so text never
 * changes under the pointer. Without IntersectionObserver it stays static.
 */
function useRotationAllowed(ref: RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>('.portal-emblem-host');
    if (!host) return undefined;
    const engage = () => setEngaged(true);
    const release = () => setEngaged(host.matches(':focus-within'));
    host.addEventListener('pointerenter', engage);
    host.addEventListener('pointerleave', release);
    host.addEventListener('focusin', engage);
    host.addEventListener('focusout', release);
    return () => {
      host.removeEventListener('pointerenter', engage);
      host.removeEventListener('pointerleave', release);
      host.removeEventListener('focusin', engage);
      host.removeEventListener('focusout', release);
    };
  }, [ref]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query?.addEventListener?.('change', onMotion);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      query?.removeEventListener?.('change', onMotion);
    };
  }, []);

  return visible && pageVisible && !engaged && !reducedMotion;
}

function usePhraseRotation(phrases: readonly string[], allowed: boolean, offsetMs: number) {
  const signature = phrases.join('|');
  const [state, setState] = useState({ signature, index: 0, cycle: 0, leaving: false });
  const current = state.signature === signature ? state : { signature, index: 0, cycle: 0, leaving: false };

  useEffect(() => {
    if (state.signature !== signature) setState({ signature, index: 0, cycle: 0, leaving: false });
  }, [signature, state.signature]);

  useEffect(() => {
    if (!allowed || phrases.length < 2) {
      setState((value) => (value.leaving ? { ...value, leaving: false } : value));
      return undefined;
    }

    let timer = window.setTimeout(function leave() {
      setState((value) => ({ ...value, leaving: true }));
      timer = window.setTimeout(() => {
        setState((value) => ({
          ...value,
          index: (value.index + 1) % phrases.length,
          cycle: value.cycle + 1,
          leaving: false,
        }));
        timer = window.setTimeout(leave, HOLD_MS);
      }, EXIT_MS);
    }, HOLD_MS + offsetMs);

    return () => window.clearTimeout(timer);
  }, [allowed, phrases.length, offsetMs, signature]);

  return current;
}

export function PortalActionPhrase({ phrases, order }: PortalActionPhraseProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const allowed = useRotationAllowed(ref);
  const { index, cycle, leaving } = usePhraseRotation(phrases, allowed, order * STAGGER_MS);
  const phrase = phrases[index] ?? phrases[0] ?? '';

  const longest = useMemo(
    () => phrases.reduce((widest, item) => (item.length > widest.length ? item : widest), ''),
    [phrases],
  );

  const words = useMemo(() => {
    let position = 0;
    return phrase.split(' ').map((word) => {
      const chars = Array.from(word).map((char) => ({ char, position: position++ }));
      position += 1;
      return chars;
    });
  }, [phrase]);

  return (
    <span
      ref={ref}
      className="portal-action-phrase"
      style={{ '--phrase-order': order } as CSSProperties}
    >
      <span className="portal-action-phrase__sizer" data-text={longest} />
      <span
        key={`${cycle}:${phrase}`}
        className="portal-action-phrase__text"
        data-first={cycle === 0 || undefined}
        data-leaving={leaving || undefined}
        style={{ '--phrase-length': phrase.length } as CSSProperties}
      >
        {words.map((chars, wordIndex) => (
          <Fragment key={wordIndex}>
            {wordIndex > 0 && ' '}
            <span className="portal-action-phrase__word">
              {chars.map(({ char, position }) => (
                <span
                  key={position}
                  className="portal-action-phrase__char"
                  style={{ '--i': position } as CSSProperties}
                >
                  {char}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
