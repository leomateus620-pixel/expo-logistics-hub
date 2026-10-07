import { useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { validateContractFile } from '../../utils/contracts';
import { attachOrderContract, describeSalesError, type SaleContract } from './salesOrdersService';
import './attach-order-contract.css';

export function AttachOrderContractDialog({ orgId, orderId, items, contract, onClose, onAttached }: {
  orgId: string;
  orderId: string;
  items: { lotId: string; label: string }[];
  contract: SaleContract | null;
  onClose: () => void;
  onAttached: () => Promise<void>;
}) {
  const initial = contract ? contract.lotIds.filter((id) => items.some((i) => i.lotId === id)) : items.map((i) => i.lotId);
  const [scope, setScope] = useState<'all' | 'selected'>(contract && initial.length !== items.length ? 'selected' : 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [file, setFile] = useState<File | null>(null);
  const [number, setNumber] = useState(contract?.contractNumber ?? '');
  const [phase, setPhase] = useState<'idle' | 'upload' | 'register' | 'refresh'>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const scopeName = useId();
  const lotIds = scope === 'all' ? items.map((i) => i.lotId) : items.filter((i) => selected.has(i.lotId)).map((i) => i.lotId);
  const currentVersion = contract?.versions.find((version) => version.version === contract.activeVersion);
  const phaseLabel = phase === 'upload' ? 'Enviando arquivo…' : phase === 'register' ? 'Registrando vínculo…' : 'Atualizando venda…';
  const fileSize = file ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(file.size / (file.size < 1048576 ? 1024 : 1048576)) : '';
  const fileType = file?.name.toLowerCase().endsWith('.pdf') ? 'PDF' : file?.name.toLowerCase().endsWith('.docx') ? 'DOCX' : 'Arquivo';

  const submit = async () => {
    if (submitting.current) return;
    if (!file) { setError('Selecione o arquivo do contrato.'); return; }
    const invalid = validateContractFile(file);
    if (invalid) { setError(invalid); return; }
    if (lotIds.length === 0) { setError('Selecione ao menos um espaço.'); return; }
    submitting.current = true; setError(null);
    try {
      await attachOrderContract({ orgId, orderId, lotIds, file, contractNumber: number, contractId: contract?.contractId ?? null,
        onProgress: (p) => { if (p !== 'done') setPhase(p); } });
      // Vínculo já persistido: fecha na hora e atualiza as listas em segundo plano.
      onClose();
      void Promise.resolve(onAttached()).catch(() => undefined);
    } catch (e) {
      setError(describeSalesError(e));
    } finally { submitting.current = false; setPhase('idle'); }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="cso-attach-overlay" />
      <div className="cso-attach-viewport">
        <Dialog.Content className="cso-attach-dialog"
          // Portal events still bubble through React to the dashboard's own focus loop.
          onKeyDown={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => { event.preventDefault(); fileInput.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); previousFocus.current?.focus(); }}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
          <header className="cso-attach-header">
            <div>
              <span className="cso-attach-eyebrow">Documento da venda</span>
              <Dialog.Title className="cso-attach-title">{contract ? 'Nova versão do contrato' : 'Anexar contrato'}</Dialog.Title>
              <Dialog.Description className="cso-attach-description">Um único arquivo para os espaços escolhidos.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="cso-attach-close" type="button" aria-label="Fechar anexação de contrato" disabled={busy}><X aria-hidden="true" /></button></Dialog.Close>
          </header>
          <form className="cso-attach-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div className="cso-attach-body">
              {contract && <div className="cso-attach-version">
                <span>Versão atual <strong>{contract.activeVersion}</strong></span>
                {currentVersion && <span className="cso-attach-current-file">{currentVersion.originalName}</span>}
                <p>O novo arquivo será registrado como uma nova versão. As anteriores continuam no histórico.</p>
              </div>}
              <section className="cso-attach-section" aria-labelledby={`${scopeName}-file-title`}>
                <h3 id={`${scopeName}-file-title`}><span aria-hidden="true">01</span> Arquivo e identificação</h3>
                <label className={`cso-attach-file${file ? ' has-file' : ''}${busy ? ' is-disabled' : ''}`}>
                  {file ? <FileText aria-hidden="true" /> : <Upload aria-hidden="true" />}
                  <span className="cso-attach-file-copy">
                    <strong>{file ? file.name : 'Selecionar arquivo do contrato'}</strong>
                    <span>{file ? `${fileType} · ${fileSize} ${file.size < 1048576 ? 'KB' : 'MB'}` : 'PDF ou DOCX · Até 15 MB'}</span>
                    {file && <span className="cso-attach-file-change">Trocar arquivo</span>}
                  </span>
                  <input ref={fileInput} type="file" aria-label={file ? `Trocar arquivo: ${file.name}` : 'Selecionar arquivo do contrato'} disabled={busy}
                    accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setError(next ? validateContractFile(next) : null); }} />
                </label>
                <label className="cso-attach-field"><span>Número do contrato <span className="cso-attach-optional">Opcional</span></span>
                  <input value={number} disabled={busy} onChange={(event) => setNumber(event.target.value)} placeholder="Informe a referência do documento" /></label>
              </section>
              <fieldset className="cso-attach-section" disabled={busy}>
                <legend><span aria-hidden="true">02</span> Abrangência do documento</legend>
                <div className="cso-attach-scope-options">
                  <label className={scope === 'all' ? 'is-selected' : ''}>
                    <input name={scopeName} type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
                    <span><strong>Toda a venda</strong><small>{items.length} {items.length === 1 ? 'espaço da venda' : 'espaços da venda'}</small></span>
                  </label>
                  <label className={scope === 'selected' ? 'is-selected' : ''}>
                    <input name={scopeName} type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} />
                    <span><strong>Escolher espaços</strong><small>Definir a abrangência</small></span>
                  </label>
                </div>
                <div className="cso-attach-coverage-heading">
                  <span>{scope === 'all' ? 'Espaços abrangidos' : 'Selecione os espaços abrangidos'}</span>
                  <strong>{lotIds.length} de {items.length}</strong>
                </div>
                {scope === 'selected' ? <ul className="cso-attach-check-list">{items.map((item) => <li key={item.lotId}><label className={selected.has(item.lotId) ? 'is-selected' : ''}>
                  <input type="checkbox" checked={selected.has(item.lotId)} onChange={(event) => setSelected((prev) => {
                    const next = new Set(prev); if (event.target.checked) next.add(item.lotId); else next.delete(item.lotId); return next;
                  })} /><span>{item.label}</span></label></li>)}</ul> :
                  <ul className="cso-attach-covered-spaces">{items.map((item) => <li key={item.lotId}>{item.label}</li>)}</ul>}
              </fieldset>
              <p className="cso-attach-note">Anexar o documento não confirma assinatura nem pagamento.</p>
            </div>
            <footer className="cso-attach-footer">
              {busy && <p className="cso-attach-state" role="status" aria-live="polite"><Loader2 aria-hidden="true" />{phaseLabel}</p>}
              {error && <p className="cso-attach-state is-error" role="alert">{error}</p>}
              <p>{lotIds.length > 0 ? <><strong>{lotIds.length} {lotIds.length === 1 ? 'espaço' : 'espaços'}</strong><span> no mesmo documento</span></> : 'Selecione ao menos um espaço'}</p>
              <div className="cso-attach-actions">
                <button type="button" className="cso-attach-cancel" disabled={busy} onClick={onClose}>Cancelar</button>
                <button type="submit" className="cso-attach-submit" disabled={busy || !file || lotIds.length === 0}>
                  {busy ? <><Loader2 aria-hidden="true" />Enviando…</> : contract ? 'Enviar nova versão' : 'Anexar contrato'}
                </button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
