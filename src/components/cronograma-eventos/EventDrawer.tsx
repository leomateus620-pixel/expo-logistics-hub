import type { ReactNode } from 'react';
import { CalendarDays, ClipboardList, Clock3, FileSpreadsheet, Link2, MapPin, Pencil, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  formatEventRange,
  isCentralMeeting,
  isMainFenasojaEvent,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';
import { CategoryBadge, PriorityBadge, StatusBadge, TypeBadge } from './CronogramaBadges';
import EventPeriodBar from './EventPeriodBar';

interface EventDrawerProps {
  event: CronogramaEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: CronogramaEvent) => void;
  onAddSubevent: (event: CronogramaEvent) => void;
}

function DetailRow({ label, value, icon: Icon }: { label: string; value?: string | number | null; icon?: typeof CalendarDays }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-white/75 p-3 shadow-sm">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {label}
      </p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function DrawerSection({
  title,
  icon: Icon,
  children,
  accent = false,
}: {
  title: string;
  icon: typeof CalendarDays;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${accent ? 'border-gold/35 bg-gold/10' : 'border-border/60 bg-white/75'}`}>
      <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className={accent ? 'h-3.5 w-3.5 text-amber-800' : 'h-3.5 w-3.5 text-primary'} />
        {title}
      </p>
      {children}
    </section>
  );
}

export default function EventDrawer({ event, open, onOpenChange, onEdit, onAddSubevent }: EventDrawerProps) {
  const main = event ? isMainFenasojaEvent(event) : false;
  const central = event ? isCentralMeeting(event) : false;
  const commissions = event
    ? event.linkedCommissions?.length
      ? event.linkedCommissions
      : event.commissionName
        ? [{ slug: event.commissionSlug ?? 'comissao', name: event.commissionName }]
        : []
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-hidden border-l border-border/70 bg-[hsl(var(--card))] p-0 text-foreground shadow-2xl sm:max-w-xl lg:max-w-2xl"
      >
        {event && (
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border/70 bg-gradient-to-br from-white via-white to-primary/5 p-5 text-left">
              <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">
                {main && <PriorityBadge priority="critica" />}
                {central && <CategoryBadge category="Comissão Central" />}
                <TypeBadge type={event.eventType} />
                <StatusBadge status={event.status} />
              </div>
              <SheetTitle className="pr-10 text-2xl font-black leading-tight tracking-tight text-foreground">{event.title}</SheetTitle>
              <SheetDescription className="text-sm font-semibold text-muted-foreground">
                {formatEventRange(event)}
                {event.time ? ` às ${event.time}` : ''}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.42))]">
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap gap-2">
                  <CategoryBadge category={event.category} />
                  <PriorityBadge priority={event.priority} />
                </div>

                {event.description && (
                  <DrawerSection title="Descrição" icon={ClipboardList}>
                    <p className="text-sm leading-relaxed text-foreground/85">{event.description}</p>
                  </DrawerSection>
                )}

                <div className="rounded-2xl border border-border/60 bg-white/75 p-4 shadow-sm">
                  <EventPeriodBar event={event} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Ano" value={event.sourceYear} icon={CalendarDays} />
                  <DetailRow label="Data inicial" value={event.hasExactDate ? event.startDate : 'Sem data definida'} icon={CalendarDays} />
                  <DetailRow label="Data final" value={event.endDate} icon={CalendarDays} />
                  <DetailRow label="Mês" value={event.monthLabel} icon={CalendarDays} />
                  <DetailRow label="Semana" value={event.weekLabel} icon={Clock3} />
                  <DetailRow label="Local" value={event.location} icon={MapPin} />
                  <DetailRow label="Dias faltantes" value={event.daysRemaining} icon={Clock3} />
                  <DetailRow label="Responsável" value={event.responsibleName ?? 'Aguardando definição'} icon={Users} />
                </div>

                <DrawerSection title="Comissões vinculadas" icon={Link2}>
                  <div className="flex flex-wrap gap-2">
                    {commissions.map((commission) => (
                      <span key={commission.slug} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                        {commission.name}
                      </span>
                    ))}
                    {commissions.length === 0 && <span className="text-sm font-semibold text-muted-foreground">Nenhuma comissão vinculada.</span>}
                  </div>
                </DrawerSection>

                <DrawerSection title="Subeventos" icon={ClipboardList}>
                  {event.subevents?.length ? (
                    <div className="space-y-2">
                      {event.subevents.map((subevent, index) => (
                        <div key={`${subevent.title}-${index}`} className="rounded-xl border border-border/60 bg-white/80 p-3">
                          <p className="text-sm font-black text-foreground">{subevent.title}</p>
                          {subevent.description && <p className="mt-1 text-xs font-semibold text-muted-foreground">{subevent.description}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-muted-foreground">Nenhum subevento oficial cadastrado.</p>
                  )}
                </DrawerSection>

                <DrawerSection title="Origem oficial" icon={FileSpreadsheet} accent>
                  <div className="space-y-2 text-sm font-semibold text-foreground/85">
                    <p>
                      <span className="text-muted-foreground">Planilha:</span> {event.sourceSheet}
                    </p>
                    {event.sourceRow && (
                      <p>
                        <span className="text-muted-foreground">Linha:</span> {event.sourceRow}
                      </p>
                    )}
                    {event.sourceCell && (
                      <p>
                        <span className="text-muted-foreground">Célula:</span> {event.sourceCell}
                      </p>
                    )}
                    {event.sourceNote && (
                      <p>
                        <span className="text-muted-foreground">Observação:</span> {event.sourceNote}
                      </p>
                    )}
                    <p className="break-all">
                      <span className="text-muted-foreground">Chave:</span> <span className="font-mono text-xs">{event.sourceKey}</span>
                    </p>
                  </div>
                </DrawerSection>
              </div>
            </ScrollArea>

            <footer className="border-t border-border/70 bg-white/95 p-4 shadow-[0_-16px_32px_-28px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="rounded-xl bg-white text-xs font-bold sm:text-sm" onClick={() => onAddSubevent(event)}>
                  <Plus className="h-4 w-4" />
                  Adicionar subevento
                </Button>
                <Button className="rounded-xl text-xs font-bold sm:text-sm" onClick={() => onEdit(event)}>
                  <Pencil className="h-4 w-4" />
                  Editar evento
                </Button>
              </div>
            </footer>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
