import { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PasswordPrompt, readUnlock, useWorkersEligibility, writeUnlock } from '@/features/workers/WorkersAccessGate';

const SessionRunner = lazyWithRetry(() => import('@/features/workers/WorkersSessionRunner'));
const Copilot = lazyWithRetry(() => import('@/features/workers/WorkersCopilot'));

/** Lightweight entry: Motion, CSS, chat and map stores load only when the user opens it. */
export default function WorkersLauncher() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isWorkers = location.pathname.startsWith('/equipe-ia') || location.pathname.startsWith('/admin/workers/');
  const isPublic = /^\/(?:areas\/|login\/|unsubscribe|\.lovable\/)/.test(location.pathname);
  const { eligible } = useWorkersEligibility();
  const [unlocked, setUnlocked] = useState(() => readUnlock(user?.id));
  const enabled = Boolean(user && orgId && !isPublic && !isWorkers && eligible);
  useEffect(() => { if (open) setUnlocked(readUnlock(user?.id)); }, [open, user?.id]);

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

  const runner = user && orgId && !isPublic ? <Suspense fallback={null}><SessionRunner key={`${user.id}:${orgId}`} orgId={orgId} userId={user.id} /></Suspense> : null;
  if (!enabled) return runner;
  return <>
    {runner}
    <button type="button" data-workers-launcher aria-label="Abrir BOT FENASOJA"
      aria-keyshortcuts="Control+k Meta+k" aria-expanded={open} onClick={() => setOpen(true)}
      className="focus-ring"
      style={{ position: 'fixed', right: 20, bottom: 'max(24px, env(safe-area-inset-bottom))', zIndex: 39,
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
        padding: '12px 16px', borderRadius: 999, border: 0,
        background: '#121D85', color: '#fff', boxShadow: 'var(--shadow-md)', fontSize: 13, fontWeight: 600 }}>
      <img src="/bot-fenasoja/mascot-open.webp" alt="" width={28} height={28} /><span>BOT FENASOJA</span>
    </button>
    {open && !unlocked && <Dialog open onOpenChange={value => { if (!value) setOpen(false); }}>
      <DialogContent className="max-w-sm border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Senha do BOT FENASOJA</DialogTitle><DialogDescription className="sr-only">Confirme sua senha</DialogDescription>
        <PasswordPrompt compact onUnlock={() => { if (user) { writeUnlock(user.id); setUnlocked(true); } }} />
      </DialogContent></Dialog>}
    {open && unlocked && <Suspense fallback={null}><Copilot open={open} onOpenChange={setOpen} showTrigger={false}
      context={{ route: location.pathname }} /></Suspense>}
  </>;
}
