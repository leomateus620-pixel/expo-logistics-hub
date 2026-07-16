// @vitest-environment jsdom

import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import { MobileCreateEventScreen } from '@/components/cronograma-eventos/mobile/MobileCreateEventScreen';
import { MobileEventScreen } from '@/components/cronograma-eventos/mobile/MobileEventScreen';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

const HISTORY_KEY = '__cronogramaMobileOverlay';

const baseEvent: CronogramaEvent = {
  id: 'mobile-event-1',
  sourceKey: 'mobile-event-source-1',
  title: 'Reunião da Comissão Central',
  summary: 'Definição institucional da programação e dos responsáveis.',
  date: '2026-07-15',
  year: 2026,
  category: 'governanca',
  status: 'planned',
  priority: 'high',
  kind: 'meeting',
  owner: 'Comissão Central',
  commission: 'Comissão Central',
  location: 'Parque de Exposições',
  isOfficial: true,
  sourceSheet: 'Cronograma oficial 2026',
  subevents: [
    {
      title: 'Confirmar participantes',
      date: '2026-07-14',
      owner: 'Secretaria',
      status: 'planned',
    },
  ],
};

class VisualViewportStub extends EventTarget {
  height = 844;
  width = 390;
  offsetTop = 0;
  offsetLeft = 0;
  pageTop = 0;
  pageLeft = 0;
  scale = 1;
}

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function installAnimationFrame() {
  let frame = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frame += 1;
    callback(performance.now());
    return frame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

function installHistoryBackBehavior() {
  return vi.spyOn(window.history, 'back').mockImplementation(() => {
    const nextState = { ...(window.history.state ?? {}) };
    delete nextState[HISTORY_KEY];
    window.history.replaceState(nextState, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
  });
}

function EventScreenHarness({
  initialEvent = baseEvent,
  onSave = vi.fn().mockResolvedValue(undefined),
  onEditWorkspace,
  startInEdit = false,
  sourceUnavailable = false,
}: {
  initialEvent?: CronogramaEvent;
  onSave?: (event: CronogramaEvent) => Promise<void> | void;
  onEditWorkspace?: (event: CronogramaEvent) => void;
  startInEdit?: boolean;
  sourceUnavailable?: boolean;
}) {
  const [event, setEvent] = useState(initialEvent);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setEvent(initialEvent);
  }, [initialEvent]);

  const handleSave = async (nextEvent: CronogramaEvent) => {
    await onSave(nextEvent);
    setEvent(nextEvent);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir evento</button>
      <div data-testid="timeline-mobile">Linha do tempo preservada</div>
      <MobileEventScreen
        event={event}
        open={open}
        onOpenChange={setOpen}
        onSave={handleSave}
        onEditWorkspace={onEditWorkspace}
        startInEdit={startInEdit}
        sourceUnavailable={sourceUnavailable}
        canManage
      />
    </>
  );
}

function CreateScreenHarness({
  onSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  onSubmit?: (event: CronogramaEvent) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir cadastro</button>
      <MobileCreateEventScreen open={open} onOpenChange={setOpen} onSubmit={onSubmit} />
    </>
  );
}

async function expectMobileOverlayRemoved() {
  await waitFor(() => {
    expect(document.querySelector('.cronograma-mobile-dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.cronograma-mobile-dialog-overlay')).not.toBeInTheDocument();
    expect(document.querySelector('.cronograma-mobile-confirm-dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.cronograma-mobile-confirm-overlay')).not.toBeInTheDocument();
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/cronograma-eventos');
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: 844,
  });
  installAnimationFrame();
  installHistoryBackBehavior();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/cronograma-eventos');
  document.body.removeAttribute('data-scroll-locked');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
});

