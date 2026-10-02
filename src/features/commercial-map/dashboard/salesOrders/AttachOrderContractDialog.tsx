import { useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { validateContractFile } from '../../utils/contracts';
import { attachOrderContract, describeSalesError, type SaleContract } from './salesOrdersService';

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
  const lotIds = scope === 'all' ? items.map((i) => i.lotId) : items.filter((i) => selected.has(i.lotId)).map((i) => i.lotId);

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
      setPhase('refresh');
      await onAttached();
      onClose();
    } catch (e) {
      setError(describeSalesError(e));
    } finally { submitting.current = false; setPhase('idle'); }
  };

  return <div className="cso-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="cso-dialog" role="dialog" aria-modal="true" aria-labelledby="cso-attach-title">
      <header><h3 id="cso-attach-title">{contract ? 'Nova versão do contrato' : 'Anexar contrato'}</h3>
        <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
      <fieldset disabled={busy}>
        <legend>Abrangência</legend>
        <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />Toda a venda ({items.length} espaços)</label>
        <label><input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} />Espaços selecionados</label>
        {scope === 'selected' && <ul className="cso-check-list">{items.map((i) => <li key={i.lotId}><label>
          <input type="checkbox" checked={selected.has(i.lotId)} onChange={(e) => setSelected((prev) => {
            const next = new Set(prev); if (e.target.checked) next.add(i.lotId); else next.delete(i.lotId); return next;
          })} />{i.label}</label></li>)}</ul>}
      </fieldset>
      <label className="cso-field">Número do contrato (opcional)
        <input value={number} disabled={busy} onChange={(e) => setNumber(e.target.value)} /></label>
      <label className="cso-field">Arquivo (PDF ou DOCX, até 15 MB)
        <input type="file" disabled={busy} accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} /></label>
      <p className="cso-note">Um único arquivo é vinculado a todos os espaços escolhidos. Anexar não confirma assinatura nem pagamento.</p>
      {busy && <p className="cso-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" />
        {phase === 'upload' ? 'Enviando arquivo…' : phase === 'register' ? 'Registrando vínculo…' : 'Atualizando venda…'}</p>}
      {error && <p className="cso-state is-error" role="alert">{error}</p>}
      <footer>
        <button type="button" className="cso-link" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="cso-view" disabled={busy || !file || lotIds.length === 0} onClick={submit}>{contract ? 'Enviar nova versão' : 'Anexar'}</button>
      </footer>
    </div>
  </div>;
}
