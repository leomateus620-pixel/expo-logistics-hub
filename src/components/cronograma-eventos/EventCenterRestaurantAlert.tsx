import { AlertTriangle } from 'lucide-react';
import { useEventCenterRestaurantConflicts } from '@/hooks/useEventCenterRestaurantConflicts';
import { classifyRestaurantAlert } from '@/lib/event-center-restaurant-conflicts';

export function EventCenterRestaurantAlert({ code, start, end }: { code?: string | null; start: string | null; end: string | null }) {
  const { events, loading, error } = useEventCenterRestaurantConflicts(code, start, end);
  if (!events.length && !loading && !error) return null;
  return <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-foreground" aria-live="polite">
    {events.length > 0 && <>
      <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" /> Eventos do Restaurante próximos</div>
      <ul className="mt-2 space-y-2 pl-6 list-disc">
        {events.map((item, index) => <li key={`${item.event_date}-${index}`}>
          <strong>{classifyRestaurantAlert(item.event_date, item.event_end_date, start ?? '', end || start || '')}</strong> · {item.event_date.split('-').reverse().join('/')}{item.event_end_date !== item.event_date ? `–${item.event_end_date.split('-').reverse().join('/')}` : ''} · {item.title}{item.start_time ? ` · ${item.start_time}${item.end_time ? `–${item.end_time}` : ''}` : ''}
        </li>)}
      </ul>
    </>}
    {loading && <p className="text-muted-foreground">Conferindo agenda do Restaurante…</p>}
    {error && <p className="text-muted-foreground">Não foi possível conferir a agenda do Restaurante agora.</p>}
  </div>;
}