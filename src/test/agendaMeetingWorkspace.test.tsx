// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgendaMeetingWorkspace } from '@/components/cronograma-eventos/meeting-intelligence/AgendaMeetingWorkspace';
import { MeetingCaptureDock } from '@/components/cronograma-eventos/meeting-intelligence/MeetingCaptureDock';
import { MobileDialogFrame } from '@/components/cronograma-eventos/mobile/MobileDialogFrame';
import { MeetingCaptureProvider } from '@/features/agenda-meeting-intelligence/provider/MeetingCaptureProvider';
import type {
  AgendaMeetingCaptureController,
  AgendaMeetingSessionDetail,
  AgendaMeetingSessionSummary,
} from '@/features/agenda-meeting-intelligence/types';

const mocks = vi.hoisted(() => ({
  captureHook: vi.fn(),
  sessionsHook: vi.fn(),
  membersHook: vi.fn(),
  detailHook: vi.fn(),
  control: vi.fn(),
  exportArtifact: vi.fn(),
}));

vi.mock('@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingCapture', () => ({
  useAgendaMeetingCapture: mocks.captureHook,
}));
vi.mock('@/features/agenda-meeting-intelligence/provider/MeetingCaptureEngine', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    default: function Engine(props: {
      target: { eventId: string; orgId: string };
      pendingStart: { id: number; input: unknown; resolve: () => void; reject: (e: unknown) => void } | null;
      onPendingHandled: (id: number) => void;
      onController: (controller: AgendaMeetingCaptureController) => void;
    }) {
      const controller = mocks.captureHook({ eventId: props.target.eventId, orgId: props.target.orgId, persistedEvent: true }) as AgendaMeetingCaptureController;
      const handled = useRef<number | null>(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { props.onController(controller); }, [controller.state]);
      useEffect(() => {
        if (!props.pendingStart || handled.current === props.pendingStart.id) return;
        handled.current = props.pendingStart.id;
        props.onPendingHandled(props.pendingStart.id);
        controller.start(props.pendingStart.input as never).then(props.pendingStart.resolve, props.pendingStart.reject);
      });
      return null;
    },
  };
});
vi.mock('@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingSessions', () => ({
  agendaMeetingQueryKeys: { all: ['agenda-meeting-intelligence'], detail: () => ['agenda-meeting-intelligence', 'detail'] },
  useAgendaMeetingSessions: mocks.sessionsHook,
  useAgendaMeetingMemberOptions: mocks.membersHook,
  useAgendaMeetingSessionDetail: mocks.detailHook,
}));
vi.mock('@/features/agenda-meeting-intelligence/api/AgendaMeetingEdgeClient', () => ({
  AgendaMeetingEdgeClient: class AgendaMeetingEdgeClient {
    control = mocks.control;
    exportArtifact = mocks.exportArtifact;
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: '9dd0d8d4-cb4f-4c0a-bd5e-e900e6698955' } }) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ myRole: 'gestor' }) }));

const EVENT_A = '64ac2654-48cb-4bca-ab17-78367d8c41cb';
const EVENT_B = '7d1d0b8e-1111-4bca-ab17-78367d8c41cb';
const ORG_ID = 'ee4d6232-d169-4e39-b6a3-a3f061b61572';
const SESSION_ID = '2cba2ceb-5da4-43ff-ae29-f2249b1f1cd3';
const TRANSCRIPT_ID = 'bf33d84e-3042-45fb-aab4-a74b2254b98d';
const SEGMENT_A = '03692145-aafa-49fc-93ff-e69c08107fde';
const SEGMENT_B = '13692145-aafa-49fc-93ff-e69c08107fde';
const MINUTES_ID = 'c1111111-3042-45fb-aab4-a74b2254b98d';

