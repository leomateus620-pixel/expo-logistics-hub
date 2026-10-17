import { useEffect, useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { ArrowUpRight, Check, ChevronDown, Circle, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkerMascot } from '../mascot/WorkerMascot';
import { getWorker, workerCatalog } from '../workerCatalog';
import type { WorkerDefinition, WorkerProgressStep } from '../types';
import { workerStyle } from '../ui-utils';
import { useWorkerAccess } from '../useWorkerAccess';
import { WorkerTeamMark, WorkerBotMotionToggle } from './WorkerTeamBrand';

export function WorkerLink({ to, children, className, style, onClick, ...props }: { to: string; children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void; 'aria-label'?: string }) {
  const navigate = useNavigate();
  const transition = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (!doc.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault(); doc.startViewTransition(() => flushSync(() => navigate(to)));
  };
  return <Link to={to} className={className} style={style} onClick={transition} {...props}>{children}</Link>;
}

export function WorkerCluster({ compact = false, fullTeam = false }: { compact?: boolean; fullTeam?: boolean }) {
  const ids = fullTeam ? ['comissao', 'agenda', 'mapa', 'interesse', 'arena', 'caixa', 'radar', 'logistica'] : ['comissao', 'agenda', 'mapa', 'interesse'];
  return <div className={`worker-cluster ${compact ? 'worker-cluster--compact' : ''} ${fullTeam ? 'worker-cluster--full' : ''}`} aria-hidden="true">
    {ids.map((id, index) => { const worker = getWorker(id)!; return <div key={id} className={`worker-cluster__item worker-cluster__item--${index}`}><WorkerMascot shape={worker.shape} color={worker.color} size={index === 1 ? 136 : fullTeam ? 76 : 88} seed={`cluster-${id}`} interactive /></div>; })}
    {!compact && <TeamChatter />}
  </div>;
}

export function TeamChatter() {
  const reducedMotion = useReducedMotion();
  const [phrase, setPhrase] = useState<string | null>(null);
  useEffect(() => {
    if (reducedMotion) return;
    let hide: ReturnType<typeof setTimeout>; let next: ReturnType<typeof setTimeout>; let count = 0;
    const phrases = ['Vamos preparar a feira?', 'Cada detalhe conta.', 'Tudo começa com uma boa conversa.'];
    const show = () => { if (!document.hidden) setPhrase(phrases[count++ % phrases.length]); hide = setTimeout(() => setPhrase(null), 3200); next = setTimeout(show, 6000 + Math.random() * 4000); };
    next = setTimeout(show, 6500); return () => { clearTimeout(hide); clearTimeout(next); };
  }, [reducedMotion]);
  return <AnimatePresence>{phrase && <m.div aria-hidden="true" className="worker-chatter-group" initial={{ opacity: 0, y: 4, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .2 }}><span className="worker-chatter">{phrase}</span><span className="worker-chatter worker-chatter--reply">Estou por aqui.</span></m.div>}</AnimatePresence>;
}

export function PermissionNote({ worker }: { worker: WorkerDefinition }) {
  const { allowed, isLoading, loadError } = useWorkerAccess(worker);
  if (isLoading) return <p className="worker-permission-note"><Loader2 size={16} className="worker-spin" /> Conferindo suas permissões…</p>;
  return <div className={`worker-permission-note ${!allowed || loadError ? 'worker-permission-note--notice' : ''}`} role={!allowed || loadError ? 'status' : undefined}><ShieldCheck size={18} /><span>{loadError ? 'Não foi possível conferir suas permissões. As consultas continuam protegidas no servidor.' : allowed ? 'As consultas usam as suas permissões e mostram somente o que você pode acessar.' : `Você pode conhecer ${worker.name}, mas precisa do acesso ao módulo para consultar seus dados.`}</span></div>;
}

export function ProgressSteps({ steps }: { steps: WorkerProgressStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  return <div className="worker-progress"><button className="worker-progress__toggle" aria-expanded={open} onClick={() => setOpen(!open)} type="button">{last.status === 'running' ? <Loader2 size={15} className="worker-spin" /> : <Check size={15} />}<span>{last.label}</span><ChevronDown size={14} className={open ? 'worker-chevron-open' : ''} /></button>{open && <ol>{steps.map((step, index) => <li key={`${index}-${step.label}`}>{step.status === 'complete' ? <Check size={14} /> : <Circle size={12} />} {step.label}</li>)}</ol>}</div>;
}

export function WorkerChip({ worker, onClick, selected = false }: { worker: WorkerDefinition; onClick?: () => void; selected?: boolean }) {
  return <button className={`worker-chip ${selected ? 'is-selected' : ''}`} style={workerStyle(worker)} type="button" onClick={onClick} aria-pressed={selected}><WorkerMascot shape={worker.shape} color={worker.color} size={29} paused /><span>{worker.name}</span></button>;
}

export function WorkerEmptyState({ title = 'O que você quer saber?', description = 'Consulte os dados da feira com o especialista certo. O BOT FENASOJA considera o contexto e respeita o seu acesso.', children }: { title?: string; description?: string; children?: ReactNode }) {
  return <div className="worker-empty worker-empty--conversation"><article className="worker-intro-message" aria-label="Mensagem inicial do BOT FENASOJA"><div className="worker-intro-message__avatar"><WorkerTeamMark size={56} /></div><div className="worker-intro-message__body"><div className="worker-intro-message__author"><span>BOT FENASOJA</span><WorkerBotMotionToggle /></div><p className="worker-intro-message__greeting">{title}</p><p className="worker-empty__description">{description}</p>{children}</div></article></div>;
}

export function WorkerSkeletons({ rows = 3 }: { rows?: number }) { return <div className="worker-skeletons" role="status" aria-label="Carregando conversas">{Array.from({ length: rows }, (_, index) => <div className="worker-skeleton-row" key={index}><Skeleton className="h-11 w-11 rounded-2xl" /><div><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-3 w-44" /></div></div>)}</div>; }
export function ResultChip({ label, href }: { label: string; href: string }) { return <a href={href} className="worker-result-chip">{label}<ArrowUpRight size={13} /></a>; }
export function CatalogWorkerChips({ onSelect }: { onSelect: (worker: WorkerDefinition) => void }) { return <div className="worker-chips">{workerCatalog.map(worker => <WorkerChip key={worker.id} worker={worker} onClick={() => onSelect(worker)} />)}</div>; }
