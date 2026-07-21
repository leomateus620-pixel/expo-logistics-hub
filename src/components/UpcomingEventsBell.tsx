import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Bell, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface UpcomingEvent {
  id: string;
  title: string;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  location: string | null;
  category: string | null;
}

const SESSION_KEY = 'fenasoja-upcoming-shown';

export function UpcomingEventsBell() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [autoShown, setAutoShown] = useState(false);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['next-events-feed', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('next-events-feed');
      if (error) throw error;
      return data as { events: UpcomingEvent[] };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const events = data?.events ?? [];

  // Auto-abrir uma vez por sessão se houver eventos
  useEffect(() => {
    if (!events.length || autoShown) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(true);
    setAutoShown(true);
  }, [events, autoShown]);

  if (!user) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen((o) => !o)}
        aria-label="Próximos eventos"
      >
        <Bell className="h-4 w-4" />
        {events.length > 0 && !dismissed && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground grid place-items-center">
            {events.length}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-[340px] rounded-2xl border border-border/60 bg-background/95 backdrop-blur-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Próximos eventos</h4>
              </div>
              <button onClick={() => { setOpen(false); setDismissed(true); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento próximo para suas comissões.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      to={`/cronograma-eventos?event=${ev.id}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg border border-border/40 p-3 hover:border-primary/40 hover:bg-primary/5 transition"
                    >
                      <p className="text-sm font-medium leading-tight">{ev.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(ev.start_date + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })}
                        {ev.start_time && ` · ${ev.start_time.slice(0, 5)}`}
                        {ev.location && ` · ${ev.location}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
