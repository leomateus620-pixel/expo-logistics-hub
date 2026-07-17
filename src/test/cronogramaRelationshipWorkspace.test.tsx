// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRelationshipWorkspace } from '@/components/cronograma-eventos/workspace/EventRelationshipWorkspace';
import type {
  CronogramaEvent,
  CronogramaSubevent,
  CronogramaSubeventInput,
} from '@/components/cronograma-eventos/types';
import { visualEventToDraft, visualEventToSourceUpdates } from '@/components/cronograma-eventos/modelAdapter';
import type { CronogramaEvent as SourceCronogramaEvent } from '@/lib/cronograma-eventos';

const baseEvent: CronogramaEvent = {
  id: 'main-event',
  sourceKey: 'official-main-event',
  sourceCategory: 'Reuniões',
  sourceSheet: 'Cronograma oficial 2026',
  title: 'Reunião da Comissão Central',
  summary: 'Alinhar decisões, responsáveis e entregas prioritárias.',
  date: '2026-07-22',
  year: 2026,
  category: 'governanca',
  status: 'in_progress',
  priority: 'high',
  kind: 'meeting',
  owner: 'Coordenação Executiva',
  commission: 'Comissão Central',
  location: 'Parque de Exposições',
  isOfficial: true,
  subevents: [
    {
      id: 'embedded:main-event:0',
      title: 'Confirmar fornecedores',
      description: 'Validar disponibilidade, escopo e pontos de contato.',
      date: '2026-07-18',
      status: 'in_progress',
      owner: 'Equipe de Suprimentos',
      commissionSlug: 'logistica',
      commission: 'Logística',
      sortOrder: 0,
      storage: 'embedded',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Publicar pauta final',
      date: '2026-07-20',
      status: 'completed',
      owner: 'Secretaria',
      commissionSlug: 'comunicacao-midia',
      commission: 'Comunicação / Mídia',
      sortOrder: 1,
      storage: 'relational',
      updatedAt: '2026-07-15T12:00:00.000Z',
    },
  ],
};

function WorkspaceHarness({ onCreate }: { onCreate: (input: CronogramaSubeventInput) => void }) {
  const [event, setEvent] = useState(baseEvent);

  const create = async (input: CronogramaSubeventInput) => {
    onCreate(input);
    setEvent((current) => ({
      ...current,
      subevents: [
        ...(current.subevents ?? []),
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: input.title,
          description: input.description,
          date: input.date,
          status: input.status,
          owner: input.responsible,
          commissionSlug: input.commissionSlug,
          commission: 'Infraestrutura',
          sortOrder: current.subevents?.length ?? 0,
          storage: 'relational',
        },
      ],
    }));
  };

  return (
    <EventRelationshipWorkspace
      event={event}
      onBack={vi.fn()}
      onSaveEvent={vi.fn()}
      onCreateSubevent={create}
      onUpdateSubevent={vi.fn()}
      onRemoveSubevent={vi.fn()}
      canManage
      canDeleteSubevents
    />
  );
}

