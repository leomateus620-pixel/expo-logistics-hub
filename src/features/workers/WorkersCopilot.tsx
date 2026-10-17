import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WorkersMotionProvider } from './motion/MotionProvider';
import { WorkersChat } from './components/WorkersChat';
import { WorkerTeamMark } from './components/WorkerTeamBrand';
import type { WorkerContext, WorkerId } from './types';
import { resolveWorkersRecord } from './context';
import './styles/worker-tokens.css';
import './styles/workers.css';
import './styles/workspace.css';

export interface WorkersCopilotProps { context?: WorkerContext; workerId?: WorkerId; open?: boolean; onOpenChange?: (open: boolean) => void; showTrigger?: boolean }
export default function WorkersCopilot({ context, workerId, open: controlledOpen, onOpenChange, showTrigger = true }: WorkersCopilotProps) {
  const location = useLocation(); const [localOpen, setLocalOpen] = useState(false); const open = controlledOpen ?? localOpen;
  const focusBeforeOpen = useRef<HTMLElement | null>(null);
  const setOpen = (value: boolean) => { if (value && !open) focusBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setLocalOpen(value); onOpenChange?.(value); };
  const [resolvedRecord, setResolvedRecord] = useState<{ route: string; search: string; id?: string }>();
  const route = context?.route ?? location.pathname;
  const recordId = context?.recordId ?? (resolvedRecord?.route === route && resolvedRecord.search === location.search ? resolvedRecord.id : undefined);
  const effectiveContext = { route, ...(recordId ? { recordId } : {}) };
  useEffect(() => {
    let cancelled = false;
    if (open) void resolveWorkersRecord(route, location.search).then(id => {
      if (!cancelled) setResolvedRecord({ route, search: location.search, id });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, route, location.search]);
  useEffect(() => { if (controlledOpen !== undefined) return; const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !location.pathname.startsWith('/equipe-ia')) { event.preventDefault(); if (!open) focusBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setLocalOpen(previous => !previous); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [location.pathname, controlledOpen, open]);
  return <WorkersMotionProvider><div className="workers-scope">{showTrigger && <button type="button" className="worker-copilot-trigger" aria-label="Abrir BOT FENASOJA" aria-keyshortcuts="Control+k Meta+k" onClick={() => setOpen(true)}><WorkerTeamMark size={24} /><span>BOT FENASOJA</span><kbd>⌘ K</kbd></button>}<Sheet open={open} onOpenChange={setOpen}><SheetContent className="workers-scope worker-copilot-sheet" onOpenAutoFocus={() => { if (!focusBeforeOpen.current && document.activeElement instanceof HTMLElement) focusBeforeOpen.current = document.activeElement; }} onCloseAutoFocus={event => { const previous = focusBeforeOpen.current; if (previous?.isConnected) { event.preventDefault(); previous.focus({ preventScroll: true }); } focusBeforeOpen.current = null; }}><SheetHeader className="sr-only"><SheetTitle>BOT FENASOJA</SheetTitle><SheetDescription>Converse com a equipe sobre o contexto da tela atual.</SheetDescription></SheetHeader>{open && <WorkersChat compact workerId={workerId} context={effectiveContext} onClose={() => setOpen(false)} />}</SheetContent></Sheet></div></WorkersMotionProvider>;
}
