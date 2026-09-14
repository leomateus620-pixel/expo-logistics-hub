import { useState } from 'react';
import { createPortal } from 'react-dom';
import { collectAlvoradaDiagnostic, isAlvoradaDiagnosticRequested } from './diagnostics';

/** Outside the aria-hidden intro and retained after countdown handoff. */
export function AlvoradaDiagnostics() {
  const [report, setReport] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isAlvoradaDiagnosticRequested()) return null;
  const copy = async () => {
    setBusy(true);
    try {
      const text = JSON.stringify(await collectAlvoradaDiagnostic(), null, 2);
      setReport(text);
      try { await navigator.clipboard.writeText(text); setStatus('Diagnóstico copiado.'); }
      catch { setStatus('Cópia automática indisponível. Selecione e copie o relatório abaixo.'); }
    } catch { setStatus('Não foi possível coletar o diagnóstico.'); }
    finally { setBusy(false); }
  };
  return createPortal(
    <aside aria-label="Diagnóstico Alvorada" data-testid="alvorada-diagnostics"
      style={{ position: 'fixed', zIndex: 10000, right: 8, bottom: 8, width: 'min(360px, calc(100vw - 16px))', padding: 12, background: '#071426', color: '#fff', border: '1px solid #8095af', borderRadius: 10 }}>
      <button type="button" onClick={() => void copy()} disabled={busy} style={{ minHeight: 44 }}>Copiar diagnóstico</button>
      <p role="status" style={{ fontSize: 12 }}>{status || 'Relatório local. Nenhum dado é enviado automaticamente.'}</p>
      {report && <details><summary>Relatório técnico</summary><textarea aria-label="Relatório de diagnóstico" readOnly value={report} onFocus={event => event.currentTarget.select()} style={{ width: '100%', height: 200, color: '#071426' }} /></details>}
    </aside>, document.body,
  );
}
