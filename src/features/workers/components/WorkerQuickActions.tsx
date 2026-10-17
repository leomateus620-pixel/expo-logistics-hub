import { useId, useState, type ReactNode } from 'react';
import { BarChart3, Bell, BookOpen, History, Users } from 'lucide-react';
import { WorkerLink } from './WorkerPrimitives';

function Shortcut({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="worker-nav-shortcut" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    {children}
    {open && <span className="worker-nav-shortcut__tooltip" role="tooltip" id={id}>{label}</span>}
  </span>;
}

export function WorkerQuickActions({ isAdmin, routineCount, needsYou, onOpen }: {
  isAdmin: boolean; routineCount: number; needsYou: number; onOpen: (panel: 'routines' | 'memory' | 'inbox') => void;
}) {
  const routinesLabel = `Rotinas${routineCount ? `: ${routineCount} ativas` : ''}`;
  const inboxLabel = `Precisa de você${needsYou ? `: ${needsYou} pendências` : ''}`;
  return <nav className="worker-workspace-nav worker-quick-actions" aria-label="Atalhos do BOT FENASOJA">
    <Shortcut label="Conheça a equipe"><WorkerLink to="/equipe-ia/conheca" aria-label="Conheça a equipe"><Users size={18} aria-hidden="true" /></WorkerLink></Shortcut>
    <Shortcut label={routinesLabel}><button type="button" aria-label={routinesLabel} onClick={() => onOpen('routines')}><History size={18} aria-hidden="true" />{routineCount > 0 && <span className="worker-quick-actions__dot" aria-hidden="true" />}</button></Shortcut>
    <Shortcut label="Memória"><button type="button" aria-label="Memória" onClick={() => onOpen('memory')}><BookOpen size={18} aria-hidden="true" /></button></Shortcut>
    <Shortcut label={inboxLabel}><button type="button" aria-label={inboxLabel} onClick={() => onOpen('inbox')}><Bell size={18} aria-hidden="true" />{needsYou > 0 && <span className="worker-quick-actions__dot" aria-hidden="true" />}</button></Shortcut>
    {isAdmin && <Shortcut label="Uso da equipe"><WorkerLink to="/admin/workers/uso" aria-label="Uso da equipe"><BarChart3 size={18} aria-hidden="true" /></WorkerLink></Shortcut>}
  </nav>;
}
