import { useEffect, useState } from 'react';

export const WORKER_WELCOME_DESCRIPTIONS = [
  'Da história da feira ao seu próximo compromisso.',
  'Pergunte sobre a feira, o campo ou o seu dia.',
  'Encontre uma resposta. Escolha por onde começar.',
] as const;

/** A full, quiet minute is required after interaction; nothing changes under a focused control. */
export function useWorkerWelcomeRotation(paused: boolean, scope: string): number {
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => { setCycle(0); }, [scope]);
  useEffect(() => {
    if (paused || !visible) return;
    const timer = window.setTimeout(() => setCycle(value => (value + 1) % WORKER_WELCOME_DESCRIPTIONS.length), 60_000);
    return () => window.clearTimeout(timer);
  }, [paused, visible, cycle, scope]);
  return cycle;
}
