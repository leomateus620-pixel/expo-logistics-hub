import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, MapPin, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getContractSignedUrl } from '../services/commercialMapService';
import { registerPrivateContractUpload } from '../services/contractUpload';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { cessionDetail, documentStatus, signCession } from './cessionService';
import './cessions.css';

const date = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function useCessionDetail(id: string, canManageContracts: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['commercial-map', 'cession', user?.id, canManageContracts, id],
    queryFn: () => cessionDetail(id),
    staleTime: 15_000,
  });
}

export function CessionContract({
  id,
  canManageContracts,
  onClose,
  onLocate,
}: {
  id: string;
  canManageContracts: boolean;
  onClose: () => void;
  onLocate: (entityId: string) => void;
}) {
  const query = useCessionDetail(id, canManageContracts);
  const detail = query.data;
  const current = detail?.versions[0];
  const upload = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSignature, setConfirmSignature] = useState(false);
  const [error, setError] = useState('');
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await query.refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }
  async function viewFile(path: string) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await getContractSignedUrl(path);
      if (tab) tab.location.replace(url);
      else setError('Permita abrir uma nova aba para consultar o documento.');
    } catch {
      tab?.close();
      setError('Não foi possível abrir o arquivo. Confira a permissão de contratos.');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="cession-dialog">
        <DialogHeader>
          <DialogTitle>{detail?.purpose ?? 'Contrato de cessão'}</DialogTitle>
          <DialogDescription>
            {detail?.beneficiary ?? 'Venda não comercializável'} · Fenasoja 2028
          </DialogDescription>
        </DialogHeader>
        {query.isLoading && <p role="status">Carregando a operação…</p>}
        {query.isError && (
          <p role="alert">
            Não foi possível consultar a operação.{' '}
            <button onClick={() => query.refetch()}>Tentar novamente</button>
          </p>
        )}
        {detail && (
          <>
            <section className="cession-document">
              <div>
                <FileText aria-hidden="true" />
                <strong>Instrumento de cessão</strong>
              </div>
              <p>{documentStatus(detail)}</p>
              {canManageContracts && (
                <div className="cession-actions">
                  {current?.path && (
                    <Button variant="outline" onClick={() => viewFile(current.path!)}>
                      Visualizar contrato
                    </Button>
                  )}
                  <Button variant="outline" disabled={busy} onClick={() => upload.current?.click()}>
                    <Upload size={16} />
                    {current ? 'Anexar nova versão' : 'Anexar contrato'}
                  </Button>
                  <input
                    hidden
                    ref={upload}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      if (file.size > 15 * 1024 * 1024 || !file.size) {
                        setError('Escolha um PDF ou DOCX com até 15 MB.');
                        return;
                      }
                      void perform(() =>
                        registerPrivateContractUpload({
                          dir: `${detail.orgId}/cessions/${id}`,
                          file,
                          operation: 'attach_cession_contract',
                          args: { p_id: id, p_expected_version: current?.version ?? 0 },
                        }),
                      );
                    }}
                  />
                  {current && !current.signedAt && (
                    <Button variant="outline" disabled={busy} onClick={() => setConfirmSignature(true)}>
                      Registrar assinatura
                    </Button>
                  )}
                </div>
              )}
              {confirmSignature && current && !current.signedAt && (
                <div>
                  <p>Conferiu a assinatura no documento da versão {current.version}?</p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        await signCession(id, current.version);
                        setConfirmSignature(false);
                      })
                    }
                  >
                    Confirmar assinatura
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmSignature(false)}>
                    Voltar
                  </Button>
                </div>
              )}
            </section>
            <section>
              <h3>
                Lotes abrangidos <span>({detail.lots.length})</span>
              </h3>
              <ul className="cession-lines">
                {detail.lots.map((lot) => (
                  <li key={lot.id}>
                    <div>
                      <strong>{lot.code}</strong>
                      <small>{formatAreaSqmLabel(lot.area)}</small>
                    </div>
                    <span>{formatBrl(lot.value)}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Localizar ${lot.code} no mapa`}
                      onClick={() => {
                        onClose();
                        onLocate(lot.entityId);
                      }}
                    >
                      <MapPin size={17} />
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="cession-total">Sem valor comercial · {formatBrl(detail.total)}</p>
            </section>
            <details>
              <summary>Histórico da operação</summary>
              <ul className="cession-history">
                <li>Cessão registrada · {date.format(new Date(detail.createdAt))}</li>
                {detail.versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <li key={v.version}>
                      Versão {v.version} anexada · {date.format(new Date(v.uploadedAt))}
                      {v.path && canManageContracts && (
                        <button onClick={() => viewFile(v.path!)}>Consultar arquivo</button>
                      )}
                      {v.signedAt && (
                        <small>Assinatura confirmada · {date.format(new Date(v.signedAt))}</small>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