describe('overlays móveis do cronograma', () => {
  it('renderiza o detalhe em tela cheia sem montar o drawer desktop', async () => {
    render(<EventScreenHarness />);

    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    expect(dialog).toHaveClass('cronograma-mobile-dialog');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(document.querySelector('.cronograma-mobile-dialog-overlay')).toBeInTheDocument();
    expect(document.querySelector('.cronograma-drawer')).not.toBeInTheDocument();
    expect(document.querySelector('.cronograma-drawer-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-mobile')).toBeInTheDocument();
    await waitFor(() => expect(document.body).toHaveAttribute('data-scroll-locked'));
  });

  it.each([
    ['botão de fechar', () => fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes do evento' }))],
    ['tecla Escape', () => fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })],
  ])('fecha pelo %s e remove portal e scroll lock', async (_label, close) => {
    render(<EventScreenHarness />);
    await screen.findByTestId('cronograma-mobile-event-dialog');

    close();

    await expectMobileOverlayRemoved();
    expect(screen.getByTestId('timeline-mobile')).toBeInTheDocument();
  });

  it('deduplica toques rápidos em fechar antes do popstate', async () => {
    const historyBack = vi.mocked(window.history.back);
    historyBack.mockImplementation(() => undefined);
    render(<EventScreenHarness />);
    await screen.findByTestId('cronograma-mobile-event-dialog');

    const close = screen.getByRole('button', { name: 'Fechar detalhes do evento' });
    fireEvent.click(close);
    fireEvent.click(close);

    expect(historyBack).toHaveBeenCalledOnce();

    const nextState = { ...(window.history.state ?? {}) };
    delete nextState[HISTORY_KEY];
    window.history.replaceState(nextState, '', window.location.href);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: nextState })));
    await expectMobileOverlayRemoved();
  });

  it('fecha pelo histórico do navegador preservando a Timeline', async () => {
    const historyBack = vi.mocked(window.history.back);
    render(<EventScreenHarness />);
    await screen.findByTestId('cronograma-mobile-event-dialog');
    expect(window.history.state).toHaveProperty(HISTORY_KEY);

    act(() => window.history.back());

    await expectMobileOverlayRemoved();
    expect(historyBack).toHaveBeenCalledOnce();
    expect(screen.getByTestId('timeline-mobile')).toHaveTextContent('Linha do tempo preservada');
  });

  it('fecha a camada móvel pelo histórico antes de abrir o workspace conectado', async () => {
    const onEditWorkspace = vi.fn();
    const historyBack = vi.mocked(window.history.back);
    render(<EventScreenHarness onEditWorkspace={onEditWorkspace} />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Editar' }));

    await expectMobileOverlayRemoved();
    await waitFor(() => expect(onEditWorkspace).toHaveBeenCalledWith(baseEvent));
    expect(historyBack).toHaveBeenCalledOnce();
    expect(window.history.state).not.toHaveProperty(HISTORY_KEY);
  });

  it('suporta ciclos repetidos de abrir e fechar sem overlays residuais', async () => {
    render(<EventScreenHarness />);
    await screen.findByTestId('cronograma-mobile-event-dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes do evento' }));
    await expectMobileOverlayRemoved();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir evento' }));
    await screen.findByTestId('cronograma-mobile-event-dialog');
    expect(document.querySelectorAll('.cronograma-mobile-dialog')).toHaveLength(1);
    expect(document.querySelectorAll('.cronograma-mobile-dialog-overlay')).toHaveLength(1);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await expectMobileOverlayRemoved();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir evento' }));
    await screen.findByTestId('cronograma-mobile-event-dialog');
    act(() => window.history.back());
    await expectMobileOverlayRemoved();
  });

  it('confirma edição suja, preserva o formulário ao cancelar e fecha ao descartar', async () => {
    render(<EventScreenHarness />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar/i }));

    const title = await screen.findByRole('textbox', { name: 'Título' });
    fireEvent.change(title, { target: { value: 'Reunião atualizada no celular' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes do evento' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar alterações?');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Reunião atualizada no celular');
    expect(screen.getByTestId('cronograma-mobile-event-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes do evento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar e fechar' }));

    await expectMobileOverlayRemoved();
  });

  it('preserva os campos e mostra alerta quando o salvamento falha', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Falha simulada ao salvar'));
    render(<EventScreenHarness onSave={onSave} />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar/i }));

    const title = await screen.findByRole('textbox', { name: 'Título' });
    fireEvent.change(title, { target: { value: 'Título preservado após falha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.getAllByText('Falha simulada ao salvar').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título preservado após falha');
    expect(screen.getByTestId('cronograma-mobile-event-dialog')).toBeInTheDocument();
  });

  it('bloqueia fechar e voltar enquanto o salvamento está pendente', async () => {
    let resolveSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const onSave = vi.fn(() => pendingSave);

    render(<EventScreenHarness onSave={onSave} />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: 'Evento sendo salvo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Fechar detalhes do evento' })).toBeDisabled();

    act(() => window.history.back());

    expect(screen.getByTestId('cronograma-mobile-event-dialog')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await act(async () => {
      resolveSave?.();
      await pendingSave;
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fechar detalhes do evento' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    });
  });

  it('fecha pela pilha de histórico quando a fonte desaparece e protege um rascunho sujo', async () => {
    const historyBack = vi.mocked(window.history.back);
    const { rerender } = render(<EventScreenHarness />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: 'Rascunho preservado sem fonte' },
    });

    rerender(<EventScreenHarness sourceUnavailable />);

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar alterações?');
    const hiddenEventDialog = screen.getByTestId('cronograma-mobile-event-dialog');
    expect(within(hiddenEventDialog).getByDisplayValue('Rascunho preservado sem fonte')).toBeInTheDocument();
    expect(hiddenEventDialog.querySelector('button[type="submit"]')).toBeDisabled();
    expect(historyBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar e fechar' }));
    await expectMobileOverlayRemoved();
    expect(historyBack).toHaveBeenCalledOnce();
    expect(window.history.state).not.toHaveProperty(HISTORY_KEY);
  });

  it('mantém edição e rascunho quando o seed recebe o UUID do Supabase', async () => {
    const { rerender } = render(<EventScreenHarness />);
    const dialog = await screen.findByTestId('cronograma-mobile-event-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Título' }), {
      target: { value: 'Rascunho durante reconciliação' },
    });

    rerender(
      <EventScreenHarness
        initialEvent={{ ...baseEvent, id: 'uuid-supabase', title: 'Título recebido da base' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Rascunho durante reconciliação');
    });
    expect(screen.getByText('Editando')).toBeInTheDocument();
  });

  it('conclui e reabre um subevento pelo controle móvel', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventScreenHarness onSave={onSave} />);
    await screen.findByTestId('cronograma-mobile-event-dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Concluir subevento Confirmar participantes' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          subevents: [expect.objectContaining({ status: 'completed' })],
        }),
      );
    });

    const reopen = await screen.findByRole('button', { name: 'Reabrir subevento Confirmar participantes' });
    fireEvent.click(reopen);
    await waitFor(() => {
      expect(onSave).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          subevents: [expect.objectContaining({ status: 'planned' })],
        }),
      );
    });
  });
});

