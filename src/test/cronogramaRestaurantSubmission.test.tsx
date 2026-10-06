import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { visualEventToSourceUpdates } from '@/components/cronograma-eventos/modelAdapter';
import type { CronogramaEvent as SourceEvent } from '@/lib/cronograma-eventos';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useEventCenterRestaurantConflicts', () => ({ useEventCenterRestaurantConflicts: () => ({ events: [], loading: false, error: false }) }));
vi.mock('@/components/cronograma-eventos/useCronogramaRelationOptions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/components/cronograma-eventos/useCronogramaRelationOptions');
  return { ...actual, useCronogramaRelationOptions: () => ({ units: [], commissions: [], members: [], loginMembers: [], responsibleOptions: [], commissionsLoading: false, membersLoading: false }) };
});

afterEach(cleanup);

const sourceForm: CronogramaEvent = { id: 'source-id', sourceKey: 'source-key', title: 'Evento do Centro', summary: '', date: null, year: 2028, category: 'governanca', status: 'planned', priority: 'medium', kind: 'event', location: 'CENTRO DE EVENTOS FENASOJA', locationCode: 'centro_eventos_fenasoja', lockVersion: 2 };

describe('submissão da Agenda para o Restaurante', () => {
  it('retains a new source identity and filled fields through retries and correction', () => {
    const onSubmit = vi.fn();
    const props = { onSubmit, onCancel: vi.fn(), showSubevents: false, showRelational: false };
    const { rerender } = render(<EventForm {...props} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Evento de teste local' } });
    fireEvent.submit(document.querySelector('form')!);
    const sourceKey = onSubmit.mock.calls[0][0].sourceKey;
    expect(sourceKey).toMatch(/^manual-[0-9a-f-]{36}$/);
    rerender(<EventForm {...props} submitError="Não foi possível confirmar o salvamento. Tente novamente." />);
    expect(screen.getByLabelText('Título')).toHaveValue('Evento de teste local');
    fireEvent.submit(document.querySelector('form')!);
    expect(onSubmit.mock.calls[1][0].sourceKey).toBe(sourceKey);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Evento corrigido' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(onSubmit.mock.calls[2][0].sourceKey).toBe(sourceKey);
  });

  it('shows forwarding guidance for the exact canonical Center and preserves an explicit different code', () => {
    const onSubmit = vi.fn();
    const props = { onSubmit, onCancel: vi.fn(), showSubevents: false, showRelational: false };
    const { rerender } = render(<EventForm {...props} event={sourceForm} />);
    expect(screen.getByText('Este evento também será encaminhado ao Restaurante para validação.')).toBeVisible();
    rerender(<EventForm {...props} event={{ ...sourceForm, id: 'other-id', sourceKey: 'other-key', locationCode: 'sala_voluntarios' }} />);
    expect(screen.queryByText('Este evento também será encaminhado ao Restaurante para validação.')).not.toBeInTheDocument();
    fireEvent.submit(document.querySelector('form')!);
    expect(onSubmit.mock.calls[0][0].locationCode).toBe('sala_voluntarios');
  });

  it('keeps the edited form version so a background refresh cannot mask a concurrent edit', () => {
    const current = { lockVersion: 5 } as SourceEvent;
    expect(visualEventToSourceUpdates(sourceForm, current).lockVersion).toBe(2);
  });
});
