import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useMotionValue, useSpring } from 'motion/react';

export function seededRandom(seed: string): () => number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => { value += 0x6D2B79F5; let result = Math.imul(value ^ value >>> 15, 1 | value); result ^= result + Math.imul(result ^ result >>> 7, 61 | result); return ((result ^ result >>> 14) >>> 0) / 4294967296; };
}

type PointerSubscriber = (x: number, y: number, touch: boolean) => void;
const pointerSubscribers = new Set<PointerSubscriber>();
const animationCandidates = new Map<symbol, (allowed: boolean) => void>();
function allocateAnimationBudget() { let index = 0; for (const update of animationCandidates.values()) update(index++ < 12); }
let pointerFrame = 0;
let pointerPosition = { x: 0, y: 0, touch: false };
function dispatchPointer(event: PointerEvent) {
  pointerPosition = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
  if (!pointerFrame) pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; for (const subscriber of pointerSubscribers) subscriber(pointerPosition.x, pointerPosition.y, pointerPosition.touch); });
}
function subscribePointer(subscriber: PointerSubscriber) {
  if (!pointerSubscribers.size) { window.addEventListener('pointermove', dispatchPointer, { passive: true }); window.addEventListener('pointerdown', dispatchPointer, { passive: true }); }
  pointerSubscribers.add(subscriber);
  return () => { pointerSubscribers.delete(subscriber); if (!pointerSubscribers.size) { window.removeEventListener('pointermove', dispatchPointer); window.removeEventListener('pointerdown', dispatchPointer); if (pointerFrame) cancelAnimationFrame(pointerFrame); pointerFrame = 0; } };
}

export function useMascotActive(ref: RefObject<Element>, paused = false, explicitMotionOverride = false) {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [inView, setInView] = useState(true);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [withinBudget, setWithinBudget] = useState(false);
  const instance = useRef(Symbol('worker-mascot'));
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    if (!ref.current || typeof IntersectionObserver === 'undefined') return () => document.removeEventListener('visibilitychange', update);
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? false), { rootMargin: '100px' });
    observer.observe(ref.current);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [ref]);
  const eligible = inView && !hidden && !paused && (!reducedMotion || explicitMotionOverride);
  useEffect(() => {
    if (!eligible) { setWithinBudget(false); return; }
    const key = instance.current; animationCandidates.set(key, setWithinBudget); allocateAnimationBudget();
    return () => { animationCandidates.delete(key); allocateAnimationBudget(); };
  }, [eligible]);
  return eligible && withinBudget;
}

export function useMascotLife(ref: RefObject<HTMLSpanElement>, { seed, paused, interactive }: { seed: string; paused: boolean; interactive: boolean }) {
  const active = useMascotActive(ref, paused);
  const [blinking, setBlinking] = useState(false);
  const random = useMemo(() => seededRandom(seed), [seed]);
  const rhythm = useMemo(() => { const next = seededRandom(seed); return { duration: 3.2 + next() * 1.6, delay: -next() * 4, rotateDuration: 6 + next() * 3 }; }, [seed]);
  const x = useMotionValue(0); const y = useMotionValue(0);
  const pupilX = useSpring(x, { stiffness: 300, damping: 30 }); const pupilY = useSpring(y, { stiffness: 300, damping: 30 });
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!active) { setBlinking(false); return; }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (fn: () => void, delay: number) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay); timers.add(timer); };
    const blink = () => { setBlinking(true); schedule(() => { setBlinking(false); if (random() < .15) { schedule(() => setBlinking(true), 100); schedule(() => setBlinking(false), 240); } schedule(blink, 3000 + random() * 3000); }, 140); };
    schedule(blink, 3000 + random() * 3000);
    return () => { for (const timer of timers) clearTimeout(timer); };
  }, [active, random]);
  useEffect(() => {
    if (!active || !interactive) { x.set(0); y.set(0); return; }
    const unsubscribe = subscribePointer((px, py, touch) => {
      const box = ref.current?.getBoundingClientRect(); if (!box) return;
      const dx = px - box.left - box.width / 2; const dy = py - box.top - box.height / 2;
      const distance = Math.max(70, Math.hypot(dx, dy)); x.set(dx / distance * 3); y.set(dy / distance * 3);
      clearTimeout(resetTimer.current); if (touch) resetTimer.current = setTimeout(() => { x.set(0); y.set(0); }, 1500);
    });
    return () => { unsubscribe(); clearTimeout(resetTimer.current); };
  }, [active, interactive, ref, x, y]);
  return { active, blinking, pupilX, pupilY, rhythm };
}
