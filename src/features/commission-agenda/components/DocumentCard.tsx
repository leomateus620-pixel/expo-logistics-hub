import { CalendarDays, Download, FileImage, FileSpreadsheet, FileText, MoreHorizontal, Presentation, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { DocumentKind, DocumentViewModel } from '../types';
import { formatDayMonth, getDateParts } from '../lib/agenda-presentation';
import { IconButton } from './primitives';

const KIND_META: Record<DocumentKind, { icon: LucideIcon; label: string }> = {
  pdf: { icon: FileText, label: 'PDF' },
  doc: { icon: FileText, label: 'DOC' },
  sheet: { icon: FileSpreadsheet, label: 'XLS' },
  image: { icon: FileImage, label: 'IMG' },
  presentation: { icon: Presentation, label: 'PPT' },
  other: { icon: FileText, label: 'ARQ' },
};

export interface DocumentCardProps {
  document: DocumentViewModel;
  /** Hides the related event line (used inside the event detail). */
  hideEvent?: boolean;
  onOpen?: (document: DocumentViewModel) => void;
  onDownload?: (document: DocumentViewModel) => void;
  className?: string;
}

export function DocumentCard({ document, hideEvent = false, onOpen, onDownload, className }: DocumentCardProps) {
  const meta = KIND_META[document.kind];
  const Icon = meta.icon;
  const { year } = getDateParts(document.date);

  return (
    <article className={cn('ws-card ua-document', className)}>
      <button
        type="button"
        className="ua-document__hit"
        aria-label={`Abrir documento ${document.name}`}
        onClick={() => onOpen?.(document)}
      />
      <span className="ua-document__type" data-kind={document.kind} aria-hidden="true">
        <Icon />
        <span className="ua-document__type-label">{meta.label}</span>
      </span>
      <div className="ua-document__body">
        <p className="ua-document__name ws-meta ws-clamp-2" style={{ fontWeight: 600 }}>{document.name}</p>
        <div className="ua-document__meta ws-caption">
          {document.category && <span>{document.category}</span>}
          {document.sizeLabel && <span>{document.sizeLabel}</span>}
          <span>{formatDayMonth(document.date)} {year}</span>
          {document.uploadedBy && <span>{document.uploadedBy.name}</span>}
        </div>
        {!hideEvent && document.eventTitle && (
          <span className="ua-document__event ws-caption">
            <CalendarDays aria-hidden="true" />
            <span className="truncate">{document.eventTitle}</span>
          </span>
        )}
      </div>
      <div className="ua-document__actions">
        <IconButton icon={Download} label={`Baixar ${document.name}`} onClick={() => onDownload?.(document)} className="ua-document__download" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={MoreHorizontal} label={`Mais ações para ${document.name}`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={() => onOpen?.(document)}>Abrir</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDownload?.(document)}>Baixar</DropdownMenuItem>
            <DropdownMenuItem disabled>Substituir versão</DropdownMenuItem>
            <DropdownMenuItem disabled className="text-destructive">Remover</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
