import { createPortal } from 'react-dom';
import { WorkersLauncherButton } from './WorkersLauncherButton';
import { subscribeWorkersLauncherPlacement, workersLauncherSlot, type WorkersLauncherSurface } from './workersLauncherPlacement';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PasswordPrompt, readUnlock, useWorkersEligibility, writeUnlock } from '@/features/workers/WorkersAccessGate';

const SessionRunner = lazyWithRetry(() => import('@/features/workers/WorkersSessionRunner'));
const Copilot = lazyWithRetry(() => import('@/features/workers/WorkersCopilot'));

/** Lightweight entry: chat, Motion and map stores load only when the user opens it. */
export default function WorkersLauncher() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const location = useLocation();
  const surface: WorkersLauncherSurface | null = location.pathname === '/portal' ? 'portal' : location.pathname === '/mapa-comercial' ? 'map' : location.pathname.startsWith('/cronograma-eventos') ? 'agenda' : null;
  const slot = useSyncExternalStore(subscribeWorkersLauncherPlacement, () => workersLauncherSlot(surface), () => null);
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
    {surface ? slot && createPortal(<WorkersLauncherButton docked open={open} onOpen={() => setOpen(true)} />, slot)
      : <WorkersLauncherButton docked={false} open={open} onOpen={() => setOpen(true)} />}
    {open && !unlocked && <Dialog open onOpenChange={value => { if (!value) setOpen(false); }}>
      <DialogContent className="max-w-sm border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Senha do BOT FENASOJA</DialogTitle><DialogDescription className="sr-only">Confirme sua senha</DialogDescription>
        <PasswordPrompt compact onUnlock={() => { if (user) { writeUnlock(user.id); setUnlocked(true); } }} />
      </DialogContent></Dialog>}
    {open && unlocked && <Suspense fallback={null}><Copilot open={open} onOpenChange={setOpen} showTrigger={false}
      context={{ route: location.pathname }} /></Suspense>}
  </>;
}
