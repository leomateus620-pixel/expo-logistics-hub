import { useEffect, useMemo, useState } from 'react';
import { Activity, ClipboardCheck, Copy } from 'lucide-react';
import {
  evaluateMeetingCapability,
  meetingDiagnostics,
  type MeetingDiagnosticEvent,
} from '@/features/agenda-meeting-intelligence/capture/meetingDiagnostics';

const CAPABILITY_LABEL: Record<string, string> = {
  supported_and_ready: 'Reconhecimento nativo disponível',
  supported_requires_configuration: 'Disponível, mas o contexto atual bloqueia o microfone',
  unsupported_by_runtime: 'Navegador sem reconhecimento de fala nativo',
};

const REASON_LABEL: Record<string, string> = {
  ok: 'Ambiente apto: contexto seguro, janela principal e microfone acessível.',
  insecure_context: 'A página não está em contexto seguro (HTTPS). Abra pelo endereço publicado.',
  embedded_context:
    'A tela está em uma janela incorporada (pré-visualização). Abra o sistema em uma aba própria para liberar o microfone.',
  media_devices_unavailable: 'Este navegador não expõe dispositivos de áudio para a página.',
  speech_recognition_unavailable: 'Use Google Chrome ou Microsoft Edge no computador.',
};

export function MeetingDiagnosticsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [events, setEvents] = useState<MeetingDiagnosticEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const capability = useMemo(() => evaluateMeetingCapability(), []);

  useEffect(() => meetingDiagnostics.subscribe(setEvents), []);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(meetingDiagnostics.toText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="agenda-meeting__diagnostics" open={defaultOpen}>
      <summary>
        <Activity className="h-4 w-4" />
        <span>Diagnóstico técnico da captura</span>
        <strong data-state={capability.state}>{CAPABILITY_LABEL[capability.state]}</strong>
      </summary>
      <p className="agenda-meeting__diagnostics-reason">{REASON_LABEL[capability.reason] ?? capability.reason}</p>
      <div className="agenda-meeting__diagnostics-actions">
        <button className="agenda-meeting__button" onClick={() => void copyReport()} type="button">
          {copied ? <ClipboardCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Relatório copiado' : 'Copiar relatório'}
        </button>
      </div>
      {events.length === 0 ? (
        <p className="agenda-meeting__diagnostics-empty">
          Nenhum evento registrado ainda. Inicie uma reunião para capturar a sequência real do navegador.
        </p>
      ) : (
        <ol className="agenda-meeting__diagnostics-log">
          {events.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span>+{(entry.elapsedMs / 1000).toFixed(2)}s</span>
              <code>{entry.event}</code>
              {entry.detail && (
                <em>
                  {Object.entries(entry.detail)
                    .map(([key, value]) => `${key}=${String(value)}`)
                    .join(' · ')}
                </em>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export default MeetingDiagnosticsPanel;
