// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgendaMeetingWorkspace } from '@/components/cronograma-eventos/meeting-intelligence/AgendaMeetingWorkspace';
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
}));

vi.mock('@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingCapture', () => ({
  useAgendaMeetingCapture: mocks.captureHook,
}));

vi.mock('@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingSessions', () => ({
  agendaMeetingQueryKeys: { all: ['agenda-meeting-intelligence'] },
  useAgendaMeetingSessions: mocks.sessionsHook,
  useAgendaMeetingMemberOptions: mocks.membersHook,
  useAgendaMeetingSessionDetail: mocks.detailHook,
}));

vi.mock('@/features/agenda-meeting-intelligence/api/AgendaMeetingEdgeClient', () => ({
  AgendaMeetingEdgeClient: class AgendaMeetingEdgeClient {
    control = mocks.control;
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '9dd0d8d4-cb4f-4c0a-bd5e-e900e6698955' } }),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => ({ myRole: 'gestor' }),
}));

const EVENT_ID = '64ac2654-48cb-4bca-ab17-78367d8c41cb';
const ORG_ID = 'ee4d6232-d169-4e39-b6a3-a3f061b61572';
const SESSION_ID = '2cba2ceb-5da4-43ff-ae29-f2249b1f1cd3';
const TRANSCRIPT_VERSION_ID = 'bf33d84e-3042-45fb-aab4-a74b2254b98d';
const TRANSCRIPT_SEGMENT_ID = '03692145-aafa-49fc-93ff-e69c08107fde';

function createCaptureController(
  phase: AgendaMeetingCaptureController['state']['phase'] = 'idle',
): AgendaMeetingCaptureController {
  return {
    state: {
      phase,
      sessionId: phase === 'idle' ? null : SESSION_ID,
      sessionVersion: phase === 'idle' ? null : 2,
      activeDurationMs: phase === 'idle' ? 0 : 93_000,
      startedAtIso: phase === 'idle' ? null : '2026-08-14T12:00:00.000Z',
      backend: phase === 'idle' ? null : 'media_recorder',
      mimeType: phase === 'idle' ? null : 'audio/webm;codecs=opus',
      selectedDeviceId: 'mic-1',
      interruption: null,
      backlog: {
        segments: phase === 'recording' ? 1 : 0,
        bytes: phase === 'recording' ? 24_000 : 0,
        durationMs: phase === 'recording' ? 30_000 : 0,
        isAtCapacity: false,
        limitedBy: null,
      },
      segments: [],
      error: null,
    },
    capabilities: {
      mediaRecorder: true,
      audioWorkletWav: true,
    nativeSpeechRecognition: true,
      encryptedIndexedDb: true,
      supportedMimeTypes: ['audio/webm;codecs=opus'],
    },
    mic: {
      devices: [{ deviceId: 'mic-1', groupId: 'group-1', kind: 'audioinput', label: 'Microfone da sala', toJSON: () => ({}) }],
      selectedDeviceId: 'mic-1',
      inputLevel: phase === 'recording' ? 0.42 : null,
    },
    refreshDevices: vi.fn().mockResolvedValue(undefined),
    selectDevice: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    retrySegment: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
    purgeForLogout: vi.fn().mockResolvedValue(undefined),
  };
}

const sessionSummary: AgendaMeetingSessionSummary = {
  id: SESSION_ID,
  orgId: ORG_ID,
  eventId: EVENT_ID,
  state: 'review_required',
  captureState: 'ended',
  processingState: 'review_required',
  createdBy: '9dd0d8d4-cb4f-4c0a-bd5e-e900e6698955',
  createdAt: '2026-08-14T12:00:00.000Z',
  startedAt: '2026-08-14T12:00:05.000Z',
  endedAt: '2026-08-14T13:00:05.000Z',
  activeDurationMs: 3_600_000,
  transcriptCoverage: 'with_gaps',
  transcriptSegmentCount: 2,
  actionItemCount: 1,
  pendingActionItemCount: 1,
  version: 4,
};

