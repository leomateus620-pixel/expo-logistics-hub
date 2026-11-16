import { useEffect, useState } from 'react';
import { ChevronDown, CircleStop, CloudUpload, Loader2, Mic, MicOff, Pause, Play, Trash2, WifiOff } from 'lucide-react';
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
import type { AgendaMeetingCaptureController } from '@/features/agenda-meeting-intelligence/types';
import { AGENDA_MEETING_MAX_ACTIVE_DURATION_MS } from '@/features/agenda-meeting-intelligence/types';
import { cn } from '@/lib/utils';

import { CAPTURE_PHASE_LABELS, errorCodeOf, formatDuration, meetingErrorMessage } from './meetingCopy';

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function uploadStatusLabel(controller: AgendaMeetingCaptureController, online: boolean) {
  const pending = controller.state.backlog.segments;
  if (!online && pending > 0) return `Sem conexão · ${pending} parte(s) guardada(s) no aparelho`;
  if (!online) return 'Sem conexão · o áudio fica guardado no aparelho';
  if (pending > 0) return `Enviando áudio · ${pending} parte(s) na fila`;
  return 'Áudio enviado e confirmado';
}

interface MeetingCapturePanelProps {
  controller: AgendaMeetingCaptureController;
  eventTitle: string;
  onCollapse?: () => void;
  collapseLabel?: string;
}

/**
 * Capture controls bound to the app-level controller. Closing this panel only
 * changes the interface: the recording keeps running in the provider.
 */
export function MeetingCapturePanel({ controller, eventTitle, onCollapse, collapseLabel = 'Fechar painel' }: MeetingCapturePanelProps) {
  const online = useOnlineStatus();
  const [confirm, setConfirm] = useState<'finish' | 'cancel' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { state } = controller;
  const phase = state.phase;
  const canPause = phase === 'recording';
  const canResume = state.activeDurationMs < AGENDA_MEETING_MAX_ACTIVE_DURATION_MS
    && ['paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(phase);
  const canFinish = ['recording', 'paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(phase);
  const canCancel = canFinish || phase === 'fatal_error';
  const level = Math.max(0, Math.min(1, controller.mic.inputLevel ?? 0));
  const bars = Array.from({ length: 18 }, (_, index) => Math.max(0.12, Math.min(1, level * 1.8 - index * 0.035)));
  const microphoneLabel = controller.mic.devices.find((device) => device.deviceId === controller.mic.selectedDeviceId)?.label || 'Microfone padrão';

  const run = async (key: string, action: () => Promise<void>, success?: string) => {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(meetingErrorMessage(errorCodeOf(error)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Gravação da reunião" className="agenda-meeting__capture">
      <div className="agenda-meeting__capture-heading">
        <div>
          <p className="agenda-meeting__eyebrow">Reunião em gravação</p>
          <h3 className="agenda-meeting__title">{eventTitle}</h3>
        </div>
        <span className="agenda-meeting__status" data-state={phase === 'recording' ? 'recording' : 'ready'}>
          <span className="agenda-meeting__status-dot" aria-hidden="true" />
          {CAPTURE_PHASE_LABELS[phase]}
        </span>
      </div>

      {state.error && <div className="agenda-meeting__error">{meetingErrorMessage(state.error.code)}</div>}

      <div className="agenda-meeting__status-row">
        <span className="agenda-meeting__timer" aria-live="off">{formatDuration(state.activeDurationMs)}</span>
        <span className="agenda-meeting__session-meta">limite de 04:00:00 de gravação ativa</span>
      </div>
      <div
        aria-label={`Nível do microfone ${Math.round(level * 100)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(level * 100)}
        className="agenda-meeting__meter"
        role="meter"
      >
        {bars.map((scale, index) => <span key={index} style={{ opacity: 0.28 + scale * 0.72, transform: `scaleY(${phase === 'recording' ? scale : 0.12})` }} />)}
      </div>
      <div className="agenda-meeting__capture-grid">
        <div className="agenda-meeting__metric">
          <span>Microfone</span>
          <strong>{phase === 'recording' ? <Mic className="mr-1 inline h-3.5 w-3.5" /> : <MicOff className="mr-1 inline h-3.5 w-3.5" />}{microphoneLabel}</strong>
        </div>
        <div className="agenda-meeting__metric">
          <span>Envio</span>
          <strong><CloudUpload className="mr-1 inline h-3.5 w-3.5" />{uploadStatusLabel(controller, online)}</strong>
        </div>
      </div>

      {!online && (
        <div className="agenda-meeting__notice" data-tone="gold">
          <WifiOff className="mr-2 inline h-4 w-4" />
          A gravação continua sem internet enquanto houver espaço seguro (até 20 minutos de áudio pendente). Depois disso ela pausa sozinha, sem perder o que já foi gravado.
        </div>
      )}
      {(phase === 'capture_interrupted' || state.interruption) && (
        <div className="agenda-meeting__notice" data-tone="gold">
          A gravação foi interrompida pelo dispositivo ou navegador. O áudio anterior está preservado e o intervalo não gravado ficará registrado como lacuna. Retome ou finalize.
        </div>
      )}
      {phase === 'backpressure_paused' && (
        <div className="agenda-meeting__notice" data-tone="gold">
          Pausada para proteger o áudio ainda não enviado. Retome quando a conexão voltar.
        </div>
      )}

      <div className="agenda-meeting__controls">
        {canPause && (
          <button className="agenda-meeting__button" disabled={busy !== null} onClick={() => void run('pause', controller.pause)} type="button">
            {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}Pausar
          </button>
        )}
        {canResume && (
          <button className="agenda-meeting__button" disabled={busy !== null} onClick={() => void run('resume', controller.resume)} type="button">
            {busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Retomar
          </button>
        )}
        {canFinish && (
          <button className="agenda-meeting__button agenda-meeting__button--primary" disabled={busy !== null} onClick={() => setConfirm('finish')} type="button">
            <CircleStop className="h-4 w-4" />Finalizar reunião
          </button>
        )}
        {onCollapse && (
          <button className="agenda-meeting__button" onClick={onCollapse} type="button">
            <ChevronDown className="h-4 w-4" />{collapseLabel}
          </button>
        )}
      </div>
      {canCancel && (
        <button className={cn('agenda-meeting__text-button')} disabled={busy !== null} onClick={() => setConfirm('cancel')} type="button">
          <Trash2 className="h-3.5 w-3.5" />Cancelar e descartar gravação
        </button>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent className="agenda-meeting__confirmation" overlayClassName="agenda-meeting__confirmation-overlay">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'finish' ? 'Finalizar a reunião?' : 'Cancelar e descartar a gravação?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'finish'
                ? 'A gravação para, o último trecho é enviado e o Gemini 3.5 Transcribe gera a transcrição completa. Em seguida o GPT-6.1 Sol monta o relatório. Você pode fechar o painel e continuar usando a Agenda.'
                : 'O áudio desta reunião será apagado deste aparelho e do servidor. Essa ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === 'cancel' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              onClick={() => {
                const intent = confirm;
                setConfirm(null);
                if (intent === 'finish') {
                  void run('finish', () => controller.finish({ allowPartial: false }), 'Reunião finalizada. A transcrição e o relatório estão sendo gerados.');
                }
                if (intent === 'cancel') void run('cancel', controller.cancel, 'Gravação cancelada e descartada.');
              }}
            >
              {confirm === 'finish' ? 'Finalizar reunião' : 'Descartar gravação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
