import { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const Copilot = lazyWithRetry(() => import('@/features/workers/WorkersCopilot'));

/** Lightweight entry: Motion, CSS, chat and map stores load only when the user opens it. */
export default function WorkersLauncher() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isWorkers = location.pathname.startsWith('/equipe-ia') || location.pathname === '/admin/workers/design';
  const isPublic = /^\/(?:areas\/|login\/|unsubscribe|\.lovable\/)/.test(location.pathname);
  const enabled = Boolean(user && orgId && !isPublic && !isWorkers);

  useEffect(() => {
    if (!enabled) { setOpen(false); return; }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen(current => !current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  if (!enabled) return null;
  return <>
    <button type="button" data-workers-launcher aria-label="Abrir copiloto da equipe Fenasoja"
      aria-keyshortcuts="Control+k Meta+k" aria-expanded={open} onClick={() => setOpen(true)}
      className="focus-ring"
      style={{ position: 'fixed', right: 20, bottom: 'max(24px, env(safe-area-inset-bottom))', zIndex: 39,
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
        padding: '12px 16px', borderRadius: 999, border: 0,
        background: '#121D85', color: '#fff', boxShadow: 'var(--shadow-md)', fontSize: 13, fontWeight: 600 }}>
      <img src="/fenasoja-bots.svg" alt="" width={24} height={24} /><span>Equipe IA</span>
    </button>
    {open && <Suspense fallback={null}><Copilot open={open} onOpenChange={setOpen} showTrigger={false}
      context={{ route: location.pathname }} /></Suspense>}
  </>;
}
