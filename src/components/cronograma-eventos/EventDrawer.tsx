import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  Layers3,
  MapPin,
  Route,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaMetaBadge,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
  EventIdentityStrip,
} from './CronogramaBadges';
import { EventForm } from './EventForm';
import { formatLongDate, formatLongDateRange } from './dateUtils';
import type { CronogramaEvent } from './types';

export function EventDrawer({
  event,
  open,
  onOpenChange,
  onSave,
  startInEdit = false,
}: {
  event: CronogramaEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: CronogramaEvent) => void;
  startInEdit?: boolean;
}) {
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (open) setEditMode(startInEdit);
  }, [open, event?.id, startInEdit]);

  if (!event) return null;

  const handleSave = (nextEvent: CronogramaEvent) => {
    onSave(nextEvent);
    setEditMode(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="cronograma-drawer flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="cronograma-drawer-header relative p-5 sm:p-6">
          <EventIdentityStrip event={event} className="left-0 inset-y-6" />
          <SheetHeader className="pr-8 text-left">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CronogramaCategoryMarker category={event.category} />
              {event.isOfficial && <CronogramaMetaBadge icon={Sparkles} tone="gold">Oficial</CronogramaMetaBadge>}
              {event.isCentralMeeting && <CronogramaMetaBadge icon={Route} tone="green">Reunião central</CronogramaMetaBadge>}
            </div>
            <SheetTitle className="text-2xl font-black leading-tight tracking-tight text-foreground">
              {event.title}
            </SheetTitle>
            <SheetDescription className="text-sm leading-relaxed text-muted-foreground">
              {event.summary}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CronogramaStatusIndicator status={event.status} />
            <CronogramaPriorityIndicator priority={event.priority} />
          </div>
        </div>

        <div className="cronograma-drawer-body flex-1 overflow-y-auto p-5 sm:p-6">
          {editMode ? (
            <EventForm
              event={event}
              onSubmit={handleSave}
              onCancel={() => setEditMode(false)}
            />
          ) : (
            <div className="space-y-4">
              <section className="cronograma-drawer-section grid gap-x-5 sm:grid-cols-2">
                <InfoBlock icon={CalendarClock} label="Data e horário" value={`${formatLongDateRange(event.date, event.endDate)}${event.startTime ? ` · ${event.startTime}` : ''}${event.endTime ? ` às ${event.endTime}` : ''}`} />
                <InfoBlock icon={MapPin} label="Local" value={event.location || 'Local a definir'} />
                <InfoBlock icon={UserRound} label="Responsável" value={event.owner || 'Responsável a definir'} />
                <InfoBlock icon={Layers3} label="Comissão" value={event.commission || 'Comissão a definir'} />
              </section>

              {(event.pendingReason || event.decisionNeeded || !event.date) && (
                <section className="cronograma-drawer-section rounded-xl border border-amber-900/10 bg-gold/[0.075] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-950/65">Decisão pendente</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/78">{event.pendingReason || 'Ainda sem data oficial definida.'}</p>
                  {event.decisionNeeded && (
                    <p className="mt-3 rounded-xl bg-white/58 p-3 text-sm font-medium text-primary">{event.decisionNeeded}</p>
                  )}
                </section>
              )}

              {event.subevents && event.subevents.length > 0 && (
                <section className="cronograma-drawer-section border-t border-border/45 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Subeventos</p>
                      <h3 className="font-black tracking-tight text-foreground">Entregas vinculadas</h3>
                    </div>
                    <span className="rounded-full bg-primary/[0.07] px-2.5 py-1 text-xs font-bold text-primary">{event.subevents.length}</span>
                  </div>
                  <div className="space-y-2">
                    {event.subevents.map((subevent, index) => (
                      <div key={`${subevent.title}-${index}`} className="flex items-start gap-3 rounded-xl border border-border/35 bg-white/58 p-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight text-foreground">{subevent.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {subevent.date ? formatLongDate(subevent.date) : 'sem data vinculada'}
                            {subevent.owner ? ` · ${subevent.owner}` : ''}
                          </p>
                        </div>
                        {subevent.status && <CronogramaStatusIndicator status={subevent.status} compact />}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="cronograma-drawer-section border-t border-border/45 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Leitura executiva</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/76">{event.summary}</p>
              </section>
            </div>
          )}
        </div>

        {!editMode && (
          <div className="cronograma-drawer-footer p-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
                Fechar
              </Button>
              <Button type="button" onClick={() => setEditMode(true)} className="rounded-full">
                <Edit3 className="h-4 w-4" />
                Editar
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('cronograma-info-row py-3')}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {label}
      </div>
      <p className="text-sm font-semibold leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
