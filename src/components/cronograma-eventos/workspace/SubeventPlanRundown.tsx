import type { CronogramaSubevent } from '@/components/cronograma-eventos/types';

/** Short operational summary used on cards and headers (ex.: "6 ações · 4 providências · 9 convidados"). */
export function subeventPlanSummary(subevent: CronogramaSubevent) {
  const actions = subevent.actions?.length ?? 0;
  const provisions = subevent.provisions?.length ?? 0;
  const guests = subevent.guests?.length ?? 0;
  if (actions + provisions + guests === 0) return null;
  const parts: string[] = [];
  if (actions > 0) parts.push(`${actions} ${actions === 1 ? 'ação' : 'ações'}`);
  if (provisions > 0) parts.push(`${provisions} ${provisions === 1 ? 'providência' : 'providências'}`);
  if (guests > 0) parts.push(`${guests} ${guests === 1 ? 'convidado' : 'convidados'}`);
  return parts.join(' · ');
}

/** Read-only rundown of the operational plan of a subevent. */
export function SubeventPlanRundown({ subevent }: { subevent: CronogramaSubevent }) {
  const actions = subevent.actions ?? [];
  const provisions = subevent.provisions ?? [];
  const guests = subevent.guests ?? [];
  if (actions.length === 0 && provisions.length === 0 && guests.length === 0) return null;

  return (
    <div className="cronograma-plan-rundown">
      {actions.length > 0 && (
        <div className="cronograma-plan-rundown-group">
          <strong>Ações programadas</strong>
          {actions.map((action, index) => (
            <p key={action.id ?? `action-${index}`} className="cronograma-plan-rundown-item" data-done={action.isDone ? 'true' : undefined}>
              <time>{action.startTime || '--:--'}</time>
              {action.title}
              {action.responsibleName && <span>· {action.responsibleName}</span>}
            </p>
          ))}
        </div>
      )}

      {provisions.length > 0 && (
        <div className="cronograma-plan-rundown-group">
          <strong>Estrutura e providências</strong>
          {provisions.map((provision, index) => (
            <p key={provision.id ?? `provision-${index}`} className="cronograma-plan-rundown-item" data-done={provision.isDone ? 'true' : undefined}>
              {provision.description}
              {provision.responsibleName && <span>· {provision.responsibleName}</span>}
            </p>
          ))}
        </div>
      )}

      {guests.length > 0 && (
        <div className="cronograma-plan-rundown-group">
          <strong>Convidados</strong>
          <ul className="cronograma-plan-chips">
            {guests.map((guest, index) => (
              <li key={guest.id ?? `guest-${index}`}>
                <span>{guest.name}</span>
                {guest.category && <small>{guest.category}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
