import { useMemo, useRef, useState } from 'react';
import { CalendarClock, FileLock2, Handshake, Loader2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { mapErrorMessage, useMapMutations } from '../../hooks/useCommercialMap';
import type { LotContractHistoryDocument } from '../../services/commercialMapService';
import type { CommercialLot } from '../../types';

export type LotWorkflow = 'reserve' | 'negotiate' | 'sell' | 'contract' | null;

interface Props {
  lot: CommercialLot;
  workflow: LotWorkflow;
  onClose: () => void;
  contractTarget?: {
    structureName: string;
    saleId: string;
    orderId?: string | null;
    document?: LotContractHistoryDocument;
    mode?: 'upload' | 'metadata';
  };
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
      {children}
    </div>
  );
}

export function LotWorkflowDialog({ lot, workflow, onClose, contractTarget }: Props) {
  const { orgId } = useCurrentOrg();
  const { reservation, negotiation, sale, contract, contractMetadata } = useMapMutations();
  const [companyName, setCompanyName] = useState(lot.currentBuyer ?? '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [negotiatedValue, setNegotiatedValue] = useState(lot.askingPrice ? String(lot.askingPrice) : '');
  const [salespersonName, setSalespersonName] = useState('');
  const [contractNumber, setContractNumber] = useState(contractTarget
    ? contractTarget.document?.contractNumber ?? '' : lot.activeContractNumber ?? '');
  const [paymentStatus, setPaymentStatus] = useState('PENDING');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [contractPhase, setContractPhase] = useState<'upload' | 'register' | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const submitting = useRef(false);
  const today = new Date().toISOString().slice(0, 10);
  const [saleDate, setSaleDate] = useState(today);
  const editingMetadata = workflow === 'contract' && contractTarget?.mode === 'metadata';
  const replacing = workflow === 'contract' && Boolean(contractTarget?.document) && !editingMetadata;
  const contractReference = contractTarget ? `${contractTarget.orderId ? 'PV' : 'LG'}-${(contractTarget.orderId ?? contractTarget.saleId).slice(0, 8).toUpperCase()}` : null;
  const pending = reservation.isPending || negotiation.isPending || sale.isPending || contract.isPending
    || (editingMetadata && contractMetadata.isPending);
  const contractUploadUnavailable = workflow === 'contract' && !editingMetadata && !orgId;

  const content = useMemo(() => {
    if (workflow === 'reserve') return {
      icon: CalendarClock,
      title: `Reservar ${lot.publicIdentifier}`,
      description: 'A reserva só aparecerá no mapa depois da confirmação do servidor.',
      submit: 'Confirmar reserva',
    };
    if (workflow === 'sell') return {
      icon: ShoppingBag,
      title: `Registrar venda de ${lot.publicIdentifier}`,
      description: 'O espaço ficará como Venda em aberto (amarelo) até a confirmação da assinatura do contrato. A operação gera registro de auditoria.',
      submit: 'Registrar venda em aberto',
    };
    if (workflow === 'contract') return {
      icon: FileLock2,
      title: editingMetadata ? 'Editar dados do contrato' : replacing ? 'Substituir contrato' : `Anexar contrato a ${lot.publicIdentifier}`,
      description: editingMetadata ? 'Atualize o número do contrato. A alteração fica registrada no histórico.'
        : 'O documento será armazenado em bucket privado e acessado somente por URL temporária.',
      submit: editingMetadata ? 'Salvar dados' : replacing ? 'Enviar nova versão' : 'Enviar contrato',
    };
    return {
      icon: Handshake,
      title: `Iniciar negociação de ${lot.publicIdentifier}`,
      description: 'Registre os dados comerciais antes de avançar a situação do lote.',
      submit: 'Iniciar negociação',
    };
  }, [editingMetadata, lot.publicIdentifier, replacing, workflow]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || submitting.current) return;
    submitting.current = true;
    setContractError(null);
    try {
      if (workflow === 'reserve') {
        await reservation.mutateAsync({ lotId: lot.id, companyName, documentNumber, contactName, phone, email, expiresAt: new Date(expiresAt).toISOString(), notes });
      } else if (workflow === 'negotiate') {
        await negotiation.mutateAsync({ lotId: lot.id, companyName, documentNumber, contactName, proposedValue: negotiatedValue ? Number(negotiatedValue) : null, notes });
      } else if (workflow === 'sell') {
        await sale.mutateAsync({
          lotId: lot.id,
          buyerName: companyName,
          documentNumber,
          negotiatedValue: Number(negotiatedValue),
          saleDate,
          salespersonName,
          contractNumber,
          paymentStatus,
          notes,
        });
      } else if (workflow === 'contract') {
        if (editingMetadata && contractTarget?.document) {
          await contractMetadata.mutateAsync({ lotId: lot.id, contractNumber,
            document: contractTarget.document, expectedSaleId: contractTarget.saleId });
        } else {
          if (!file || !orgId) return;
          await contract.mutateAsync({ orgId, lotId: lot.id, file, contractNumber, onProgress: setContractPhase,
            ...(contractTarget ? { expectedSaleId: contractTarget.saleId, document: contractTarget.document } : {}),
          });
        }
      }
      onClose();
    } catch (error) {
      if (workflow === 'contract') setContractError(mapErrorMessage(error));
    } finally {
      submitting.current = false;
      setContractPhase(null);
    }
  };

  const Icon = content.icon;
  return (
    <Dialog open={Boolean(workflow)} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <form onSubmit={submit} className="min-h-0 overflow-y-auto">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <DialogTitle>{content.title}</DialogTitle>
            <DialogDescription>{content.description}</DialogDescription>
          </DialogHeader>

          <div className="my-6 grid gap-4 sm:grid-cols-2">
            {workflow === 'contract' ? (
              <>
                {contractTarget && <dl className="sm:col-span-2 grid gap-1 rounded-lg bg-muted p-3 text-sm">
                  <div><dt className="inline font-semibold">Estrutura </dt><dd className="inline">{contractTarget.structureName}</dd></div>
                  <div><dt className="inline font-semibold">Ponto </dt><dd className="inline">{lot.displayName} · {lot.publicIdentifier}</dd></div>
                  <div><dt className="inline font-semibold">Venda </dt><dd className="inline">{contractReference}</dd></div>
                  {contractTarget.document?.scope === 'ORDER_ITEMS' && <div>
                    <dt className="inline font-semibold">Abrangência </dt>
                    <dd className="inline">Documento compartilhado com {contractTarget.document.coverageCount ?? contractTarget.document.lotIds.length} espaços da venda.</dd>
                  </div>}
                </dl>}
                <Field id="contract-number" label="Número do contrato">
                  <Input id="contract-number" value={contractNumber} disabled={pending} onChange={(event) => setContractNumber(event.target.value)} placeholder="Ex.: 2028-0042" />
                </Field>
                {!editingMetadata && <>
                  <Field id="contract-file" label="Arquivo (PDF ou DOCX)" required>
                    <Input id="contract-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  </Field>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">Tamanho máximo de 15 MB. Acesso privado ao arquivo.</p>
                </>}
                {contractPhase && <p className="sm:col-span-2 text-sm" role="status">
                  {contractPhase === 'upload' ? 'Enviando arquivo…' : 'Registrando o documento…'}
                </p>}
                {contractError && <p className="sm:col-span-2 text-sm text-destructive" role="alert">{contractError}</p>}
                {contractUploadUnavailable && (
                  <p className="sm:col-span-2 text-xs font-medium text-destructive" role="alert">
                    Selecione uma organização ativa para enviar o contrato com segurança.
                  </p>
                )}
              </>
            ) : (
              <>
                <Field id="company" label={workflow === 'sell' ? 'Comprador / expositor' : 'Empresa'} required>
                  <Input id="company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
                </Field>
                <Field id="document" label="CNPJ ou documento">
                  <Input id="document" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
                </Field>
                {workflow === 'reserve' && (
                  <>
                    <Field id="contact" label="Nome do contato" required>
                      <Input id="contact" value={contactName} onChange={(event) => setContactName(event.target.value)} required />
                    </Field>
                    <Field id="expires" label="Expiração da reserva" required>
                      <Input id="expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required />
                    </Field>
                    <Field id="phone" label="Telefone">
                      <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                    </Field>
                    <Field id="email" label="E-mail">
                      <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                    </Field>
                  </>
                )}
                {workflow === 'negotiate' && (
                  <>
                    <Field id="negotiation-contact" label="Nome do contato">
                      <Input id="negotiation-contact" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                    </Field>
                    <Field id="proposed-value" label="Valor proposto">
                      <Input id="proposed-value" type="number" min="0" step="0.01" value={negotiatedValue} onChange={(event) => setNegotiatedValue(event.target.value)} />
                    </Field>
                  </>
                )}
                {workflow === 'sell' && (
                  <>
                    <Field id="value" label="Valor negociado" required>
                      <Input id="value" type="number" min="0" step="0.01" value={negotiatedValue} onChange={(event) => setNegotiatedValue(event.target.value)} required />
                    </Field>
                    <Field id="sale-date" label="Data da venda" required>
                      <Input id="sale-date" type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} required />
                    </Field>
                    <Field id="salesperson" label="Responsável comercial" required>
                      <Input id="salesperson" value={salespersonName} onChange={(event) => setSalespersonName(event.target.value)} required />
                    </Field>
                    <Field id="sale-contract" label="Número do contrato">
                      <Input id="sale-contract" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} />
                    </Field>
                    <Field id="payment" label="Situação do pagamento">
                      <select id="payment" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="PENDING">Pendente</option>
                        <option value="PARTIAL">Parcial</option>
                        <option value="PAID">Pago</option>
                      </select>
                    </Field>
                  </>
                )}
                <div className="sm:col-span-2">
                  <Field id="notes" label="Observações">
                    <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
                  </Field>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button
              type="submit"
              disabled={pending || (workflow === 'contract' && (editingMetadata ? !contractTarget?.document : !file || contractUploadUnavailable))}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {content.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
