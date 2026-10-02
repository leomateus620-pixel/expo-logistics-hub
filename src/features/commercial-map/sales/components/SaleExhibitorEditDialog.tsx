import '../sales-mode.css';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDocument, formatPhoneBr, isValidDocument, isValidEmail, isValidPhoneBr } from '../salesValidation';
import { TradeNameField } from './SalesBuyerForm';
import {
  fetchSaleIdentity, updateSaleIdentity, SaleIdentityError,
  type SaleIdentity, type SaleIdentityDraft,
} from '../saleIdentityService';

export const saleIdentityQueryKey = (lotId: string) => ['commercial-map', 'sale-identity', lotId] as const;

function toDraft(identity: SaleIdentity): SaleIdentityDraft {
  return {
    buyerName: identity.buyerName,
    tradeName: identity.tradeName ?? '',
    documentNumber: identity.documentNumber ? formatDocument(identity.documentNumber) : '',
    phone: identity.phone ? formatPhoneBr(identity.phone) : '',
    email: identity.email,
  };
}

export function saleIdentityErrors(draft: SaleIdentityDraft) {
  return {
    buyerName: draft.buyerName.trim().length < 3 ? 'Informe o nome ou razão social.' : null,
    documentNumber: draft.documentNumber.trim() && !isValidDocument(draft.documentNumber) ? 'CPF ou CNPJ inválido.' : null,
    phone: draft.phone.trim() && !isValidPhoneBr(draft.phone) ? 'Informe um celular com DDD.' : null,
    email: isValidEmail(draft.email) ? null : 'E-mail inválido.',
  };
}

/**
 * Nome legal sob o nome exibido + ação "Editar dados do expositor".
 * Edição local até "Salvar alterações"; nada é persistido antes da resposta do servidor.
 */
export function SaleExhibitorIdentity({ lotId, canManageSales }: { lotId: string; canManageSales: boolean }) {
  const enabled = !lotId.startsWith('reference:');
  const identity = useQuery({ queryKey: saleIdentityQueryKey(lotId), queryFn: () => fetchSaleIdentity(lotId), enabled, staleTime: 15_000 });
  const [open, setOpen] = useState(false);
  const data = identity.data;
  return (
    <>
      {data?.tradeName && <span className="commercial-map-sale-legal-name">Razão social: {data.buyerName}</span>}
      {canManageSales && data && (
        <Button type="button" variant="outline" size="sm" className="commercial-map-sale-edit-identity" onClick={() => setOpen(true)}>
          <UserPen className="h-4 w-4" aria-hidden="true" /> Editar dados do expositor
        </Button>
      )}
      {data && open && <SaleExhibitorEditDialog lotId={lotId} identity={data} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SaleExhibitorEditDialog({ lotId, identity, onClose }: { lotId: string; identity: SaleIdentity; onClose: () => void }) {
  const queryClient = useQueryClient();
  const initial = useRef(toDraft(identity));
  const [draft, setDraft] = useState<SaleIdentityDraft>(initial.current);
  const [updateExhibitor, setUpdateExhibitor] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string>(crypto.randomUUID());
  const errors = saleIdentityErrors(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current) || updateExhibitor;

  useEffect(() => { requestId.current = crypto.randomUUID(); }, [draft, updateExhibitor]);

  const set = (patch: Partial<SaleIdentityDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true); else onClose();
  };

  const save = async () => {
    if (inFlight.current) return;
    setShowErrors(true);
    if (Object.values(errors).some(Boolean)) return;
    inFlight.current = true; setSaving(true); setError(null);
    try {
      await updateSaleIdentity({ identity, draft, updateExhibitor, requestId: requestId.current });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-map'] }),
        queryClient.invalidateQueries({ queryKey: saleIdentityQueryKey(lotId) }),
      ]);
      toast({ title: 'Dados do expositor atualizados', description: identity.affectedSpaces.length > 1 ? `${identity.affectedSpaces.length} espaços do pedido foram atualizados.` : 'A venda foi atualizada.' });
      onClose();
    } catch (failure) {
      setError(failure instanceof SaleIdentityError ? failure.message : 'Não foi possível salvar. Nenhum dado foi alterado.');
      // Resposta incerta: mantém o mesmo requestId para um reenvio idempotente.
      if (failure instanceof SaleIdentityError && !failure.uncertain) requestId.current = crypto.randomUUID();
    } finally {
      inFlight.current = false; setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => { if (!next) requestClose(); }}>
        <DialogContent className="sales-checkout-dialog sm:max-w-lg" onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Editar dados do expositor</DialogTitle>
            <DialogDescription>
              Corrige a identificação desta venda ({identity.status === 'CONFIRMED' ? 'vendido' : 'venda em aberto'}). Preços, parcelas, situação e contratos emitidos não mudam.
            </DialogDescription>
          </DialogHeader>
          <div className="sales-sheet-body">
            <div className="sales-field">
              <label htmlFor="sale-edit-name">Nome / Razão social</label>
              <Input id="sale-edit-name" value={draft.buyerName} onChange={(e) => set({ buyerName: e.target.value.toUpperCase() })} autoComplete="off" />
              {showErrors && errors.buyerName && <span className="sales-field__error">{errors.buyerName}</span>}
            </div>
            <TradeNameField id="sale-edit-trade-name" value={draft.tradeName} onChange={(tradeName) => set({ tradeName })} />
            <div className="sales-grid">
              <div className="sales-field">
                <label htmlFor="sale-edit-doc">CPF ou CNPJ</label>
                <Input id="sale-edit-doc" value={draft.documentNumber} inputMode="numeric" onChange={(e) => set({ documentNumber: formatDocument(e.target.value) })} />
                {showErrors && errors.documentNumber && <span className="sales-field__error">{errors.documentNumber}</span>}
              </div>
              {identity.orderId && (
                <div className="sales-field">
                  <label htmlFor="sale-edit-phone">Celular</label>
                  <Input id="sale-edit-phone" value={draft.phone} inputMode="tel" onChange={(e) => set({ phone: formatPhoneBr(e.target.value) })} />
                  {showErrors && errors.phone && <span className="sales-field__error">{errors.phone}</span>}
                </div>
              )}
            </div>
            {identity.orderId && (
              <div className="sales-field">
                <label htmlFor="sale-edit-email">E-mail (opcional)</label>
                <Input id="sale-edit-email" value={draft.email} inputMode="email" onChange={(e) => set({ email: e.target.value })} />
                {showErrors && errors.email && <span className="sales-field__error">{errors.email}</span>}
              </div>
            )}
            <div className="sales-field">
              <span className="sales-logo-field__note">
                {identity.affectedSpaces.length > 1
                  ? `Serão atualizados os ${identity.affectedSpaces.length} espaços deste pedido: ${identity.affectedSpaces.join(', ')}. Outros pedidos do mesmo expositor não mudam.`
                  : identity.orderId ? 'Somente este espaço e este pedido serão atualizados.' : 'Venda antiga sem pedido vinculado: somente este espaço será atualizado.'}
              </span>
            </div>
            {identity.exhibitorId && (
              <label className="sales-field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Checkbox checked={updateExhibitor} onCheckedChange={(value) => setUpdateExhibitor(value === true)} aria-label="Atualizar também o cadastro do expositor" />
                <span>Atualizar também o cadastro do expositor para futuras vendas. Desmarcado, apenas esta venda é corrigida.</span>
              </label>
            )}
            {error && <span role="alert" className="sales-field__error">{error}</span>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>As alterações não salvas nos dados do expositor serão perdidas. Nada foi gravado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