describe('formulário e criação móvel', () => {
  it('incorpora refetch quando limpo e preserva o rascunho quando já está sujo', async () => {
    const onDirtyChange = vi.fn();
    const commonProps = {
      presentation: 'mobile' as const,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onDirtyChange,
    };
    const { rerender } = render(<EventForm {...commonProps} event={baseEvent} />);

    rerender(<EventForm {...commonProps} event={{ ...baseEvent, title: 'Atualização recebida online' }} />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Atualização recebida online');
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Rascunho local preservado' },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    rerender(
      <EventForm
        {...commonProps}
        event={{ ...baseEvent, id: 'uuid-recebido-do-supabase', title: 'Outro refetch online' }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Rascunho local preservado');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('valida título obrigatório e ordem dos horários antes de enviar', async () => {
    const onSubmit = vi.fn();
    render(
      <EventForm
        presentation="mobile"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Informe um título para identificar o evento.')).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), { target: { value: 'Evento válido' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('O horário final deve ser posterior ao horário inicial.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Fim')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Evento válido',
      startTime: '10:00',
      endTime: '10:30',
    }));
  });

  it('confirma descarte do cadastro sujo e preserva os dados ao cancelar', async () => {
    render(<CreateScreenHarness />);
    await screen.findByTestId('cronograma-mobile-create-dialog');
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), { target: { value: 'Novo evento em elaboração' } });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar criação de evento' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar novo evento?');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Novo evento em elaboração');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar criação de evento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar cadastro' }));
    await expectMobileOverlayRemoved();
  });

  it('fecha o cadastro pelo histórico após criar com sucesso', async () => {
    const historyBack = vi.mocked(window.history.back);
    const onSubmit = vi.fn().mockImplementation(async () => {
      window.history.replaceState(
        { usr: null, key: 'router-replace', idx: 0 },
        '',
        '/cronograma-eventos?timelineYear=2027&timelineMonth=2027-03',
      );
    });
    render(<CreateScreenHarness onSubmit={onSubmit} />);
    await screen.findByTestId('cronograma-mobile-create-dialog');

    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Novo evento confirmado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    await expectMobileOverlayRemoved();
    expect(historyBack).toHaveBeenCalledOnce();
    expect(window.history.state).not.toHaveProperty(HISTORY_KEY);
  });
});

describe('viewport móvel', () => {
  it('acompanha visualViewport e remove os listeners ao desmontar o diálogo', async () => {
    const viewport = new VisualViewportStub();
    viewport.height = 500;
    viewport.offsetTop = 24;
    const addEventListener = vi.spyOn(viewport, 'addEventListener');
    const removeEventListener = vi.spyOn(viewport, 'removeEventListener');
    vi.stubGlobal('visualViewport', viewport as unknown as VisualViewport);

    const { unmount } = render(<CreateScreenHarness />);
    const dialog = await screen.findByTestId('cronograma-mobile-create-dialog');

    expect(dialog).toHaveStyle({
      '--cronograma-mobile-viewport-height': '500px',
      '--cronograma-mobile-viewport-offset': '24px',
    });
    expect(dialog).toHaveAttribute('data-keyboard-open', 'true');
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));

    viewport.height = 820;
    viewport.offsetTop = 0;
    act(() => viewport.dispatchEvent(new Event('resize')));

    await waitFor(() => {
      expect(dialog).toHaveStyle({
        '--cronograma-mobile-viewport-height': '820px',
        '--cronograma-mobile-viewport-offset': '0px',
      });
      expect(dialog).not.toHaveAttribute('data-keyboard-open');
    });

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
