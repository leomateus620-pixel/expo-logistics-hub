import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Clock3,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgendaMeetingEdgeClient } from '@/features/agenda-meeting-intelligence/api/AgendaMeetingEdgeClient';
import { createMeetingMutationId } from '@/features/agenda-meeting-intelligence/capture/identity';
import { useAgendaMeetingCapture } from '@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingCapture';
import {
  agendaMeetingQueryKeys,
  useAgendaMeetingMemberOptions,
  useAgendaMeetingSessionDetail,
  useAgendaMeetingSessions,
} from '@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingSessions';
import type {
  AgendaMeetingActionItem,
  AgendaMeetingCapturePhase,
  AgendaMeetingInsight,
  AgendaMeetingJson,
  AgendaMeetingMemberOption,
  AgendaMeetingSessionDetail,
  AgendaMeetingSessionSummary,
  AgendaMeetingTranscriptSegment,
  AgendaMeetingUpdateActionInput,
  AgendaMeetingWorkspaceProps,
} from '@/features/agenda-meeting-intelligence/types';
import { AGENDA_MEETING_MAX_ACTIVE_DURATION_MS } from '@/features/agenda-meeting-intelligence/types';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { cn } from '@/lib/utils';

import { MeetingIntelligenceMark } from './MeetingIntelligenceMark';

const CONSENT_VERSION = 'fenasoja-agenda-meeting-consent-v1';

const GUARDED_CAPTURE_PHASES = new Set<AgendaMeetingCapturePhase>([
  'requesting_permission',
  'starting',
  'recording',
  'paused',
  'backpressure_paused',
  'capture_interrupted',
  'recoverable_error',
]);

const CAPTURE_PHASE_LABELS: Record<AgendaMeetingCapturePhase, string> = {
  idle: 'Pronta para iniciar',
  requesting_permission: 'Solicitando microfone',
  starting: 'Iniciando captura',
  recording: 'Gravando',
  paused: 'Pausada',
  backpressure_paused: 'Pausada por segurança',
  finalizing: 'Finalizando captura',
  awaiting_transcripts: 'Confirmando transcrição',
  analysis_queued: 'Análise na fila',
  review_required: 'Revisão necessária',
  completed: 'Concluída',
  capture_interrupted: 'Captura interrompida',
  recoverable_error: 'Ação necessária',
  fatal_error: 'Falha terminal',
};

const SESSION_STATE_LABELS: Record<AgendaMeetingSessionSummary['state'], string> = {
  created: 'Criada',
  recording: 'Gravando',
  paused: 'Pausada',
  capture_interrupted: 'Interrompida',
  finalizing_transcript: 'Transcrevendo',
  transcript_ready: 'Transcrição pronta',
  transcript_ready_with_gaps: 'Pronta com lacunas',
  analysis_queued: 'Análise na fila',
  analyzing: 'Analisando',
  review_required: 'Revisão necessária',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  failed: 'Falhou',
  deleted: 'Excluída',
};

type ConfirmIntent = 'cancel-capture' | 'delete-session' | 'submit-revision' | 'analyze-partial' | null;
type DetailTab = 'summary' | 'decisions' | 'actions' | 'transcript';

interface WorkspaceProps extends AgendaMeetingWorkspaceProps {
  className?: string;
}

