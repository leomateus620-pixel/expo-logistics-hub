// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { CronogramaEvent } from '@/lib/cronograma-eventos';
import {
  attachQueuedCronogramaRelationships,
  cronogramaRelationshipQueueStorageKey,
  enqueueCronogramaRelationship,
  isQueueableCronogramaRelationshipError,
  readCronogramaRelationshipQueue,
  recordQueuedCronogramaAttempt,
  removeQueuedCronogramaRelationship,
  updateQueuedCronogramaRelationship,
} from '@/lib/cronograma-relationship-queue';

const baseEvent: CronogramaEvent = {
  id: 'seed:evento-principal',
  sourceKey: 'evento-principal',
  title: 'Evento principal',
  category: 'Planejamento',
  eventType: 'planejamento',
  sourceYear: 2026,
  startDate: '2026-07-22',
  endDate: '2026-07-22',
  status: 'planejado',
  priority: 'alta',
  sourceSheet: 'Cronograma oficial',
  isOfficialSeed: true,
  hasExactDate: true,
  subevents: [],
};

function enqueue(title = 'Confirmar fornecedores') {
  return enqueueCronogramaRelationship({
    requestId: '11111111-1111-4111-8111-111111111111',
    orgId: 'org-a',
    parentEventId: baseEvent.id,
    parentSourceKey: baseEvent.sourceKey,
    parentTitle: baseEvent.title,
    draft: {
      title,
      description: 'Validar disponibilidade.',
      startDate: '2026-07-20',
      status: 'planejado',
      priority: 'alta',
      sortOrder: 0,
    },
  });
}

describe('fila de relacionamentos do cronograma', () => {
  beforeEach(() => {
    window.localStorage.removeItem(cronogramaRelationshipQueueStorageKey);
  });

  it('deduplica pelo requestId e mantém a fila isolada por organização', () => {
    enqueue();
    enqueue('Confirmar fornecedores atualizados');
    enqueueCronogramaRelationship({
      requestId: '22222222-2222-4222-8222-222222222222',
      orgId: 'org-b',
      parentEventId: baseEvent.id,
      parentSourceKey: baseEvent.sourceKey,
      parentTitle: baseEvent.title,
      draft: { title: 'Outro escopo' },
    });

    expect(readCronogramaRelationshipQueue()).toHaveLength(2);
    expect(readCronogramaRelationshipQueue('org-a')).toEqual([
      expect.objectContaining({
        requestId: '11111111-1111-4111-8111-111111111111',
        draft: expect.objectContaining({ title: 'Confirmar fornecedores atualizados' }),
      }),
    ]);
  });

  it('anexa o rascunho ao evento certo e expõe o estado de tentativa', () => {
    enqueue();
    recordQueuedCronogramaAttempt(
      'org-a',
      '11111111-1111-4111-8111-111111111111',
      { code: 'PGRST205', message: 'Could not find the table public.cronograma_subeventos' },
    );

    const events = attachQueuedCronogramaRelationships(
      [baseEvent],
      readCronogramaRelationshipQueue('org-a'),
    );

    expect(events[0].subevents).toEqual([
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        storage: 'queued',
        syncState: 'failed',
        syncError: expect.stringContaining('Could not find the table'),
      }),
    ]);
  });

  it('permite corrigir e cancelar um rascunho antes da sincronização', () => {
    enqueue();
    recordQueuedCronogramaAttempt('org-a', '11111111-1111-4111-8111-111111111111', new Error('timeout'));
    const updated = updateQueuedCronogramaRelationship(
      'org-a',
      '11111111-1111-4111-8111-111111111111',
      { title: 'Confirmar fornecedores e escopo', status: 'em_andamento' },
    );

    expect(updated.lastError).toBeNull();
    expect(updated.draft.title).toBe('Confirmar fornecedores e escopo');
    removeQueuedCronogramaRelationship('org-a', updated.requestId);
    expect(readCronogramaRelationshipQueue('org-a')).toEqual([]);
  });

  it('enfileira falhas transitórias, mas não mascara erros de permissão', () => {
    expect(isQueueableCronogramaRelationshipError({ code: 'PGRST205', message: 'schema cache' })).toBe(true);
    expect(isQueueableCronogramaRelationshipError(new Error('Failed to fetch'))).toBe(true);
    expect(isQueueableCronogramaRelationshipError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isQueueableCronogramaRelationshipError({ code: '23514', message: 'check violation' })).toBe(false);
    expect(isQueueableCronogramaRelationshipError(new Error('qualquer falha'), false)).toBe(true);
  });
});
