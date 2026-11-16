import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileText,
  Loader2,
  Mic,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
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
import {
  agendaMeetingQueryKeys,
  useAgendaMeetingMemberOptions,
  useAgendaMeetingSessionDetail,
  useAgendaMeetingSessions,
} from '@/features/agenda-meeting-intelligence/hooks/useAgendaMeetingSessions';
import { useOptionalMeetingCapture } from '@/features/agenda-meeting-intelligence/provider/meetingCaptureContext';
import type {
  AgendaMeetingActionItem,
  AgendaMeetingControlAction,
  AgendaMeetingJson,
  AgendaMeetingMemberOption,
  AgendaMeetingSessionDetail,
  AgendaMeetingSessionSummary,
  AgendaMeetingTranscriptSegment,
  AgendaMeetingUpdateActionInput,
  AgendaMeetingWorkspaceProps,
} from '@/features/agenda-meeting-intelligence/types';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { cn } from '@/lib/utils';

import { MeetingCapturePanel } from './MeetingCapturePanel';
import { MeetingIntelligenceMark } from './MeetingIntelligenceMark';
import { MeetingReportView, modelLabel } from './MeetingReportView';
import {
  COLLAPSE_NOTICE,
  errorCodeOf,
  formatClock,
  formatDateTime,
  formatDuration,
  MEETING_CONSENT_VERSION,
  meetingErrorMessage,
  SERVER_STAGE_LABELS,
  serverStageOf,
  type ServerStage,
} from './meetingCopy';

type DetailTab = 'report' | 'transcript' | 'history';
type ConfirmIntent =
  | { kind: 'delete-session' }
  | { kind: 'delete-report'; minutesVersionId: string; version: number }
  | { kind: 'partial-report'; transcriptVersionId: string }
  | { kind: 'accept-gaps' }
  | { kind: 'submit-revision' }
  | null;

const PROCESSING_STAGES = new Set<ServerStage>(['transcribing', 'generating_report', 'recording', 'paused']);

interface WorkspaceProps extends AgendaMeetingWorkspaceProps {
  className?: string;
}

