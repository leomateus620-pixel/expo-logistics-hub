import { BookOpen, ExternalLink, FolderOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isKbSourceDate } from '../../../../supabase/functions/_shared/workers/kb-source';
import { safeWorkerSourceUrl } from '../api';

/** The date is the access declared in the source, not a fresh verification of its facts. */
export function WorkerKnowledgeSource({ label, url, date }: { label: string; url: string; date?: string }) {
  return <WorkerSourceIcon label={label} url={url} date={date} source="kb" />;
}

export function WorkerSourceIcon({ label, url, date, source: declaredSource }: { label: string; url: string; date?: string; source?: 'kb' | 'web' | 'app' }) {
  const source = declaredSource ?? (url.startsWith('/') ? 'app' : 'web');
  const href = safeWorkerSourceUrl(url, source);
  if (!href || (source === 'kb' && !isKbSourceDate(date))) return null;
  const kind = source === 'kb' ? 'Base de conhecimento' : source === 'web' ? 'Fonte na web' : 'Dados do aplicativo';
  const dateLabel = date && isKbSourceDate(date) ? new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : date;
  const dateText = dateLabel ? `${source === 'kb' ? 'Acesso declarado em ' : 'Data da fonte: '}${dateLabel}` : '';
  const Icon = source === 'kb' ? BookOpen : source === 'web' ? ExternalLink : FolderOpen;
  return <TooltipProvider delayDuration={180}><Tooltip>
    <TooltipTrigger asChild><a className="worker-source-icon" href={href} aria-label={`${kind} · ${label}${dateText ? ` · ${dateText}` : ''}`} data-source-kind={source} data-source-date={date}
      target={source === 'app' ? undefined : '_blank'} rel={source === 'app' ? undefined : 'noopener noreferrer'}><Icon size={16} aria-hidden="true" /></a></TooltipTrigger>
    <TooltipContent className="workers-scope worker-source-tooltip" side="top" align="start" collisionPadding={16}>
      <span className="worker-source-kind">{kind}</span><strong>{label}</strong>{dateText && <time dateTime={date}>{dateText}</time>}
    </TooltipContent>
  </Tooltip></TooltipProvider>;
}
