import { useState } from 'react';
import { BadgeCheck, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMapMutations } from '../../hooks/useCommercialMap';
import type { MapEntity } from '../../types';

export function EntityVerificationDialog({ entity, open, onClose }: { entity: MapEntity; open: boolean; onClose: () => void }) {
  const { verification } = useMapMutations();
  const approving = entity.verificationStatus !== 'VERIFIED';
  const [reason, setReason] = useState(approving ? 'Revisão técnica da geometria e classificação' : 'Reabertura para revisão técnica');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await verification.mutateAsync({ entityId: entity.id, status: approving ? 'VERIFIED' : 'NEEDS_REVIEW', reason: reason.trim() });
      onClose();
    } catch {
      // Keep the reason available when a server gate rejects the verification.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{approving ? <BadgeCheck className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}</div>
            <DialogTitle>{approving ? `Verificar ${entity.publicIdentifier}` : `Reabrir revisão de ${entity.publicIdentifier}`}</DialogTitle>
            <DialogDescription>{approving ? 'A aprovação exige calibração válida e, para lotes, área oficial validada.' : 'A entidade volta a impedir a publicação de novas versões até ser aprovada novamente.'}</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-2"><Label htmlFor="verification-reason">Motivo / documento de origem *</Label><Textarea id="verification-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={verification.isPending}>Cancelar</Button>
            <Button type="submit" variant={approving ? 'default' : 'outline'} disabled={!reason.trim() || verification.isPending}>{verification.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{approving ? 'Confirmar verificação' : 'Reabrir revisão'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