function formatDuration(milliseconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatShortDuration(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const seconds = Math.floor((Math.max(0, milliseconds) % 60_000) / 1_000);
  return minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Ainda não finalizada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatTranscriptTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function errorMessage(code: string | undefined): string {
  switch (code) {
    case 'microphone_permission_denied':
    case 'NotAllowedError':
      return 'O acesso ao microfone foi negado. Libere a permissão do navegador para continuar.';
    case 'capture_backend_unavailable':
      return 'Este navegador não oferece uma rota de captura validada para a reunião.';
    case 'speech_recognition_unavailable':
      return 'Este navegador não possui reconhecimento de fala nativo. Use o Google Chrome ou o Microsoft Edge para gravar a reunião.';

    case 'backlog_capacity_reached':
      return 'A captura foi pausada para proteger os segmentos ainda não confirmados.';
    case 'session_expired':
      return 'Sua sessão expirou. Entre novamente antes de continuar.';
    case 'network_error':
      return 'Sem conexão com o serviço. Os segmentos pendentes permanecem no spool protegido.';
    default:
      return 'Não foi possível concluir esta etapa. Nenhum conteúdo foi inventado ou descartado silenciosamente.';
  }
}

function evidenceLabel(count: number): string {
  if (count === 1) return '1 trecho de origem';
  return `${count} trechos de origem`;
}

function isProcessingSession(session: AgendaMeetingSessionSummary): boolean {
  return [
    'recording',
    'paused',
    'capture_interrupted',
    'finalizing_transcript',
    'analysis_queued',
    'analyzing',
  ].includes(session.state);
}

function SessionHistory({
  sessions,
  selectedId,
  onSelect,
  loading,
}: {
  sessions: AgendaMeetingSessionSummary[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="agenda-meeting__empty" aria-busy="true">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando histórico seguro…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="agenda-meeting__empty">
        Nenhuma sessão registrada para este evento. A ativação sempre cria uma sessão vinculada ao UUID canônico da Agenda.
      </div>
    );
  }

  return (
    <div className="agenda-meeting__sessions" aria-label="Histórico de reuniões">
      {sessions.map((session, index) => (
        <button
          className="agenda-meeting__session"
          data-selected={selectedId === session.id}
          key={session.id}
          onClick={() => onSelect(session.id)}
          type="button"
        >
          <span>
            <span className="agenda-meeting__session-title">Reunião {sessions.length - index}</span>
            <span className="agenda-meeting__session-meta">
              {formatDateTime(session.startedAt ?? session.createdAt)} · {formatShortDuration(session.activeDurationMs)}
            </span>
          </span>
          <span className="agenda-meeting__status" data-state={isProcessingSession(session) ? 'recording' : 'ready'}>
            {SESSION_STATE_LABELS[session.state]}
          </span>
        </button>
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: AgendaMeetingInsight }) {
  return (
    <article className="agenda-meeting__content-card">
      <h4>{insight.title}</h4>
      <p>{insight.detail}</p>
      <span className="agenda-meeting__evidence">{evidenceLabel(insight.evidence.length)}</span>
    </article>
  );
}

function EmptyPanel({ children }: { children: string }) {
  return <div className="agenda-meeting__empty">{children}</div>;
}

function TranscriptRow({
  segment,
  canEdit,
  editedText,
  onTextChange,
}: {
  segment: AgendaMeetingTranscriptSegment;
  canEdit: boolean;
  editedText: string;
  onTextChange: (value: string) => void;
}) {
  const isGap = segment.kind === 'gap';
  return (
    <div className="agenda-meeting__transcript-row" data-kind={segment.kind}>
      <span className="agenda-meeting__transcript-time">{formatTranscriptTime(segment.captureStartMs)}</span>
      {isGap ? (
        <p className="agenda-meeting__transcript-text">
          Lacuna registrada de {formatTranscriptTime(segment.captureStartMs)} a {formatTranscriptTime(segment.captureEndMs)}. Nenhuma fala foi reconstruída.
        </p>
      ) : canEdit ? (
        <textarea
          aria-label={`Trecho em ${formatTranscriptTime(segment.captureStartMs)}`}
          className="agenda-meeting__transcript-editor"
          onChange={(event) => onTextChange(event.target.value)}
          rows={Math.max(2, Math.ceil(editedText.length / 64))}
          value={editedText}
        />
      ) : (
        <p className="agenda-meeting__transcript-text">{segment.text}</p>
      )}
    </div>
  );
}

function ActionCard({
  action,
  members,
  canReview,
  busy,
  onUpdate,
}: {
  action: AgendaMeetingActionItem;
  members: AgendaMeetingMemberOption[];
  canReview: boolean;
  busy: boolean;
  onUpdate: (update: AgendaMeetingUpdateActionInput) => void;
}) {
  const [dueDate, setDueDate] = useState(action.dueDate ?? '');
  useEffect(() => setDueDate(action.dueDate ?? ''), [action.dueDate]);
  const statusLabel: Record<AgendaMeetingActionItem['status'], string> = {
    proposed: 'Proposta',
    confirmed: 'Confirmada',
    in_progress: 'Em andamento',
    completed: 'Concluída',
    dismissed: 'Descartada',
  };
  return (
    <article className="agenda-meeting__content-card agenda-meeting__action-card">
      <div className="agenda-meeting__section-heading">
        <h4>{action.title}</h4>
        <span className="agenda-meeting__status">{statusLabel[action.status]}</span>
      </div>
      {action.description && <p>{action.description}</p>}
      <dl className="agenda-meeting__action-meta">
        <div>
          <dt>Responsável mencionado</dt>
          <dd>{action.responsibleText || 'Não identificado na reunião'}</dd>
        </div>
        <div>
          <dt>Vínculo confirmado</dt>
          <dd>{action.responsibleResolution === 'confirmed' ? 'Confirmado por uma pessoa' : 'Aguardando confirmação humana'}</dd>
        </div>
        <div>
          <dt>Prazo</dt>
          <dd>{action.dueDateConfirmed && action.dueDate ? action.dueDate : action.dueDateText || 'Não definido'}</dd>
        </div>
      </dl>
      <span className="agenda-meeting__evidence">{evidenceLabel(action.evidence.length)}</span>
      {canReview && action.status !== 'dismissed' && (
        <div className="agenda-meeting__action-review">
          <label className="agenda-meeting__device-field">
            <span>Responsável confirmado</span>
            <select
              disabled={busy}
              onChange={(event) => onUpdate({
                actionId: action.id,
                confirmedUserId: event.target.value || null,
                status: event.target.value ? 'confirmed' : 'proposed',
              })}
              value={action.confirmedMemberId ?? ''}
            >
              <option value="">Aguardando definição</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}{member.userId === action.suggestedMemberId ? ' · sugestão única' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="agenda-meeting__device-field">
            <span>Prazo confirmado</span>
            <span className="agenda-meeting__date-editor">
              <input disabled={busy} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
              <button
                className="agenda-meeting__button agenda-meeting__button--compact"
                disabled={busy || !dueDate || (action.dueDateConfirmed && action.dueDate === dueDate)}
                onClick={() => onUpdate({ actionId: action.id, dueDate })}
                type="button"
              >
                Confirmar prazo
              </button>
            </span>
          </label>
          <button
            className="agenda-meeting__button agenda-meeting__button--compact"
            disabled={busy}
            onClick={() => onUpdate({
              actionId: action.id,
              status: action.status === 'completed' ? 'confirmed' : 'completed',
            })}
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : action.status === 'completed' ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {action.status === 'completed' ? 'Reabrir ação' : 'Marcar concluída'}
          </button>
        </div>
      )}
    </article>
  );
}

function SessionDetail({
  detail,
  canReview,
  canDelete,
  busyKey,
  editingTranscript,
  editedSegments,
  onEditTranscript,
  onSegmentChange,
  onRequestRevision,
  onReviewMinutes,
  onRetryAnalysis,
  onConfirmPartialAnalysis,
  onDelete,
  onActionUpdate,
  members,
}: {
  detail: AgendaMeetingSessionDetail;
  canReview: boolean;
  canDelete: boolean;
  busyKey: string | null;
  editingTranscript: boolean;
  editedSegments: Record<string, string>;
  onEditTranscript: (editing: boolean) => void;
  onSegmentChange: (segmentId: string, value: string) => void;
  onRequestRevision: () => void;
  onReviewMinutes: (minutesVersionId: string) => void;
  onRetryAnalysis: () => void;
  onConfirmPartialAnalysis: () => void;
  onDelete: () => void;
  onActionUpdate: (update: AgendaMeetingUpdateActionInput) => void;
  members: AgendaMeetingMemberOption[];
}) {
  const [tab, setTab] = useState<DetailTab>('summary');
  const [pendingOnly, setPendingOnly] = useState(false);
  const latestTranscript = detail.transcriptVersions[detail.transcriptVersions.length - 1] ?? null;
  const latestMinutes = detail.minutesVersions[detail.minutesVersions.length - 1] ?? null;
  const decisions = detail.insights.filter((item) => item.kind === 'decision');
  const pendingItems = detail.insights.filter((item) => item.kind === 'pending');
  const risks = detail.insights.filter((item) => item.kind === 'risk');
  const visibleActions = pendingOnly
    ? detail.actionItems.filter((item) => ['proposed', 'confirmed', 'in_progress'].includes(item.status))
    : detail.actionItems;

  return (
    <section className="agenda-meeting__detail" aria-label="Conhecimento da reunião">
      <div className="agenda-meeting__status-row">
        <span className="agenda-meeting__status" data-state={isProcessingSession(detail) ? 'recording' : 'ready'}>
          {SESSION_STATE_LABELS[detail.state]}
        </span>
        <span className="agenda-meeting__session-meta">Cobertura: {detail.transcriptCoverage === 'with_gaps' ? 'com lacunas' : detail.transcriptCoverage === 'complete' ? 'completa' : 'pendente'}</span>
      </div>

      {detail.transcriptCoverage === 'with_gaps' && (
        <div className="agenda-meeting__notice" data-tone="gold">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Esta versão contém lacunas explícitas. A análise permanece identificada como incompleta até revisão humana.
          {!latestMinutes && canReview && (
            <button className="agenda-meeting__button agenda-meeting__button--compact" onClick={onConfirmPartialAnalysis} type="button">
              Autorizar análise incompleta
            </button>
          )}
        </div>
      )}

      {detail.errorCode && (
        <div className="agenda-meeting__error">
          {errorMessage(detail.errorCode)}
          {detail.retryable && canReview && (
            <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busyKey === 'retry'} onClick={onRetryAnalysis} type="button">
              <RefreshCw className={cn('h-4 w-4', busyKey === 'retry' && 'animate-spin')} />
              Tentar análise novamente
            </button>
          )}
        </div>
      )}

      <Tabs onValueChange={(value) => setTab(value as DetailTab)} value={tab}>
        <TabsList className="agenda-meeting__tabs">
          <TabsTrigger className="agenda-meeting__tab" value="summary">Resumo</TabsTrigger>
          <TabsTrigger className="agenda-meeting__tab" value="decisions">Decisões</TabsTrigger>
          <TabsTrigger className="agenda-meeting__tab" value="actions">Ações</TabsTrigger>
          <TabsTrigger className="agenda-meeting__tab" value="transcript">Transcrição</TabsTrigger>
        </TabsList>

        <TabsContent className="agenda-meeting__tab-panel" value="summary">
          {latestMinutes ? (
            <>
              <article className="agenda-meeting__content-card">
                <h4>Resumo executivo</h4>
                <p>{latestMinutes.executiveSummary}</p>
                <span className="agenda-meeting__evidence">
                  Modelo efetivo: {latestMinutes.model} · cobertura {latestMinutes.coverage === 'with_gaps' ? 'incompleta' : 'completa'}
                </span>
              </article>
              <article className="agenda-meeting__content-card">
                <h4>{latestMinutes.title}</h4>
                <p>{latestMinutes.minutesMarkdown}</p>
              </article>
              {pendingItems.map((item) => <InsightCard insight={item} key={item.id} />)}
              {risks.map((item) => <InsightCard insight={item} key={item.id} />)}
              {canReview && latestMinutes.state === 'ai_draft' && (
                <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busyKey === 'review'} onClick={() => onReviewMinutes(latestMinutes.id)} type="button">
                  {busyKey === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Confirmar revisão humana
                </button>
              )}
            </>
          ) : (
            <EmptyPanel>O resumo aparecerá somente após a transcrição canônica e a análise estruturada concluírem sem dados parciais.</EmptyPanel>
          )}
        </TabsContent>

        <TabsContent className="agenda-meeting__tab-panel" value="decisions">
          {decisions.length > 0
            ? decisions.map((item) => <InsightCard insight={item} key={item.id} />)
            : <EmptyPanel>Nenhuma decisão foi identificada com evidência suficiente nesta versão.</EmptyPanel>}
        </TabsContent>

        <TabsContent className="agenda-meeting__tab-panel" value="actions">
          <label className="agenda-meeting__filter">
            <input checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} type="checkbox" />
            Mostrar apenas pendências operacionais
          </label>
          {visibleActions.length > 0 ? visibleActions.map((action) => (
            <ActionCard
              action={action}
              members={members}
              busy={busyKey === `action:${action.id}`}
              canReview={canReview}
              key={action.id}
              onUpdate={onActionUpdate}
            />
          )) : <EmptyPanel>Nenhuma ação atende ao filtro atual.</EmptyPanel>}
        </TabsContent>

        <TabsContent className="agenda-meeting__tab-panel" value="transcript">
          {latestTranscript ? (
            <>
              <div className="agenda-meeting__section-heading">
                <span className="agenda-meeting__session-meta">Versão {latestTranscript.version} · {latestTranscript.language}</span>
                {canReview && (
                  <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busyKey === 'revision'} onClick={() => onEditTranscript(!editingTranscript)} type="button">
                    {editingTranscript ? 'Descartar edição' : 'Criar correção'}
                  </button>
                )}
              </div>
              <div className="agenda-meeting__transcript">
                {latestTranscript.segments.map((segment) => (
                  <TranscriptRow
                    canEdit={editingTranscript && segment.kind !== 'gap'}
                    editedText={editedSegments[segment.id] ?? segment.text}
                    key={segment.id}
                    onTextChange={(value) => onSegmentChange(segment.id, value)}
                    segment={segment}
                  />
                ))}
              </div>
              {editingTranscript && (
                <div className="agenda-meeting__controls agenda-meeting__controls--inline">
                  <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busyKey === 'revision'} onClick={onRequestRevision} type="button">
                    {busyKey === 'revision' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Salvar como nova versão
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyPanel>A transcrição canônica ainda não está disponível. O sistema nunca exibirá uma reconstrução artificial.</EmptyPanel>
          )}
        </TabsContent>
      </Tabs>

      {canDelete && !isProcessingSession(detail) && (
        <button className="agenda-meeting__button agenda-meeting__button--danger agenda-meeting__delete-session" disabled={busyKey === 'delete'} onClick={onDelete} type="button">
          <Trash2 className="h-4 w-4" />
          Excluir sessão e conteúdo textual
        </button>
      )}
    </section>
  );
}

function PersistedMeetingWorkspace({
  eventId,
  orgId,
  eventTitle,
  canRecord,
  canReview,
  canDelete,
  onActiveCaptureChange,
}: WorkspaceProps & { eventId: string; orgId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { myRole } = useCurrentOrg();
  const edgeClient = useMemo(() => new AgendaMeetingEdgeClient(), []);
  const capture = useAgendaMeetingCapture({
    eventId,
    orgId,
    persistedEvent: true,
    client: edgeClient,
  });
  const sessionsQuery = useAgendaMeetingSessions({ eventId, orgId, client: edgeClient });
  const membersQuery = useAgendaMeetingMemberOptions(orgId, canReview);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [participantsInformed, setParticipantsInformed] = useState(false);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editedSegments, setEditedSegments] = useState<Record<string, string>>({});

  const activeCapture = GUARDED_CAPTURE_PHASES.has(capture.state.phase);
  const currentSessionId = capture.state.sessionId ?? selectedSessionId;
  const detailQuery = useAgendaMeetingSessionDetail({
    eventId,
    orgId,
    sessionId: currentSessionId,
    client: edgeClient,
  });
  const detail = detailQuery.data ?? null;
  const currentTranscript = detail?.transcriptVersions[detail.transcriptVersions.length - 1] ?? null;

  useEffect(() => {
    onActiveCaptureChange?.(activeCapture, activeCapture ? capture.cancel : null);
    return () => onActiveCaptureChange?.(false, null);
  }, [activeCapture, capture.cancel, onActiveCaptureChange]);

  useEffect(() => {
    if (!selectedSessionId && sessionsQuery.data?.[0]) {
      setSelectedSessionId(sessionsQuery.data[0].id);
    }
  }, [selectedSessionId, sessionsQuery.data]);

  useEffect(() => {
    if (capture.state.sessionId) setSelectedSessionId(capture.state.sessionId);
  }, [capture.state.sessionId]);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    if (['analysis_queued', 'review_required', 'completed', 'fatal_error'].includes(capture.state.phase)) {
      void queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.all });
    }
  }, [capture.state.phase, queryClient]);

  useEffect(() => {
    if (currentTranscript && !editingTranscript) {
      setEditedSegments(Object.fromEntries(currentTranscript.segments.map((segment) => [segment.id, segment.text])));
    }
  }, [currentTranscript, editingTranscript]);

  const runControl = useCallback(async (
    action: 'review_minutes' | 'create_revision' | 'update_action' | 'delete' | 'retry_analysis',
    payload: AgendaMeetingJson,
    operationKey: string,
  ) => {
    if (!detail) return;
    setBusyKey(operationKey);
    try {
      await edgeClient.control({
        action,
        mutationId: createMeetingMutationId(),
        eventId,
        orgId,
        sessionId: detail.id,
        expectedVersion: detail.version,
        payload,
      });
      await queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.all });
      if (action === 'create_revision') setEditingTranscript(false);
      if (action === 'delete') setSelectedSessionId(null);
      toast.success(action === 'delete' ? 'Sessão excluída com trilha administrativa preservada.' : 'Alteração registrada com auditoria.');
    } catch {
      toast.error('Não foi possível registrar a alteração. O conteúdo atual foi preservado.');
    } finally {
      setBusyKey(null);
    }
  }, [detail, edgeClient, eventId, orgId, queryClient]);

  const startCapture = async () => {
    if (!canRecord || !participantsInformed) return;
    try {
      await capture.start({
        consentVersion: CONSENT_VERSION,
        participantsInformed: true,
        deviceId: capture.mic.selectedDeviceId ?? undefined,
      });
      toast.success('Captura iniciada. Somente segmentos pendentes permanecem temporariamente neste dispositivo.');
    } catch (error) {
      if (error instanceof Error && error.message === 'meeting_capture_cancelled') return;
      toast.error(errorMessage(capture.state.error?.code));
    }
  };

  const performCaptureAction = async (action: 'pause' | 'resume' | 'finish' | 'cancel') => {
    try {
      if (action === 'pause') await capture.pause();
      if (action === 'resume') await capture.resume();
      if (action === 'finish') await capture.finish({ allowPartial: partialAccepted });
      if (action === 'cancel') {
        await capture.cancel();
        await queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.all });
      }
    } catch {
      toast.error(errorMessage(capture.state.error?.code));
    }
  };

  const submitRevision = () => {
    if (!currentTranscript) return;
    const changedSegments = currentTranscript.segments
      .filter((segment) => segment.kind !== 'gap')
      .map((segment) => ({
        sourceSegmentId: segment.sourceSegmentId ?? segment.id,
        text: (editedSegments[segment.id] ?? segment.text).trim(),
      }));
    if (changedSegments.some((segment) => segment.text.length === 0)) {
      toast.error('Trechos vazios não podem substituir evidências; registre uma correção textual explícita.');
      return;
    }
    void runControl('create_revision', {
      segments: changedSegments,
    }, 'revision');
  };

  const awaitingCanonicalReceipt = capture.state.backlog.segments > 0;
  const canFinalize = ['recording', 'paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(capture.state.phase);
  const canPause = capture.state.phase === 'recording';
  const canResume = capture.state.activeDurationMs < AGENDA_MEETING_MAX_ACTIVE_DURATION_MS && (
    capture.state.phase === 'paused'
    || capture.state.phase === 'backpressure_paused'
    || capture.state.phase === 'capture_interrupted'
    || capture.state.phase === 'recoverable_error'
  );
  const displayMeterLevel = Math.max(0, Math.min(1, capture.mic.inputLevel ?? 0));
  const meterBars = Array.from({ length: 18 }, (_, index) => Math.max(.12, Math.min(1, displayMeterLevel * 1.8 - index * .035)));

  return (
    <div className="agenda-meeting__body">
      <div className="agenda-meeting__capture-heading">
        <div>
          <p className="agenda-meeting__eyebrow">Sessão vinculada</p>
          <h3 className="agenda-meeting__title">{eventTitle}</h3>
        </div>
        <span className="agenda-meeting__status" data-state={capture.state.phase === 'recording' ? 'recording' : 'ready'}>
          <span className="agenda-meeting__status-dot" aria-hidden="true" />
          {CAPTURE_PHASE_LABELS[capture.state.phase]}
        </span>
      </div>

      {capture.state.error && <div className="agenda-meeting__error">{errorMessage(capture.state.error.code)}</div>}

      {capture.state.phase === 'idle' && (
        <div className="agenda-meeting__consent">
          <div className="agenda-meeting__notice">
            <ShieldCheck className="mr-2 inline h-4 w-4" aria-hidden="true" />
            A FENASOJA guarda apenas transcrição, atas e itens estruturados. Não existe áudio histórico, player, download ou retranscrição posterior.
          </div>
          <label className="agenda-meeting__consent-check">
            <input checked={participantsInformed} onChange={(event) => setParticipantsInformed(event.target.checked)} type="checkbox" />
            <span>Confirmo que todas as pessoas foram informadas sobre a transcrição e consentiram com esta sessão.</span>
          </label>
          {capture.mic.devices.length > 0 && (
            <label className="agenda-meeting__device-field">
              <span>Microfone</span>
              <select onChange={(event) => capture.selectDevice(event.target.value || null)} value={capture.mic.selectedDeviceId ?? ''}>
                <option value="">Padrão do dispositivo</option>
                {capture.mic.devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>
                ))}
              </select>
            </label>
          )}
          {!canRecord && <div className="agenda-meeting__notice" data-tone="gold">Seu perfil pode consultar sessões, mas não possui o escopo operacional necessário para gravar.</div>}
          <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={!canRecord || !participantsInformed || !online} onClick={startCapture} type="button">
            <Mic className="h-4 w-4" />
            Iniciar reunião
          </button>
        </div>
      )}

      {capture.state.phase !== 'idle' && capture.state.phase !== 'completed' && (
        <section aria-label="Captura da reunião">
          <div className="agenda-meeting__status-row">
            <span className="agenda-meeting__timer">{formatDuration(capture.state.activeDurationMs)}</span>
            <span className="agenda-meeting__session-meta">máximo de 04:00:00 ativas</span>
          </div>
          <div aria-label={`Nível de entrada ${Math.round(displayMeterLevel * 100)}%`} className="agenda-meeting__meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayMeterLevel * 100)}>
            {meterBars.map((scale, index) => <span key={index} style={{ opacity: .28 + scale * .72, transform: `scaleY(${scale})` }} />)}
          </div>
          <div className="agenda-meeting__capture-grid">
            <div className="agenda-meeting__metric"><span>Microfone</span><strong>{capture.mic.devices.find((device) => device.deviceId === capture.mic.selectedDeviceId)?.label || 'Dispositivo padrão'}</strong></div>
            <div className="agenda-meeting__metric"><span>Backlog</span><strong>{capture.state.backlog.segments} seg. · {(capture.state.backlog.bytes / 1_048_576).toFixed(1)} MB</strong></div>
            <div className="agenda-meeting__metric"><span>Rede</span><strong>{online ? 'Conectada' : 'Offline protegido'}</strong></div>
          </div>
          <div className="agenda-meeting__live" data-state={capture.liveTranscript.recognition}>
            <div className="agenda-meeting__live-head">
              <span>Transcrição ao vivo</span>
              <strong>{LIVE_RECOGNITION_LABELS[capture.liveTranscript.recognition]}</strong>
            </div>
            <p className="agenda-meeting__live-text">
              {capture.liveTranscript.canonical || (capture.liveTranscript.interim ? '' : 'Aguardando a primeira fala reconhecida…')}
              {capture.liveTranscript.interim && (
                <em className="agenda-meeting__live-interim"> {capture.liveTranscript.interim}</em>
              )}
            </p>
          </div>
          {!online && <div className="agenda-meeting__notice" data-tone="gold"><WifiOff className="mr-2 inline h-4 w-4" />A captura será pausada ao atingir 20 minutos ou 64 MB pendentes. Mantenha esta tela aberta.</div>}
          {awaitingCanonicalReceipt && <div className="agenda-meeting__notice">Os trechos já reconhecidos só saem da fila local após o recibo canônico do servidor.</div>}
          {(capture.state.interruption || capture.state.phase === 'capture_interrupted') && <div className="agenda-meeting__notice" data-tone="gold">Uma interrupção do dispositivo foi registrada. O intervalo não capturado será preservado como lacuna explícita.</div>}

          <label className="agenda-meeting__consent-check agenda-meeting__partial-check">
            <input checked={partialAccepted} onChange={(event) => setPartialAccepted(event.target.checked)} type="checkbox" />
            <span>Se houver lacunas, autorizo finalizar com cobertura incompleta para revisão humana.</span>
          </label>
          <div className="agenda-meeting__controls">
            {canPause && <button className="agenda-meeting__button" onClick={() => void performCaptureAction('pause')} type="button"><Pause className="h-4 w-4" />Pausar</button>}
            {canResume && <button className="agenda-meeting__button" disabled={!online && capture.state.backlog.isAtCapacity} onClick={() => void performCaptureAction('resume')} type="button"><Play className="h-4 w-4" />Retomar</button>}
            {canFinalize && <button className="agenda-meeting__button agenda-meeting__button--primary" onClick={() => void performCaptureAction('finish')} type="button"><CircleStop className="h-4 w-4" />Finalizar</button>}
            {activeCapture && <button className="agenda-meeting__button agenda-meeting__button--danger" onClick={() => setConfirmIntent('cancel-capture')} type="button"><Trash2 className="h-4 w-4" />Cancelar</button>}
          </div>
        </section>
      )}

      <div className="agenda-meeting__history-heading">
        <div>
          <p className="agenda-meeting__eyebrow">Histórico do evento</p>
          <h3 className="agenda-meeting__title">Reuniões e atas</h3>
        </div>
        <button aria-label="Atualizar histórico" className="agenda-meeting__icon-button" disabled={sessionsQuery.isFetching} onClick={() => void sessionsQuery.refetch()} type="button">
          <RefreshCw className={cn('h-4 w-4', sessionsQuery.isFetching && 'animate-spin')} />
        </button>
      </div>
      {sessionsQuery.isError && <div className="agenda-meeting__error">Não foi possível consultar o histórico com sua sessão atual.</div>}
      <SessionHistory loading={sessionsQuery.isLoading} onSelect={setSelectedSessionId} selectedId={currentSessionId} sessions={sessionsQuery.data ?? []} />

      {currentSessionId && detailQuery.isLoading && <div className="agenda-meeting__loading"><Loader2 className="h-4 w-4 animate-spin" />Carregando conhecimento textual…</div>}
      {detailQuery.isError && <div className="agenda-meeting__error">Esta sessão não pôde ser lida dentro do escopo atual.</div>}
      {detail && (
        <SessionDetail
          busyKey={busyKey}
          canDelete={canDelete && (myRole === 'admin' || myRole === 'gestor' || detail.createdBy === user?.id)}
          canReview={canReview}
          detail={detail}
          editedSegments={editedSegments}
          editingTranscript={editingTranscript}
          members={membersQuery.data ?? []}
          onActionUpdate={(update) => void runControl('update_action', { ...update }, `action:${update.actionId}`)}
          onConfirmPartialAnalysis={() => setConfirmIntent('analyze-partial')}
          onDelete={() => setConfirmIntent('delete-session')}
          onEditTranscript={setEditingTranscript}
          onRequestRevision={() => setConfirmIntent('submit-revision')}
          onRetryAnalysis={() => void runControl('retry_analysis', {}, 'retry')}
          onReviewMinutes={(minutesVersionId) => void runControl('review_minutes', { minutesVersionId, decision: 'approve' }, 'review')}
          onSegmentChange={(segmentId, value) => setEditedSegments((current) => ({ ...current, [segmentId]: value }))}
        />
      )}

      <AlertDialog open={confirmIntent !== null} onOpenChange={(open) => { if (!open) setConfirmIntent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmIntent === 'cancel-capture'
                ? 'Cancelar esta captura?'
                : confirmIntent === 'delete-session'
                  ? 'Excluir a sessão?'
                  : confirmIntent === 'analyze-partial'
                    ? 'Analisar transcrição incompleta?'
                    : 'Criar uma nova versão?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmIntent === 'cancel-capture'
                ? 'Os segmentos temporários serão apagados e o cancelamento ficará na auditoria. Áudio descartado não poderá ser retranscrito.'
                : confirmIntent === 'delete-session'
                  ? 'Transcrição, ata e itens estruturados serão removidos. Permanecerá somente um tombstone administrativo sem conteúdo.'
                  : confirmIntent === 'analyze-partial'
                    ? 'A análise ficará permanentemente marcada como incompleta e cada resultado continuará vinculado às evidências disponíveis. Nenhuma fala será reconstruída.'
                    : 'A transcrição canônica não será sobrescrita. A correção produzirá uma versão normalizada e uma nova análise vinculada às mesmas evidências.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmIntent === 'submit-revision' || confirmIntent === 'analyze-partial' ? 'bg-emerald-800 text-white hover:bg-emerald-900' : 'bg-red-700 text-white hover:bg-red-800'}
              onClick={() => {
                const intent = confirmIntent;
                setConfirmIntent(null);
                if (intent === 'cancel-capture') void performCaptureAction('cancel');
                if (intent === 'delete-session') void runControl('delete', {}, 'delete');
                if (intent === 'submit-revision') submitRevision();
                if (intent === 'analyze-partial') void runControl('retry_analysis', { confirmPartial: true }, 'retry');
              }}
            >
              {confirmIntent === 'submit-revision' ? 'Criar versão' : confirmIntent === 'analyze-partial' ? 'Autorizar análise' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AgendaMeetingWorkspace({
  eventId,
  orgId,
  eventTitle,
  persistedEvent,
  canRecord,
  canReview,
  canDelete,
  onActiveCaptureChange,
  className,
}: WorkspaceProps) {
  const [expanded, setExpanded] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);
  const available = persistedEvent && Boolean(eventId && orgId);

  const handleCaptureChange = useCallback((
    active: boolean,
    cancelForExit: (() => Promise<void>) | null,
  ) => {
    setCaptureActive(active);
    onActiveCaptureChange?.(active, cancelForExit);
  }, [onActiveCaptureChange]);

  useEffect(() => {
    if (!available) onActiveCaptureChange?.(false, null);
  }, [available, onActiveCaptureChange]);

  return (
    <section className={cn('agenda-meeting', className)} data-available={available}>
      <button
        aria-expanded={expanded}
        className="agenda-meeting__launcher"
        disabled={!available}
        onClick={() => {
          if (captureActive && expanded) return;
          setExpanded((current) => !current);
        }}
        type="button"
      >
        <span className="agenda-meeting__mark-shell"><MeetingIntelligenceMark state={available ? 'idle' : 'blocked'} /></span>
        <span>
          <span className="agenda-meeting__eyebrow">Inteligência de reunião</span>
          <span className="agenda-meeting__title">Ata vinculada à Agenda FENASOJA</span>
          <span className="agenda-meeting__description">
            {available ? 'Capture, organize decisões e acompanhe responsabilidades com evidência.' : 'Disponível somente para eventos persistidos e sincronizados com UUID canônico.'}
          </span>
        </span>
        <span className="agenda-meeting__launcher-action">
          {available ? (
            captureActive
              ? <><Mic className="h-4 w-4" />Captura ativa</>
              : expanded
                ? <><ChevronUp className="h-4 w-4" />Recolher</>
                : <><ChevronDown className="h-4 w-4" />Abrir experiência</>
          ) : <><Clock3 className="h-4 w-4" />Indisponível</>}
        </span>
      </button>
      {!available && <div className="agenda-meeting__body"><div className="agenda-meeting__notice" data-tone="gold">Este item veio do seed/offline ou perdeu sua origem persistida. Nenhuma sessão será criada até que o evento tenha um UUID real no Supabase.</div></div>}
      {expanded && available && eventId && orgId && (
        <PersistedMeetingWorkspace
          canDelete={canDelete}
          canRecord={canRecord}
          canReview={canReview}
          eventId={eventId}
          eventTitle={eventTitle}
          onActiveCaptureChange={handleCaptureChange}
          orgId={orgId}
          persistedEvent
        />
      )}
    </section>
  );
}