function SessionHistory({ sessions, selectedId, onSelect, loading }: {
  sessions: AgendaMeetingSessionSummary[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="agenda-meeting__empty" aria-busy="true"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando reuniões…</div>;
  }
  if (!sessions.length) {
    return <div className="agenda-meeting__empty">Nenhuma reunião registrada para este evento.</div>;
  }
  return (
    <div className="agenda-meeting__sessions" aria-label="Reuniões deste evento">
      {sessions.map((session, index) => {
        const stage = serverStageOf(session);
        return (
          <button className="agenda-meeting__session" data-selected={selectedId === session.id} key={session.id} onClick={() => onSelect(session.id)} type="button">
            <span>
              <span className="agenda-meeting__session-title">Reunião {sessions.length - index}</span>
              <span className="agenda-meeting__session-meta">
                {formatDateTime(session.startedAt ?? session.createdAt)} · {formatDuration(session.activeDurationMs)}
                {session.pipeline === 'legacy_pre_audio' ? ' · registro anterior' : ''}
              </span>
            </span>
            <span className="agenda-meeting__status" data-state={PROCESSING_STAGES.has(stage) ? 'recording' : 'ready'}>{SERVER_STAGE_LABELS[stage]}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActionCard({ action, members, canReview, busy, onUpdate }: {
  action: AgendaMeetingActionItem;
  members: AgendaMeetingMemberOption[];
  canReview: boolean;
  busy: boolean;
  onUpdate: (update: AgendaMeetingUpdateActionInput) => void;
}) {
  const [dueDate, setDueDate] = useState(action.dueDate ?? '');
  useEffect(() => setDueDate(action.dueDate ?? ''), [action.dueDate]);
  const statusLabel: Record<AgendaMeetingActionItem['status'], string> = {
    proposed: 'Proposta', confirmed: 'Confirmada', in_progress: 'Em andamento', completed: 'Concluída', dismissed: 'Descartada',
  };
  return (
    <article className="agenda-meeting__content-card agenda-meeting__action-card">
      <div className="agenda-meeting__section-heading">
        <h4>{action.title}</h4>
        <span className="agenda-meeting__status">{statusLabel[action.status]}</span>
      </div>
      <dl className="agenda-meeting__action-meta">
        <div><dt>Responsável mencionado</dt><dd>{action.responsibleText || 'Não definido'}</dd></div>
        <div><dt>Prazo</dt><dd>{action.dueDateConfirmed && action.dueDate ? action.dueDate : action.dueDateText || 'Não definido'}</dd></div>
      </dl>
      {canReview && action.status !== 'dismissed' && (
        <div className="agenda-meeting__action-review">
          <label className="agenda-meeting__device-field">
            <span>Responsável confirmado por uma pessoa</span>
            <select
              disabled={busy}
              onChange={(event) => onUpdate({ actionId: action.id, confirmedUserId: event.target.value || null, status: event.target.value ? 'confirmed' : 'proposed' })}
              value={action.confirmedMemberId ?? ''}
            >
              <option value="">Aguardando definição</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
            </select>
          </label>
          <label className="agenda-meeting__device-field">
            <span>Prazo confirmado</span>
            <span className="agenda-meeting__date-editor">
              <input disabled={busy} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
              <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busy || !dueDate || (action.dueDateConfirmed && action.dueDate === dueDate)} onClick={() => onUpdate({ actionId: action.id, dueDate })} type="button">
                Confirmar prazo
              </button>
            </span>
          </label>
          <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busy} onClick={() => onUpdate({ actionId: action.id, status: action.status === 'completed' ? 'confirmed' : 'completed' })} type="button">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : action.status === 'completed' ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {action.status === 'completed' ? 'Reabrir ação' : 'Marcar concluída'}
          </button>
        </div>
      )}
    </article>
  );
}

function TranscriptRow({ segment, canEdit, editedText, onTextChange, highlighted }: {
  segment: AgendaMeetingTranscriptSegment;
  canEdit: boolean;
  editedText: string;
  onTextChange: (value: string) => void;
  highlighted: boolean;
}) {
  const kind = segment.kind === 'gap' ? 'gap' : segment.text.trim() ? segment.kind : 'silence';
  return (
    <div className="agenda-meeting__transcript-row" data-highlight={highlighted} data-kind={kind} id={`meeting-segment-${segment.id}`}>
      <span className="agenda-meeting__transcript-time">{formatClock(segment.captureStartMs)}</span>
      {kind === 'gap' ? (
        <p className="agenda-meeting__transcript-text">Lacuna de {formatClock(segment.captureStartMs)} a {formatClock(segment.captureEndMs)}: trecho sem transcrição. Nenhuma fala foi reconstruída.</p>
      ) : kind === 'silence' ? (
        <p className="agenda-meeting__transcript-text">Nenhuma fala identificada neste trecho ({formatClock(segment.captureStartMs)}–{formatClock(segment.captureEndMs)}).</p>
      ) : canEdit ? (
        <textarea aria-label={`Trecho em ${formatClock(segment.captureStartMs)}`} className="agenda-meeting__transcript-editor" onChange={(event) => onTextChange(event.target.value)} rows={Math.max(2, Math.ceil(editedText.length / 64))} value={editedText} />
      ) : (
        <p className="agenda-meeting__transcript-text">{segment.text}</p>
      )}
    </div>
  );
}

function StageBanner({ detail, stage, canReview, busyKey, onRun }: {
  detail: AgendaMeetingSessionDetail;
  stage: ServerStage;
  canReview: boolean;
  busyKey: string | null;
  onRun: (action: AgendaMeetingControlAction, payload: AgendaMeetingJson, key: string) => void;
}) {
  const stats = detail.coverageStats;
  const tone = stage === 'failed' || stage === 'no_speech' ? 'error' : stage === 'partial_transcript' || stage === 'interrupted' ? 'warn' : undefined;
  let text: string;
  switch (stage) {
    case 'transcribing':
      text = stats?.expectedSegments
        ? `Finalizando transcrição: ${stats.transcribedSegments} de ${stats.expectedSegments} parte(s) de áudio transcritas pelo Gemini 3.5 Transcribe.`
        : `Transcrevendo o áudio recebido (${stats?.transcribedSegments ?? 0} parte(s) prontas).`;
      break;
    case 'generating_report':
      text = 'Transcrição consolidada. O GPT-6.1 Sol está gerando o relatório.';
      break;
    case 'no_speech':
      text = 'Nenhuma fala identificada. A gravação foi transcrita, mas não há conteúdo para relatório.';
      break;
    case 'partial_transcript':
      text = 'A transcrição tem lacunas (áudio que não chegou ou não pôde ser transcrito). O relatório completo não é gerado automaticamente.';
      break;
    case 'failed':
      text = meetingErrorMessage(detail.errorCode);
      break;
    case 'interrupted':
      text = 'A gravação foi interrompida (navegador fechado, recarregado ou aparelho suspenso). O áudio já enviado está preservado.';
      break;
    default:
      text = SERVER_STAGE_LABELS[stage];
  }
  const showRetryTranscription = canReview && (detail.retryableStage === 'transcription' || detail.retryableStage === 'assembly');
  const showAcceptGaps = canReview && detail.closedSequence !== null && detail.closedSequence !== undefined
    && (detail.unresolvedSequences?.length ?? 0) > 0 && (stage === 'failed' || stage === 'transcribing');
  const showRetryReport = canReview && detail.retryableStage === 'analysis';
  return (
    <div className="agenda-meeting__stage" data-tone={tone} role="status">
      {PROCESSING_STAGES.has(stage) ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : tone ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
      <span className="flex-1">{text}</span>
      {showRetryTranscription && (
        <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busyKey !== null} onClick={() => onRun('retry_transcription', {}, 'retry-transcription')} type="button">
          <RefreshCw className={cn('h-4 w-4', busyKey === 'retry-transcription' && 'animate-spin')} />Tentar transcrição novamente
        </button>
      )}
      {showAcceptGaps && (
        <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busyKey !== null} onClick={() => onRun('accept_transcription_gaps', {}, 'accept-gaps')} type="button">
          Seguir com lacunas
        </button>
      )}
      {showRetryReport && (
        <button className="agenda-meeting__button agenda-meeting__button--compact" disabled={busyKey !== null} onClick={() => onRun('regenerate_report', { allowPartial: detail.partialAnalysisConfirmed === true }, 'regenerate')} type="button">
          <RefreshCw className={cn('h-4 w-4', busyKey === 'regenerate' && 'animate-spin')} />Tentar gerar relatório novamente
        </button>
      )}
    </div>
  );
}

function SessionDetail({ detail, canReview, canDelete, busyKey, members, onRun, onDownload, onConfirm, editing, setEditing, editedSegments, setEditedSegments }: {
  detail: AgendaMeetingSessionDetail;
  canReview: boolean;
  canDelete: boolean;
  busyKey: string | null;
  members: AgendaMeetingMemberOption[];
  onRun: (action: AgendaMeetingControlAction, payload: AgendaMeetingJson, key: string) => void;
  onDownload: (kind: 'report_pdf' | 'transcript_pdf' | 'transcript_txt', versionId: string) => void;
  onConfirm: (intent: ConfirmIntent) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  editedSegments: Record<string, string>;
  setEditedSegments: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('report');
  const [highlight, setHighlight] = useState<string | null>(null);
  const stage = serverStageOf(detail);
  const latestTranscript = detail.transcriptVersions[detail.transcriptVersions.length - 1] ?? null;
  const visibleMinutes = detail.minutesVersions.filter((minutes) => minutes.state !== 'superseded');
  const latestMinutes = visibleMinutes[visibleMinutes.length - 1] ?? detail.minutesVersions[detail.minutesVersions.length - 1] ?? null;
  const [selectedMinutesId, setSelectedMinutesId] = useState<string | null>(null);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const minutes = detail.minutesVersions.find((item) => item.id === selectedMinutesId) ?? latestMinutes;
  const transcript = detail.transcriptVersions.find((item) => item.id === selectedTranscriptId) ?? latestTranscript;
  const minutesTranscript = minutes ? detail.transcriptVersions.find((item) => item.id === minutes.sourceTranscriptVersionId) ?? null : null;
  const canonical = detail.transcriptVersions.find((item) => item.kind === 'canonical');
  const evidenceStarts = useMemo(() => new Map(
    (canonical?.segments ?? []).map((segment) => [segment.id, segment.captureStartMs] as const),
  ), [canonical]);
  const pendingActions = detail.actionItems.filter((item) => minutes && item.status !== 'dismissed');
  const isLegacy = detail.pipeline === 'legacy_pre_audio';
  const transcriptHasSpeech = Boolean(transcript?.segments.some((segment) => segment.kind !== 'gap' && segment.text.trim()));

  const openEvidence = (segmentId: string) => {
    setSelectedTranscriptId(canonical?.id ?? null);
    setTab('transcript');
    setHighlight(segmentId);
    window.setTimeout(() => document.getElementById(`meeting-segment-${segmentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const requestReport = (transcriptVersionId: string) => {
    const version = detail.transcriptVersions.find((item) => item.id === transcriptVersionId);
    if (version?.coverage === 'with_gaps' && !detail.partialAnalysisConfirmed) onConfirm({ kind: 'partial-report', transcriptVersionId });
    else onRun('regenerate_report', { transcriptVersionId }, 'regenerate');
  };

  return (
    <section className="agenda-meeting__detail" aria-label="Resultado da reunião">
      <StageBanner busyKey={busyKey} canReview={canReview} detail={detail} onRun={onRun} stage={stage} />
      {isLegacy && (
        <div className="agenda-meeting__notice">Registro anterior ao upgrade: o texto foi reconhecido pelo navegador durante a reunião e nenhum áudio foi guardado.</div>
      )}

      <Tabs onValueChange={(value) => setTab(value as DetailTab)} value={tab}>
        <TabsList className="agenda-meeting__tabs">
          <TabsTrigger className="agenda-meeting__tab" value="report">Relatório</TabsTrigger>
          <TabsTrigger className="agenda-meeting__tab" value="transcript">Transcrição</TabsTrigger>
          <TabsTrigger className="agenda-meeting__tab" value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent className="agenda-meeting__tab-panel" value="report">
          {minutes ? (
            <>
              {detail.minutesVersions.length > 1 && (
                <label className="agenda-meeting__device-field">
                  <span>Versão do relatório</span>
                  <select onChange={(event) => setSelectedMinutesId(event.target.value)} value={minutes.id}>
                    {[...detail.minutesVersions].reverse().map((item) => (
                      <option key={item.id} value={item.id}>Versão {item.version} · {formatDateTime(item.createdAt)}{item.state === 'superseded' ? ' · substituída' : ''}</option>
                    ))}
                  </select>
                </label>
              )}
              <MeetingReportView
                eventTitle={detail.eventSnapshot.title || 'Reunião'}
                evidenceStarts={evidenceStarts}
                meetingDate={detail.startedAt ?? detail.createdAt}
                minutes={minutes}
                onOpenEvidence={openEvidence}
                outdated={Boolean(latestTranscript && minutes.sourceTranscriptVersionId !== latestTranscript.id)}
                transcriptVersionNumber={minutesTranscript?.version ?? null}
              />
              <div className="agenda-meeting__downloads">
                <button className="agenda-meeting__button" disabled={busyKey !== null} onClick={() => onDownload('report_pdf', minutes.id)} type="button">
                  {busyKey === `download:report_pdf:${minutes.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar relatório em PDF
                </button>
                {canReview && minutes.state === 'ai_draft' && (
                  <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busyKey !== null} onClick={() => onRun('review_minutes', { minutesVersionId: minutes.id, decision: 'approve' }, 'review')} type="button">
                    <ShieldCheck className="h-4 w-4" />Confirmar revisão humana
                  </button>
                )}
                {canReview && latestTranscript && transcriptHasSpeech && !detail.reportQueued && (
                  <button className="agenda-meeting__button" disabled={busyKey !== null} onClick={() => requestReport(latestTranscript.id)} type="button">
                    <Sparkles className="h-4 w-4" />Gerar nova versão do relatório
                  </button>
                )}
                {canDelete && (
                  <button className="agenda-meeting__button agenda-meeting__button--danger" disabled={busyKey !== null} onClick={() => onConfirm({ kind: 'delete-report', minutesVersionId: minutes.id, version: minutes.version })} type="button">
                    <Trash2 className="h-4 w-4" />Excluir relatório
                  </button>
                )}
              </div>
              {pendingActions.length > 0 && canReview && (
                <details className="agenda-meeting__content-card">
                  <summary>Revisar encaminhamentos ({pendingActions.length})</summary>
                  <p className="agenda-meeting__session-meta">A IA apenas propõe. Responsáveis e prazos só valem depois de confirmados por uma pessoa; nenhuma tarefa é criada automaticamente.</p>
                  {pendingActions.map((action) => (
                    <ActionCard action={action} busy={busyKey === `action:${action.id}`} canReview={canReview} key={action.id} members={members}
                      onUpdate={(update) => onRun('update_action', { ...update }, `action:${update.actionId}`)} />
                  ))}
                </details>
              )}
            </>
          ) : (
            <div className="agenda-meeting__empty">
              {stage === 'no_speech'
                ? 'Nenhuma fala identificada: não há relatório para esta reunião.'
                : stage === 'generating_report' || stage === 'transcribing'
                  ? 'O relatório aparecerá aqui assim que a transcrição completa for consolidada e analisada.'
                  : stage === 'partial_transcript'
                    ? 'A transcrição está incompleta. Gere um relatório parcial somente se fizer sentido para a reunião.'
                    : 'Ainda não há relatório para esta reunião.'}
              {canReview && latestTranscript && transcriptHasSpeech && !detail.reportQueued && stage !== 'generating_report' && (
                <div className="agenda-meeting__controls agenda-meeting__controls--inline">
                  <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busyKey !== null} onClick={() => requestReport(latestTranscript.id)} type="button">
                    <Sparkles className="h-4 w-4" />{latestTranscript.coverage === 'with_gaps' ? 'Gerar relatório parcial' : 'Gerar relatório'}
                  </button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent className="agenda-meeting__tab-panel" value="transcript">
          {transcript ? (
            <>
              <div className="agenda-meeting__section-heading">
                <span className="agenda-meeting__session-meta">
                  Versão {transcript.version} · {transcript.kind === 'normalized_manual' ? 'correção humana' : isLegacy ? 'texto do navegador' : 'Gemini 3.5 Transcribe'} · {transcript.coverage === 'with_gaps' ? 'com lacunas' : 'completa'}
                </span>
                {detail.transcriptVersions.length > 1 && (
                  <select aria-label="Versão da transcrição" onChange={(event) => setSelectedTranscriptId(event.target.value)} value={transcript.id}>
                    {[...detail.transcriptVersions].reverse().map((item) => <option key={item.id} value={item.id}>Versão {item.version}</option>)}
                  </select>
                )}
              </div>
              <div className="agenda-meeting__downloads">
                <button className="agenda-meeting__button" disabled={busyKey !== null} onClick={() => onDownload('transcript_txt', transcript.id)} type="button">
                  {busyKey === `download:transcript_txt:${transcript.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Baixar TXT
                </button>
                <button className="agenda-meeting__button" disabled={busyKey !== null} onClick={() => onDownload('transcript_pdf', transcript.id)} type="button">
                  {busyKey === `download:transcript_pdf:${transcript.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Baixar PDF
                </button>
                {canReview && (
                  <button className="agenda-meeting__button" onClick={() => setEditing(!editing)} type="button">{editing ? 'Descartar correção' : 'Corrigir transcrição'}</button>
                )}
              </div>
              <div className="agenda-meeting__transcript">
                {transcript.segments.map((segment) => (
                  <TranscriptRow
                    canEdit={editing && segment.kind !== 'gap' && Boolean(segment.text.trim())}
                    editedText={editedSegments[segment.id] ?? segment.text}
                    highlighted={highlight === segment.id || highlight === segment.sourceSegmentId}
                    key={segment.id}
                    onTextChange={(value) => setEditedSegments((current) => ({ ...current, [segment.id]: value }))}
                    segment={segment}
                  />
                ))}
              </div>
              {editing && (
                <div className="agenda-meeting__controls agenda-meeting__controls--inline">
                  <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busyKey !== null} onClick={() => onConfirm({ kind: 'submit-revision' })} type="button">
                    <CheckCircle2 className="h-4 w-4" />Salvar como nova versão
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="agenda-meeting__empty">A transcrição completa aparece aqui depois que todas as partes de áudio forem transcritas e consolidadas.</div>
          )}
        </TabsContent>

        <TabsContent className="agenda-meeting__tab-panel" value="history">
          <ul className="agenda-meeting__timeline">
            <li><span>Início</span><span>{formatDateTime(detail.startedAt ?? detail.createdAt)}</span></li>
            <li><span>Fim</span><span>{detail.endedAt ? formatDateTime(detail.endedAt) : 'Em andamento'}</span></li>
            <li><span>Duração gravada</span><span>{formatDuration(detail.activeDurationMs)} (pausas não contam)</span></li>
            <li><span>Origem</span><span>{isLegacy ? 'Texto reconhecido pelo navegador (registro anterior, sem áudio)' : 'Áudio do microfone · transcrição Gemini 3.5 Transcribe · relatório GPT-6.1 Sol'}</span></li>
            {detail.coverageStats && !isLegacy && (
              <li>
                <span>Cobertura</span>
                <span>
                  {detail.coverageStats.transcribedSegments} parte(s) transcritas
                  {detail.coverageStats.silentSegments ? ` · ${detail.coverageStats.silentSegments} sem fala` : ''}
                  {detail.coverageStats.lostSegments ? ` · ${detail.coverageStats.lostSegments} lacuna(s)` : ''}
                  {detail.coverageStats.failedSegments ? ` · ${detail.coverageStats.failedSegments} com falha` : ''}
                </span>
              </li>
            )}
            {!isLegacy && (
              <li><span>Áudio</span><span>Guardado em área privada só para transcrição; apagado automaticamente {detail.audioRetentionHours ?? 72} h após a consolidação (ou ao excluir/cancelar).</span></li>
            )}
            {detail.transcriptVersions.map((version) => (
              <li key={version.id}><span>{formatDateTime(version.createdAt)}</span><span>Transcrição v{version.version} · {version.kind === 'normalized_manual' ? 'correção humana' : 'original'} · {version.coverage === 'with_gaps' ? 'com lacunas' : 'completa'}</span></li>
            ))}
            {detail.minutesVersions.map((version) => (
              <li key={version.id}>
                <span>{formatDateTime(version.createdAt)}</span>
                <span>Relatório v{version.version} · {modelLabel(version.model)} · {version.state === 'reviewed' ? 'revisado' : version.state === 'superseded' ? 'substituído' : 'rascunho'}{version.isPartial ? ' · parcial' : ''}</span>
              </li>
            ))}
          </ul>
          {canDelete && !['recording', 'paused'].includes(stage) && (
            <button className="agenda-meeting__button agenda-meeting__button--danger agenda-meeting__delete-session" disabled={busyKey !== null} onClick={() => onConfirm({ kind: 'delete-session' })} type="button">
              <Trash2 className="h-4 w-4" />Excluir sessão e todos os conteúdos
            </button>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function PersistedMeetingWorkspace({ eventId, orgId, eventTitle, canRecord, canReview, canDelete, onCollapse }: WorkspaceProps & { eventId: string; orgId: string; onCollapse: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { myRole } = useCurrentOrg();
  const capture = useOptionalMeetingCapture();
  const edgeClient = useMemo(() => new AgendaMeetingEdgeClient(), []);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [participantsInformed, setParticipantsInformed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmIntent>(null);
  const [editing, setEditing] = useState(false);
  const [editedSegments, setEditedSegments] = useState<Record<string, string>>({});

  const boundHere = capture?.target?.eventId === eventId && capture.target.orgId === orgId;
  const controller = boundHere ? capture?.controller ?? null : null;
  const ownsMeeting = Boolean(boundHere && capture?.isActive);
  const otherMeetingActive = Boolean(capture?.isActive && !boundHere);
  const liveSessionId = ownsMeeting ? controller?.state.sessionId ?? null : null;

  const sessionsQuery = useAgendaMeetingSessions({ eventId, orgId, client: edgeClient, refetchInterval: ownsMeeting ? 15_000 : false });
  const membersQuery = useAgendaMeetingMemberOptions(orgId, canReview);
  const currentSessionId = liveSessionId ?? selectedSessionId;
  const detailQuery = useAgendaMeetingSessionDetail({
    eventId,
    orgId,
    sessionId: currentSessionId,
    client: edgeClient,
    refetchInterval: (detail) => {
      if (!detail) return false;
      const stage = serverStageOf(detail);
      return stage === 'transcribing' || stage === 'generating_report' ? 4_000 : ownsMeeting ? 10_000 : false;
    },
  });
  const detail = detailQuery.data ?? null;
  const currentTranscript = detail?.transcriptVersions[detail.transcriptVersions.length - 1] ?? null;
  const previousOwned = useRef(ownsMeeting);

  useEffect(() => {
    if (!selectedSessionId && sessionsQuery.data?.[0]) setSelectedSessionId(sessionsQuery.data[0].id);
  }, [selectedSessionId, sessionsQuery.data]);

  useEffect(() => {
    if (liveSessionId) setSelectedSessionId(liveSessionId);
  }, [liveSessionId]);

  // When the client hands the finalized meeting to the server, refresh the history.
  useEffect(() => {
    if (previousOwned.current && !ownsMeeting) void queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.all });
    previousOwned.current = ownsMeeting;
  }, [ownsMeeting, queryClient]);

  useEffect(() => {
    if (currentTranscript && !editing) {
      setEditedSegments(Object.fromEntries(currentTranscript.segments.map((segment) => [segment.id, segment.text])));
    }
  }, [currentTranscript, editing]);

  const runControl = useCallback(async (action: AgendaMeetingControlAction, payload: AgendaMeetingJson, key: string) => {
    if (!detail) return;
    setBusyKey(key);
    try {
      await edgeClient.control({ action, mutationId: createMeetingMutationId(), eventId, orgId, sessionId: detail.id, payload });
      await queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.all });
      if (action === 'create_revision') setEditing(false);
      if (action === 'delete') setSelectedSessionId(null);
      const messages: Partial<Record<AgendaMeetingControlAction, string>> = {
        delete: 'Sessão e conteúdos excluídos. Ficou apenas o registro administrativo da exclusão.',
        delete_report: 'Relatório excluído. A transcrição foi mantida e nenhum novo relatório será gerado sem pedido.',
        regenerate_report: 'Nova versão do relatório solicitada ao GPT-6.1 Sol.',
        retry_transcription: 'Transcrição reenviada para processamento.',
        accept_transcription_gaps: 'A transcrição será consolidada com as lacunas identificadas.',
        review_minutes: 'Revisão humana registrada.',
        create_revision: 'Correção salva como nova versão da transcrição.',
      };
      toast.success(messages[action] ?? 'Alteração registrada.');
    } catch (error) {
      toast.error(meetingErrorMessage(errorCodeOf(error)));
    } finally {
      setBusyKey(null);
    }
  }, [detail, edgeClient, eventId, orgId, queryClient]);

  const download = useCallback(async (kind: 'report_pdf' | 'transcript_pdf' | 'transcript_txt', versionId: string) => {
    if (!detail) return;
    setBusyKey(`download:${kind}:${versionId}`);
    try {
      const result = await edgeClient.exportArtifact({ eventId, orgId, sessionId: detail.id, kind, versionId });
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      void queryClient.invalidateQueries({ queryKey: agendaMeetingQueryKeys.detail(orgId, eventId, detail.id) });
    } catch (error) {
      toast.error(meetingErrorMessage(errorCodeOf(error) || 'meeting_export_failed'));
    } finally {
      setBusyKey(null);
    }
  }, [detail, edgeClient, eventId, orgId, queryClient]);

  const startCapture = async () => {
    if (!capture || !canRecord || !participantsInformed) return;
    setStarting(true);
    try {
      await capture.startFor({ eventId, orgId, eventTitle }, { consentVersion: MEETING_CONSENT_VERSION, participantsInformed: true });
      toast.success('Gravação iniciada. Você pode fechar este painel e continuar usando a Agenda.');
    } catch (error) {
      const code = errorCodeOf(error);
      if (code !== 'meeting_capture_cancelled') toast.error(meetingErrorMessage(code));
    } finally {
      setStarting(false);
    }
  };

  const submitRevision = () => {
    if (!currentTranscript) return;
    const segments = currentTranscript.segments
      .filter((segment) => segment.kind !== 'gap' && segment.text.trim())
      .map((segment) => ({ sourceSegmentId: segment.sourceSegmentId ?? segment.id, text: (editedSegments[segment.id] ?? segment.text).trim() }));
    if (segments.some((segment) => !segment.text)) {
      toast.error('Trechos com fala não podem ficar vazios na correção.');
      return;
    }
    void runControl('create_revision', { segments }, 'revision');
  };

  const canDeleteDetail = canDelete && (myRole === 'admin' || myRole === 'gestor' || detail?.createdBy === user?.id);

  return (
    <div className="agenda-meeting__body">
      {ownsMeeting && controller ? (
        <MeetingCapturePanel controller={controller} eventTitle={eventTitle} onCollapse={onCollapse} />
      ) : otherMeetingActive ? (
        <div className="agenda-meeting__notice" data-tone="gold">
          <strong>Há uma reunião em gravação</strong>: {capture?.target?.eventTitle}. Finalize-a antes de iniciar outra.
          <div className="agenda-meeting__controls agenda-meeting__controls--inline">
            <button className="agenda-meeting__button agenda-meeting__button--compact" onClick={capture?.openPanel} type="button"><Mic className="h-4 w-4" />Abrir reunião ativa</button>
          </div>
        </div>
      ) : (
        <div className="agenda-meeting__consent">
          <div className="agenda-meeting__notice">
            O áudio do microfone é enviado em partes para uma área privada, transcrito pelo Gemini 3.5 Transcribe e apagado automaticamente até 72 horas depois (ou na hora, se a reunião for excluída). O relatório é gerado pelo GPT-6.1 Sol.
          </div>
          <label className="agenda-meeting__consent-check">
            <input checked={participantsInformed} onChange={(event) => setParticipantsInformed(event.target.checked)} type="checkbox" />
            <span>Confirmo que todos os participantes foram informados de que a reunião será gravada e transcrita.</span>
          </label>
          {!canRecord && <div className="agenda-meeting__notice" data-tone="gold">Seu perfil pode consultar reuniões, mas não pode iniciar gravações.</div>}
          <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={!capture || !canRecord || !participantsInformed || starting} onClick={() => void startCapture()} type="button">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}Iniciar gravação
          </button>
        </div>
      )}

      <div className="agenda-meeting__history-heading">
        <div>
          <p className="agenda-meeting__eyebrow">Histórico do evento</p>
          <h3 className="agenda-meeting__title">Reuniões e relatórios</h3>
        </div>
        <button aria-label="Atualizar histórico" className="agenda-meeting__icon-button" disabled={sessionsQuery.isFetching} onClick={() => void sessionsQuery.refetch()} type="button">
          <RefreshCw className={cn('h-4 w-4', sessionsQuery.isFetching && 'animate-spin')} />
        </button>
      </div>
      {sessionsQuery.isError && <div className="agenda-meeting__error">Não foi possível consultar o histórico com sua sessão atual.</div>}
      <SessionHistory loading={sessionsQuery.isLoading} onSelect={setSelectedSessionId} selectedId={currentSessionId} sessions={sessionsQuery.data ?? []} />

      {currentSessionId && detailQuery.isLoading && <div className="agenda-meeting__loading"><Loader2 className="h-4 w-4 animate-spin" />Carregando reunião…</div>}
      {detailQuery.isError && <div className="agenda-meeting__error">Esta reunião não pôde ser lida com suas permissões atuais.</div>}
      {detail && (
        <SessionDetail
          busyKey={busyKey}
          canDelete={Boolean(canDeleteDetail)}
          canReview={canReview}
          detail={detail}
          editedSegments={editedSegments}
          editing={editing}
          members={membersQuery.data ?? []}
          onConfirm={setConfirm}
          onDownload={(kind, versionId) => void download(kind, versionId)}
          onRun={(action, payload, key) => void runControl(action, payload, key)}
          setEditedSegments={setEditedSegments}
          setEditing={setEditing}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent className="agenda-meeting__confirmation" overlayClassName="agenda-meeting__confirmation-overlay">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'delete-session' ? 'Excluir a sessão e todos os conteúdos?'
                : confirm?.kind === 'delete-report' ? `Excluir o relatório versão ${confirm.version}?`
                  : confirm?.kind === 'partial-report' ? 'Gerar relatório parcial?'
                    : confirm?.kind === 'accept-gaps' ? 'Seguir com lacunas?'
                      : 'Salvar correção como nova versão?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'delete-session'
                ? 'Serão apagados o áudio temporário, a transcrição, todos os relatórios, encaminhamentos e arquivos exportados desta reunião. Fica somente o registro administrativo de que houve uma exclusão.'
                : confirm?.kind === 'delete-report'
                  ? 'Apaga somente este relatório e seus PDFs. A transcrição continua disponível e nenhum relatório novo será gerado sem você pedir.'
                  : confirm?.kind === 'partial-report'
                    ? 'A transcrição não cobre toda a reunião. O relatório será marcado como PARCIAL na tela e no PDF, e nada será deduzido sobre os trechos ausentes.'
                    : confirm?.kind === 'accept-gaps'
                      ? 'As partes de áudio que faltam ficarão registradas como lacunas explícitas e a transcrição será consolidada sem elas.'
                      : 'A transcrição original não é alterada. A correção vira uma nova versão, e os relatórios antigos continuam ligados à versão que usaram.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.kind === 'delete-session' || confirm?.kind === 'delete-report' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              onClick={() => {
                const intent = confirm;
                setConfirm(null);
                if (!intent) return;
                if (intent.kind === 'delete-session') void runControl('delete', {}, 'delete');
                if (intent.kind === 'delete-report') void runControl('delete_report', { minutesVersionId: intent.minutesVersionId }, 'delete-report');
                if (intent.kind === 'partial-report') void runControl('regenerate_report', { transcriptVersionId: intent.transcriptVersionId, allowPartial: true }, 'regenerate');
                if (intent.kind === 'accept-gaps') void runControl('accept_transcription_gaps', {}, 'accept-gaps');
                if (intent.kind === 'submit-revision') submitRevision();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AgendaMeetingWorkspace({ eventId, orgId, eventTitle, persistedEvent, canRecord, canReview, canDelete, onActiveCaptureChange, className }: WorkspaceProps) {
  const capture = useOptionalMeetingCapture();
  const available = persistedEvent && Boolean(eventId && orgId);
  const boundHere = Boolean(available && capture?.target?.eventId === eventId);
  const recordingHere = Boolean(boundHere && capture?.isActive);
  const [expanded, setExpanded] = useState(recordingHere);
  const registerVisiblePanel = capture?.registerVisiblePanel;

  // Showing another event resets the panel; the event being recorded opens expanded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setExpanded(recordingHere), [eventId]);

  // Panel visibility only hides the compact bar; it never affects the capture itself.
  useEffect(() => {
    if (!expanded || !available || !eventId || !registerVisiblePanel) return;
    return registerVisiblePanel(eventId);
  }, [available, eventId, expanded, registerVisiblePanel]);

  useEffect(() => {
    onActiveCaptureChange?.(recordingHere, null);
  }, [onActiveCaptureChange, recordingHere]);

  const collapse = () => {
    setExpanded(false);
    if (recordingHere) toast.info(COLLAPSE_NOTICE);
  };

  return (
    <section className={cn('agenda-meeting', className)} data-available={available}>
      <button
        aria-expanded={expanded}
        className="agenda-meeting__launcher"
        disabled={!available}
        onClick={() => (expanded ? collapse() : setExpanded(true))}
        type="button"
      >
        <span className="agenda-meeting__mark-shell"><MeetingIntelligenceMark state={available ? (recordingHere ? 'recording' : 'idle') : 'blocked'} /></span>
        <span className="agenda-meeting__launcher-copy">
          <span className="agenda-meeting__eyebrow">Gravação, transcrição e relatório</span>
          <span className="agenda-meeting__title">Fenasoja Meeting</span>
          <span className="agenda-meeting__description">
            {!available ? 'Disponível apenas para eventos já salvos.' : recordingHere ? 'Gravação em andamento' : 'Gemini 3.5 Transcribe · GPT-6.1 Sol'}
          </span>
        </span>
        <span className="agenda-meeting__launcher-action">
          {available ? (
            expanded ? <><ChevronUp className="h-4 w-4" />Recolher</> : recordingHere ? <><Mic className="h-4 w-4" />Reabrir</> : <><ChevronDown className="h-4 w-4" />Abrir</>
          ) : <><Clock3 className="h-4 w-4" />Indisponível</>}
        </span>
      </button>
      {!available && <div className="agenda-meeting__body"><div className="agenda-meeting__notice" data-tone="gold">Salve o evento para gravar uma reunião vinculada a ele.</div></div>}
      {expanded && available && eventId && orgId && (
        <PersistedMeetingWorkspace
          canDelete={canDelete}
          canRecord={canRecord}
          canReview={canReview}
          eventId={eventId}
          eventTitle={eventTitle}
          onCollapse={collapse}
          orgId={orgId}
          persistedEvent
        />
      )}
    </section>
  );
}
