import { useLayoutEffect, type RefObject } from 'react';

/** The outer page/sheet owns viewport geometry; messages only flex inside it. */
export function useWorkerViewport(ref: RefObject<HTMLElement>, enabled = true, ownerSelector?: string, lockDocument = false) {
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    const owner = ownerSelector ? ref.current.closest<HTMLElement>(ownerSelector) : ref.current;
    if (!owner) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      // Manual browser magnification remains native; do not relayout on pinch zoom.
      if (viewport && Math.abs(viewport.scale - 1) > .02) return;
      const height = Math.max(0, viewport?.height ?? window.innerHeight);
      const top = Math.max(0, viewport?.offsetTop ?? 0);
      owner.style.setProperty('--worker-visible-height', `${height}px`);
      owner.style.setProperty('--worker-viewport-top', `${top}px`);
      const focused = document.activeElement instanceof HTMLElement && owner.contains(document.activeElement)
        && document.activeElement.matches('input,textarea,select,[contenteditable="true"]');
      owner.dataset.workerKeyboard = focused && Math.max(window.innerHeight, document.documentElement.clientHeight) - height > 120 ? 'open' : 'closed';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const rootOverscroll = document.documentElement.style.overscrollBehavior;
    if (lockDocument) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    }
    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    owner.addEventListener('focusin', schedule);
    owner.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      owner.removeEventListener('focusin', schedule);
      owner.removeEventListener('focusout', schedule);
      owner.style.removeProperty('--worker-visible-height');
      owner.style.removeProperty('--worker-viewport-top');
      delete owner.dataset.workerKeyboard;
      if (lockDocument) {
        document.body.style.overflow = bodyOverflow;
        document.documentElement.style.overflow = rootOverflow;
        document.documentElement.style.overscrollBehavior = rootOverscroll;
      }
    };
  }, [ref, enabled, ownerSelector, lockDocument]);
}