/** A stateful fake controller: one instance per app, like the real provider engine. */
function createController() {
  let phase: AgendaMeetingCaptureController['state']['phase'] = 'idle';
  let duration = 0;
  const listeners = new Set<() => void>();
  const build = () => ({
        phase,
        sessionId: phase === 'idle' ? null : SESSION_ID,
        sessionVersion: 2,
        activeDurationMs: duration,
        startedAtIso: null,
        backend: 'audio_worklet_wav' as const,
        mimeType: 'audio/wav',
        selectedDeviceId: 'mic-1',
        interruption: null,
        backlog: { segments: 0, bytes: 0, durationMs: 0, isAtCapacity: false, limitedBy: null },
        segments: [],
        error: null,
  });
  let state = build();
  const notify = () => { state = build(); listeners.forEach((listener) => listener()); };
  const controller = {
    get state() { return state; },
    capabilities: { mediaRecorder: true, audioWorkletWav: true, scriptProcessorWav: true, encryptedIndexedDb: true, supportedMimeTypes: [] },
    mic: { devices: [], selectedDeviceId: 'mic-1', inputLevel: 0.3 },
    refreshDevices: vi.fn(async () => undefined),
    selectDevice: vi.fn(),
    start: vi.fn(async () => { phase = 'recording'; notify(); }),
    pause: vi.fn(async () => { phase = 'paused'; notify(); }),
    resume: vi.fn(async () => { phase = 'recording'; notify(); }),
    finish: vi.fn(async () => { phase = 'awaiting_transcripts'; notify(); }),
    cancel: vi.fn(async () => { phase = 'idle'; notify(); }),
    retrySegment: vi.fn(async () => undefined),
    purge: vi.fn(async () => { phase = 'idle'; notify(); }),
    purgeForLogout: vi.fn(async () => undefined),
    interrupt() { phase = 'capture_interrupted'; notify(); },
    advance(ms: number) { duration += ms; notify(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return controller;
}

let controller: ReturnType<typeof createController>;

const summary: AgendaMeetingSessionSummary = {
  id: SESSION_ID, orgId: ORG_ID, eventId: EVENT_A, state: 'review_required', captureState: 'ended', processingState: 'review_required',
  createdBy: '9dd0d8d4-cb4f-4c0a-bd5e-e900e6698955', createdAt: '2026-11-16T12:00:00.000Z', startedAt: '2026-11-16T12:00:05.000Z',
  endedAt: '2026-11-16T13:00:05.000Z', activeDurationMs: 3_600_000, transcriptCoverage: 'with_gaps', transcriptSegmentCount: 2,
  actionItemCount: 1, pendingActionItemCount: 1, version: 4, pipeline: 'audio_gemini_v1',
};

const detail: AgendaMeetingSessionDetail = {
  ...summary,
  eventSnapshot: { title: 'Conselho operacional', description: null, startsAt: null, endsAt: null, location: 'Casa Fenasoja', responsibleNames: [], commissionNames: [] },
  transcriptVersions: [{
    id: TRANSCRIPT_ID, version: 1, kind: 'canonical', coverage: 'with_gaps', language: 'pt-BR', sha256: 'a'.repeat(64), createdAt: '2026-11-16T13:01:00.000Z', createdBy: null,
    segments: [
      { id: SEGMENT_A, transcriptVersionId: TRANSCRIPT_ID, sequence: 0, kind: 'speech', captureStartMs: 0, captureEndMs: 30_000, text: 'Ficou decidido que a Fernanda envia a lista.', confidence: null, speakerLabel: null, sourceSegmentId: SEGMENT_A },
      { id: `${TRANSCRIPT_ID}:gap:1`, transcriptVersionId: TRANSCRIPT_ID, sequence: 1, kind: 'gap', captureStartMs: 30_000, captureEndMs: 60_000, text: '', confidence: null, speakerLabel: null, sourceSegmentId: null },
      { id: SEGMENT_B, transcriptVersionId: TRANSCRIPT_ID, sequence: 2, kind: 'speech', captureStartMs: 60_000, captureEndMs: 90_000, text: '', confidence: null, speakerLabel: null, sourceSegmentId: SEGMENT_B },
    ],
  }],
  minutesVersions: [{
    id: MINUTES_ID, version: 1, state: 'ai_draft', title: 'Relatório', executiveSummary: 'Resumo fiel.', minutesMarkdown: '# x',
    sourceTranscriptVersionId: TRANSCRIPT_ID, coverage: 'with_gaps', model: 'gpt-6.1-sol', promptVersion: 'v3', schemaVersion: 's3',
    createdAt: '2026-11-16T13:02:00.000Z', reviewedAt: null, reviewedBy: null, reportFormat: 'structured_v3', isPartial: true,
    report: {
      title: 'Reunião', executiveSummary: 'Lista de voos encaminhada; decoração pendente.',
      themes: [{ title: 'Decoração', discussion: 'Redução proposta.', arguments: [], divergences: ['Zélia discordou'], evidenceSegmentIds: [SEGMENT_A] }],
      decisions: [{ title: 'Lista de voos', detail: 'Fernanda envia.', evidenceSegmentIds: [SEGMENT_A] }],
      proposals: [], actionItems: [{ title: 'Enviar lista', description: 'Lista de voos', responsibleText: 'Fernanda', dueDateText: 'até sexta-feira', dueDate: '2026-11-20', evidenceSegmentIds: [SEGMENT_A] }],
      pendingItems: [], risks: [], openQuestions: [], nextSteps: [], nextMeetings: [], coverageNotes: [],
      coverage: { transcriptVersionId: TRANSCRIPT_ID, transcriptVersion: 1, status: 'with_gaps', missingSegmentCount: 1, segmentCount: 2 },
    },
  }],
  insights: [],
  actionItems: [],
  failedStage: null,
  errorCode: null,
  retryable: false,
  artifacts: [],
};

function Harness({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <MeetingCaptureProvider>
        {children}
        <MeetingCaptureDock />
      </MeetingCaptureProvider>
    </QueryClientProvider>
  );
}

function Workspace({ eventId, title }: { eventId: string | null; title: string }) {
  return (
    <AgendaMeetingWorkspace canDelete canRecord canReview eventId={eventId} eventTitle={title} orgId={ORG_ID} persistedEvent={Boolean(eventId)} />
  );
}

const pendingCoverage: NonNullable<AgendaMeetingSessionDetail['coverageStats']> = {
  expectedSegments: 2,
  receivedSegments: 2,
  transcribedSegments: 0,
  silentSegments: 0,
  pendingSegments: 2,
  failedSegments: 0,
  lostSegments: 0,
  audioBytes: 90_000,
  audioRetainedSegments: 2,
  transcribedDurationMs: 0,
};

function openMeetingResult(patch: Partial<AgendaMeetingSessionDetail>) {
  const result: AgendaMeetingSessionDetail = {
    ...detail,
    state: 'finalizing_transcript',
    processingState: 'finalizing_transcript',
    transcriptCoverage: 'pending',
    transcriptVersions: [],
    minutesVersions: [],
    closedSequence: 1,
    unresolvedSequences: [0, 1],
    coverageStats: pendingCoverage,
    ...patch,
  };
  mocks.sessionsHook.mockReturnValue({ data: [result], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
  mocks.detailHook.mockReturnValue({ data: result, isLoading: false, isError: false });
  render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
  fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
}

describe('Fenasoja Meeting — captura independente do painel', () => {
  beforeEach(() => {
    localStorage.clear();
    controller = createController();
    mocks.captureHook.mockReset();
    mocks.captureHook.mockImplementation(() => {
      const [, setTick] = useState(0);
      // Re-render the engine whenever the fake controller changes.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useStateSubscription(setTick);
      // Like the real hook, every render yields a new object with the current state.
      return { ...controller, state: controller.state };
    });
    mocks.sessionsHook.mockReturnValue({ data: [], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    mocks.membersHook.mockReturnValue({ data: [] });
    mocks.detailHook.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mocks.control.mockReset();
    mocks.exportArtifact.mockReset();
  });

  it('bloqueia eventos sem UUID persistido', () => {
    render(<Harness><Workspace eventId={null} title="Rascunho" /></Harness>);
    expect(screen.getByRole('button', { name: /Fenasoja Meeting/ })).toBeDisabled();
    expect(mocks.captureHook).not.toHaveBeenCalled();
  });

  it('exige confirmação de que os participantes foram informados', () => {
    render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
    const start = screen.getByRole('button', { name: /Iniciar gravação/ });
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(start).toBeEnabled();
  });

  it('fechar o painel e os detalhes não interrompe a gravação; reabrir mostra a mesma sessão', async () => {
    const view = render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar gravação/ }));
    await waitFor(() => expect(controller.start).toHaveBeenCalledOnce());
    await screen.findByRole('region', { name: 'Gravação da reunião' });
    act(() => controller.advance(30_000)); // fala A

    fireEvent.click(screen.getByRole('button', { name: /Fechar painel/ }));
    expect(screen.queryByRole('region', { name: 'Gravação da reunião' })).not.toBeInTheDocument();
    const dock = await screen.findByRole('region', { name: 'Reunião em gravação' });
    expect(within(dock).getByText('Reunião A')).toBeInTheDocument();

    // Close the event details entirely and use another event of the agenda.
    view.rerender(<Harness><Workspace eventId={EVENT_B} title="Reunião B" /></Harness>);
    act(() => controller.advance(30_000)); // fala B com o painel fechado
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
    expect(screen.getByText(/Há uma reunião em gravação/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar gravação/ })).not.toBeInTheDocument();
    expect(mocks.captureHook).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: EVENT_A }));

    view.rerender(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    const panel = await screen.findByRole('region', { name: 'Gravação da reunião' });
    expect(within(panel).getByText('00:01:00')).toBeInTheDocument();

    expect(controller.start).toHaveBeenCalledOnce();
    expect(controller.cancel).not.toHaveBeenCalled();
    expect(controller.pause).not.toHaveBeenCalled();
    expect(controller.finish).not.toHaveBeenCalled();
  });

  it('a barra compacta reabre o painel e pausar/retomar/finalizar são comandos distintos', async () => {
    render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar gravação/ }));
    await screen.findByRole('region', { name: 'Gravação da reunião' });
    fireEvent.click(screen.getByRole('button', { name: /Fechar painel/ }));
    const dock = await screen.findByRole('region', { name: 'Reunião em gravação' });
    fireEvent.click(within(dock).getByRole('button', { name: /Reabrir/ }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Pausar/ }));
    await waitFor(() => expect(controller.pause).toHaveBeenCalledOnce());
    fireEvent.click(await within(sheet).findByRole('button', { name: /Retomar/ }));
    await waitFor(() => expect(controller.resume).toHaveBeenCalledOnce());
    expect(controller.finish).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: /Finalizar reunião/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Finalizar reunião$/ }));
    await waitFor(() => expect(controller.finish).toHaveBeenCalledWith({ allowPartial: false }));
    expect(controller.cancel).not.toHaveBeenCalled();
  });

  it('abre a confirmação acima do evento móvel e finaliza uma gravação interrompida', async () => {
    const closeEvent = vi.fn();
    render(<Harness><MobileDialogFrame open title="Detalhes do evento" onRequestClose={closeEvent}>
      <Workspace eventId={EVENT_A} title="Reunião A" />
    </MobileDialogFrame></Harness>);
    const event = screen.getByRole('dialog', { name: 'Detalhes do evento' });
    fireEvent.click(within(event).getByRole('button', { name: /Fenasoja Meeting/ }));
    fireEvent.click(within(event).getByRole('checkbox'));
    fireEvent.click(within(event).getByRole('button', { name: /Iniciar gravação/ }));
    await within(event).findByRole('region', { name: 'Gravação da reunião' });
    act(() => controller.interrupt());

    fireEvent.click(within(event).getByRole('button', { name: 'Finalizar reunião' }));
    const confirmation = await screen.findByRole('alertdialog', { name: 'Finalizar a reunião?' });
    expect(confirmation).toHaveClass('agenda-meeting__confirmation');
    expect(document.querySelector('.agenda-meeting__confirmation-overlay')).toBeInTheDocument();
    expect(controller.finish).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Finalizar reunião' }));

    await waitFor(() => expect(controller.finish).toHaveBeenCalledExactlyOnceWith({ allowPartial: false }));
    expect(controller.cancel).not.toHaveBeenCalled();
    expect(closeEvent).not.toHaveBeenCalled();
  });

  it('mantém o áudio recebido na fila durante a transcrição', async () => {
    openMeetingResult({
      coverageStats: { ...pendingCoverage, transcribedSegments: 1, pendingSegments: 1 },
      unresolvedSequences: [1],
    });
    expect(await screen.findByText(/1 de 2 parte\(s\) de áudio transcritas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seguir com lacunas' })).not.toBeInTheDocument();
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it('oferece nova tentativa para áudio com falha recuperável', async () => {
    openMeetingResult({
      state: 'failed',
      errorCode: 'transcription_provider_network_error',
      retryableStage: 'transcription',
      coverageStats: { ...pendingCoverage, transcribedSegments: 1, pendingSegments: 0, failedSegments: 1 },
      unresolvedSequences: [1],
    });
    expect(await screen.findByRole('button', { name: 'Tentar transcrição novamente' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seguir com lacunas' })).not.toBeInTheDocument();
  });

  it('pede confirmação antes de consolidar fala transcrita com trechos indisponíveis', async () => {
    openMeetingResult({
      coverageStats: { ...pendingCoverage, receivedSegments: 1, transcribedSegments: 1, pendingSegments: 0, audioRetainedSegments: 1 },
      unresolvedSequences: [1],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Seguir com lacunas' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Seguir com lacunas?' });
    expect(within(dialog).getByText(/Os trechos indisponíveis ficarão sinalizados/)).toBeInTheDocument();
    expect(mocks.control).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.control).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action: 'accept_transcription_gaps', sessionId: SESSION_ID,
    })));
  });

  it.each(['analysis_transcript_has_no_speech', 'analysis_transcript_missing_audio'])('mostra áudio incompleto para reunião com lacunas (%s)', async (errorCode) => {
    openMeetingResult({
      state: 'transcript_ready_with_gaps',
      processingState: 'transcript_ready_with_gaps',
      transcriptCoverage: 'with_gaps',
      errorCode,
      coverageStats: { ...pendingCoverage, lostSegments: 2, pendingSegments: 0 },
    });
    expect(await screen.findByText('Áudio incompleto')).toBeInTheDocument();
    expect(screen.getByText(/Há trechos sem transcrição/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma fala identificada/)).not.toBeInTheDocument();
  });

  it('indica quando o áudio foi transcrito integralmente sem fala', async () => {
    openMeetingResult({
      state: 'failed',
      transcriptCoverage: 'complete',
      errorCode: 'analysis_transcript_has_no_speech',
      coverageStats: { ...pendingCoverage, transcribedSegments: 2, silentSegments: 2, pendingSegments: 0 },
      unresolvedSequences: [],
    });
    expect(await screen.findByText('Nenhuma fala identificada')).toBeInTheDocument();
    expect(screen.getByText(/A gravação foi transcrita/)).toBeInTheDocument();
  });

  it('mostra o relatório estruturado, a marca de parcial, lacunas, trechos sem fala e downloads', async () => {
    mocks.sessionsHook.mockReturnValue({ data: [summary], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    mocks.detailHook.mockReturnValue({ data: detail, isLoading: false, isError: false });
    mocks.exportArtifact.mockResolvedValue({ url: 'https://signed.example/file.pdf', fileName: 'relatorio.pdf', reused: false });
    render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));

    const report = await screen.findByRole('article', { name: 'Relatório da reunião' });
    expect(within(report).getByText(/Parcial · transcrição com lacunas/)).toBeInTheDocument();
    expect(within(report).getByText('Lista de voos encaminhada; decoração pendente.')).toBeInTheDocument();
    expect(within(report).getByText('Fernanda')).toBeInTheDocument();
    expect(within(report).getByText('20/11/2026')).toBeInTheDocument();
    expect(within(report).getByText(/GPT-6.1 Sol/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Baixar relatório em PDF/ }));
    await waitFor(() => expect(mocks.exportArtifact).toHaveBeenCalledWith(expect.objectContaining({ kind: 'report_pdf', versionId: MINUTES_ID, sessionId: SESSION_ID })));

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Transcrição' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Transcrição' }));
    expect(await screen.findByText(/trecho sem transcrição/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma fala identificada neste trecho/)).toBeInTheDocument();
  });

  it('excluir relatório pede confirmação com o alcance e não exclui a transcrição', async () => {
    mocks.sessionsHook.mockReturnValue({ data: [summary], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    mocks.detailHook.mockReturnValue({ data: detail, isLoading: false, isError: false });
    mocks.control.mockResolvedValue({});
    render(<Harness><Workspace eventId={EVENT_A} title="Reunião A" /></Harness>);
    fireEvent.click(screen.getByRole('button', { name: /Fenasoja Meeting/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Excluir relatório/ }));
    expect(await screen.findByText(/A transcrição continua disponível/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(mocks.control).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete_report', payload: { minutesVersionId: MINUTES_ID } })));
  });
});

function useStateSubscription(setTick: (updater: (value: number) => number) => void) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { useEffect } = require('react') as typeof import('react');
  useEffect(() => controller.subscribe(() => setTick((value) => value + 1)), [setTick]);
}
