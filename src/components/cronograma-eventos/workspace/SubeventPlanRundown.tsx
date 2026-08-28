import { CheckCircle2, Circle, ListChecks, Timer, Users } from 'lucide-react';
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

function metaLine(...values: Array<string | null | undefined>) {
  const parts = values.map((value) => value?.trim()).filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}

/** Read-only rundown of the operational plan of a subevent. */
export function SubeventPlanRundown({ subevent }: { subevent: CronogramaSubevent }) {
  const actions = subevent.actions ?? [];
  const provisions = subevent.provisions ?? [];
  const guests = subevent.guests ?? [];
  if (actions.length === 0 && provisions.length === 0 && guests.length === 0) return null;

  const actionsDone = actions.filter((action) => action.isDone).length;
  const provisionsDone = provisions.filter((provision) => provision.isDone).length;
  const provisionsPercent = provisions.length
    ? Math.round((provisionsDone / provisions.length) * 100)
    : 0;

  return (
    <div className="cronograma-plan-rundown">
      {actions.length > 0 && (
        <section className="cronograma-plan-block" data-kind="actions">
          <header className="cronograma-plan-block-head">
            <span className="cronograma-plan-block-icon"><Timer aria-hidden="true" /></span>
            <h5>Ações programadas</h5>
            <span className="cronograma-plan-block-count">
              {actionsDone > 0 ? `${actionsDone} de ${actions.length} concluídas` : `${actions.length} ${actions.length === 1 ? 'ação' : 'ações'}`}
            </span>
          </header>

          <ol className="cronograma-plan-track">
            {actions.map((action, index) => {
              const meta = metaLine(action.responsibleName, action.commissionName, action.notes);
              return (
                <li
                  key={action.id ?? `action-${index}`}
                  className="cronograma-plan-track-item"
                  data-done={action.isDone ? 'true' : undefined}
                >
                  <span className="cronograma-plan-track-marker" aria-hidden="true" />
                  <time className="cronograma-plan-track-time">{action.startTime || '--:--'}</time>
                  <div className="cronograma-plan-track-body">
                    <p className="cronograma-plan-track-title">{action.title}</p>
                    {meta && <p className="cronograma-plan-track-meta">{meta}</p>}
                  </div>
                  {action.isDone && (
                    <span className="cronograma-plan-track-state">
                      <CheckCircle2 aria-hidden="true" />
                      <span className="sr-only">Concluída</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {provisions.length > 0 && (
        <section className="cronograma-plan-block" data-kind="provisions">
          <header className="cronograma-plan-block-head">
            <span className="cronograma-plan-block-icon"><ListChecks aria-hidden="true" /></span>
            <h5>Estrutura e providências</h5>
            <span className="cronograma-plan-block-count">{provisionsDone} de {provisions.length} concluídas</span>
            <span className="cronograma-plan-progress" role="presentation">
              <span style={{ width: `${provisionsPercent}%` }} />
            </span>
          </header>

          <ul className="cronograma-plan-checklist">
            {provisions.map((provision, index) => {
              const meta = metaLine(provision.responsibleName, provision.commissionName, provision.note);
              return (
                <li
                  key={provision.id ?? `provision-${index}`}
                  className="cronograma-plan-checklist-item"
                  data-done={provision.isDone ? 'true' : undefined}
                >
                  <span className="cronograma-plan-checklist-mark" aria-hidden="true">
                    {provision.isDone ? <CheckCircle2 /> : <Circle />}
                  </span>
                  <div className="cronograma-plan-track-body">
                    <p className="cronograma-plan-track-title">{provision.description}</p>
                    {meta && <p className="cronograma-plan-track-meta">{meta}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {guests.length > 0 && (
        <section className="cronograma-plan-block" data-kind="guests">
          <header className="cronograma-plan-block-head">
            <span className="cronograma-plan-block-icon"><Users aria-hidden="true" /></span>
            <h5>Convidados</h5>
            <span className="cronograma-plan-block-count">{guests.length}</span>
          </header>
          <ul className="cronograma-plan-chips">
            {guests.map((guest, index) => (
              <li key={guest.id ?? `guest-${index}`}>
                <span>{guest.name}</span>
                {guest.category && <small>{guest.category}</small>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