const sessionDetail: AgendaMeetingSessionDetail = {
  ...sessionSummary,
  eventSnapshot: {
    title: 'Conselho operacional',
    description: null,
    startsAt: '2026-08-14T12:00:00.000Z',
    endsAt: '2026-08-14T13:00:00.000Z',
    location: 'Sala do conselho',
    responsibleNames: ['Responsável real'],
    commissionNames: ['Comissão Central'],
  },
  transcriptVersions: [{
    id: TRANSCRIPT_VERSION_ID,
    version: 1,
    kind: 'canonical',
    coverage: 'with_gaps',
    language: 'pt-BR',
    sha256: 'a'.repeat(64),
    createdAt: '2026-08-14T13:00:10.000Z',
    createdBy: null,
    segments: [
      {
        id: TRANSCRIPT_SEGMENT_ID,
        transcriptVersionId: TRANSCRIPT_VERSION_ID,
        sequence: 0,
        kind: 'speech',
        captureStartMs: 0,
        captureEndMs: 30_000,
        text: 'A comissão aprovou a abertura do credenciamento.',
        confidence: 0.96,
        speakerLabel: null,
        sourceSegmentId: TRANSCRIPT_SEGMENT_ID,
      },
      {
        id: 'c0e81d7b-95fa-48ae-b8f1-bfe0e9c92222',
        transcriptVersionId: TRANSCRIPT_VERSION_ID,
        sequence: 1,
        kind: 'gap',
        captureStartMs: 30_000,
        captureEndMs: 60_000,
        text: '',
        confidence: null,
        speakerLabel: null,
        sourceSegmentId: null,
      },
    ],
  }],
  minutesVersions: [{
    id: '1298be0c-af0a-4236-ad6d-b2be38619f3f',
    version: 1,
    state: 'ai_draft',
    title: 'Ata — Credenciamento',
    executiveSummary: 'A comissão aprovou o credenciamento e definiu acompanhamento operacional.',
    minutesMarkdown: 'A comissão registrou a decisão e os próximos passos com evidências da transcrição.',
    sourceTranscriptVersionId: TRANSCRIPT_VERSION_ID,
    coverage: 'with_gaps',
    model: 'gpt-5.6-terra',
    promptVersion: 'agenda-v1',
    schemaVersion: '1',
    createdAt: '2026-08-14T13:01:00.000Z',
    reviewedAt: null,
    reviewedBy: null,
  }],
  insights: [{
    id: '6f0a88a3-d755-4ec5-a356-ad5f92d97572',
    kind: 'decision',
    title: 'Abrir credenciamento',
    detail: 'A abertura foi aprovada pela comissão.',
    evidence: [{ transcriptSegmentId: TRANSCRIPT_SEGMENT_ID, quoteStartMs: 0, quoteEndMs: 20_000 }],
  }],
  actionItems: [{
    id: 'f3dc511f-32d1-452d-993c-d38317d3bdfc',
    title: 'Publicar o formulário',
    description: 'Disponibilizar a versão revisada.',
    status: 'proposed',
    responsibleText: 'Equipe de credenciamento',
    suggestedMemberId: null,
    confirmedMemberId: null,
    responsibleResolution: 'unresolved',
    dueDateText: 'na próxima semana',
    dueDate: null,
    dueDateConfirmed: false,
    evidence: [{ transcriptSegmentId: TRANSCRIPT_SEGMENT_ID, quoteStartMs: 5_000, quoteEndMs: 25_000 }],
  }],
  failedStage: null,
  errorCode: null,
  retryable: false,
};

function renderWorkspace(props: Partial<React.ComponentProps<typeof AgendaMeetingWorkspace>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgendaMeetingWorkspace
        canDelete
        canRecord
        canReview
        eventId={EVENT_ID}
        eventTitle="Conselho operacional"
        orgId={ORG_ID}
        persistedEvent
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('AgendaMeetingWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureHook.mockReturnValue(createCaptureController());
    mocks.sessionsHook.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    mocks.membersHook.mockReturnValue({ data: [],isLoading: false,isError: false });
    mocks.detailHook.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mocks.control.mockResolvedValue({});
  });

  it('bloqueia seed/offline sem fabricar um UUID ou montar captura', () => {
    renderWorkspace({ eventId: null, persistedEvent: false });

    expect(screen.getByRole('button', { name: /ata vinculada/i })).toBeDisabled();
    expect(screen.getByText(/nenhuma sessão será criada/i)).toBeInTheDocument();
    expect(mocks.captureHook).not.toHaveBeenCalled();
  });

  it('exige consentimento informado antes de iniciar a sessão canônica', async () => {
    const controller = createCaptureController();
    mocks.captureHook.mockReturnValue(controller);
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /ata vinculada/i }));
    const startButton = screen.getByRole('button', { name: /iniciar reunião/i });
    expect(startButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /todas as pessoas foram informadas/i }));
    fireEvent.click(startButton);

    await waitFor(() => expect(controller.start).toHaveBeenCalledWith({
      consentVersion: 'fenasoja-agenda-meeting-consent-v1',
      participantsInformed: true,
      deviceId: 'mic-1',
    }));
  });

  it('expõe estado inequívoco, telemetria real e proteção de captura ativa', async () => {
    const controller = createCaptureController('recording');
    const onActiveCaptureChange = vi.fn();
    mocks.captureHook.mockReturnValue(controller);
    renderWorkspace({ onActiveCaptureChange });

    fireEvent.click(screen.getByRole('button', { name: /ata vinculada/i }));

    expect(screen.getByText('Gravando')).toBeInTheDocument();
    expect(screen.getByText('00:01:33')).toBeInTheDocument();
    expect(screen.getByText('Microfone da sala')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '42');
    await waitFor(() => expect(onActiveCaptureChange).toHaveBeenLastCalledWith(true, controller.cancel));

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }));
    expect(controller.pause).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /ata vinculada/i }));
    expect(screen.getByText('Gravando')).toBeInTheDocument();
  });

  it('renderiza conhecimento tipado, lacunas e ações sem superfície de áudio histórico', async () => {
    mocks.sessionsHook.mockReturnValue({
      data: [sessionSummary],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    mocks.detailHook.mockReturnValue({ data: sessionDetail, isLoading: false, isError: false });
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /ata vinculada/i }));
    expect(await screen.findByText(/resumo executivo/i)).toBeInTheDocument();
    expect(screen.getByText(/modelo efetivo: gpt-5.6-terra/i)).toBeInTheDocument();

    const decisionsTab = screen.getByRole('tab', { name: 'Decisões' });
    fireEvent.mouseDown(decisionsTab, { button: 0, ctrlKey: false });
    expect(await screen.findByText('Abrir credenciamento')).toBeInTheDocument();

    const actionsTab = screen.getByRole('tab', { name: 'Ações' });
    fireEvent.mouseDown(actionsTab, { button: 0, ctrlKey: false });
    expect(await screen.findByText('Publicar o formulário')).toBeInTheDocument();
    expect(screen.getByText(/aguardando confirmação humana/i)).toBeInTheDocument();

    const transcriptTab = screen.getByRole('tab', { name: 'Transcrição' });
    fireEvent.mouseDown(transcriptTab, { button: 0, ctrlKey: false });
    expect(await screen.findByText(/nenhuma fala foi reconstruída/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Áudio$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download|retranscrever/i })).not.toBeInTheDocument();
  });
});