describe('EventRelationshipWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('apresenta o evento âncora e as conexões com metadados e ações operacionais', async () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(
      <EventRelationshipWorkspace
        event={baseEvent}
        onBack={vi.fn()}
        onSaveEvent={vi.fn()}
        onCreateSubevent={vi.fn()}
        onUpdateSubevent={onUpdate}
        onRemoveSubevent={onRemove}
        canManage
        canDeleteSubevents
      />,
    );

    expect(screen.getByRole('heading', { name: 'Reunião da Comissão Central' })).toBeVisible();
    expect(screen.getAllByTestId('subevent-node')).toHaveLength(2);
    expect(screen.getByText('Equipe de Suprimentos')).toBeVisible();
    expect(screen.getByText('Comunicação / Mídia')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Adicionar subevento' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Confirmar fornecedores' }));
    expect(screen.getByRole('region', { name: 'Detalhes de Confirmar fornecedores' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Concluir subevento Confirmar fornecedores' }));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'embedded:main-event:0' }),
        expect.objectContaining({ status: 'completed' }),
      );
      expect(screen.getByRole('button', { name: 'Concluir subevento Confirmar fornecedores' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar subevento Confirmar fornecedores' }));
    const editor = screen.getByTestId('subevent-editor');
    expect(within(editor).getByLabelText('Título')).toHaveValue('Confirmar fornecedores');
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remover subevento Confirmar fornecedores' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Remover esta conexão?');
    fireEvent.click(screen.getByRole('button', { name: 'Remover subevento' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({
      id: 'embedded:main-event:0',
    })));
  });

  it('reabre a bolha de adição após conectar um novo subevento', async () => {
    const onCreate = vi.fn();
    render(<WorkspaceHarness onCreate={onCreate} />);

    const addBubble = screen.getByRole('button', { name: 'Adicionar subevento' });
    fireEvent.click(addBubble);
    const composer = screen.getByTestId('subevent-composer');
    fireEvent.click(within(composer).getByRole('button', { name: 'Conectar subevento' }));
    expect(await screen.findByText('Informe um título para conectar este subevento.')).toBeVisible();

    fireEvent.change(within(composer).getByLabelText('Título'), { target: { value: 'Liberar plano de montagem' } });
    fireEvent.change(within(composer).getByLabelText('Descrição'), { target: { value: 'Consolidar responsáveis por cada frente.' } });
    fireEvent.change(within(composer).getByLabelText('Data ou prazo'), { target: { value: '2026-07-21' } });
    fireEvent.change(within(composer).getByLabelText('Responsável'), { target: { value: 'Coordenação de Montagem' } });
    fireEvent.change(within(composer).getByLabelText('Comissão / categoria'), { target: { value: 'infraestrutura' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Conectar subevento' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Liberar plano de montagem',
      date: '2026-07-21',
      responsible: 'Coordenação de Montagem',
      commissionSlug: 'infraestrutura',
    })));
    expect(await screen.findByText('Liberar plano de montagem')).toBeVisible();
    expect(screen.queryByTestId('subevent-composer')).not.toBeInTheDocument();
    expect(addBubble).toBeEnabled();
    expect(addBubble).toHaveFocus();
  });

  it('preserva novas conexões na fila quando a sincronização relacional está indisponível', async () => {
    const onRetry = vi.fn();
    render(
      <EventRelationshipWorkspace
        event={{
          ...baseEvent,
          subevents: [
            ...(baseEvent.subevents ?? []),
            {
              id: '33333333-3333-4333-8333-333333333333',
              title: 'Validar acesso de montagem',
              status: 'planned',
              storage: 'queued',
              syncState: 'pending',
              sortOrder: 2,
            },
          ],
        }}
        onBack={vi.fn()}
        onSaveEvent={vi.fn()}
        onCreateSubevent={vi.fn().mockResolvedValue('queued')}
        onUpdateSubevent={vi.fn()}
        onRemoveSubevent={vi.fn()}
        canManage
        canDeleteSubevents={false}
        relationshipsUnavailable
        pendingRelationshipCount={1}
        onRetryRelationships={onRetry}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 conexão aguarda sincronização');
    expect(screen.getByRole('button', { name: 'Adicionar subevento' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remover subevento Validar acesso de montagem' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remover subevento Publicar pauta final' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar subevento' }));
    expect(screen.getByTestId('subevent-composer')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});

describe('compatibilidade do modelo de relacionamentos', () => {
  const sourceEvent: SourceCronogramaEvent = {
    id: 'main-event',
    sourceKey: 'official-main-event',
    title: 'Reunião da Comissão Central',
    description: 'Versão consolidada.',
    category: 'Reuniões',
    eventType: 'reuniao',
    sourceYear: 2026,
    startDate: '2026-07-22',
    endDate: '2026-07-22',
    status: 'em_andamento',
    priority: 'alta',
    location: 'Parque de Exposições',
    time: null,
    commissionSlug: 'comissao-central',
    commissionName: 'Comissão Central',
    responsibleName: 'Coordenação Executiva',
    sourceSheet: 'Cronograma oficial 2026',
    sourceNote: null,
    isOfficialSeed: true,
    hasExactDate: true,
    linkedCommissions: [],
    subevents: [],
  };

  it('preserva o legado incorporado e nunca serializa relações da tabela filha no JSON do evento', () => {
    const eventWithPendingQueue: CronogramaEvent = {
      ...baseEvent,
      subevents: [
        ...(baseEvent.subevents ?? []),
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Rascunho pendente',
          storage: 'queued',
          syncState: 'pending',
        },
      ],
    };
    const updates = visualEventToSourceUpdates(eventWithPendingQueue, sourceEvent);
    const draft = visualEventToDraft(eventWithPendingQueue);

    expect(updates.subevents).toEqual([
      expect.objectContaining({
        id: 'embedded:main-event:0',
        title: 'Confirmar fornecedores',
        description: 'Validar disponibilidade, escopo e pontos de contato.',
        commissionSlug: 'logistica',
        commissionName: 'Logística',
        storage: 'embedded',
      }),
    ]);
    expect(updates.subevents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
    ]));
    expect(updates.subevents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333' }),
    ]));
    expect(draft.subevents).toHaveLength(1);
    expect(draft.subevents?.[0].id).toBe('embedded:main-event:0');
  });
});
