import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_CONFIG } from '../../constants';
import { useMapMutations } from '../../hooks/useCommercialMap';
import type { CommercialLot } from '../../types';

type AvailabilityStatus = Extract<CommercialLot['status'], 'AVAILABLE' | 'BLOCKED' | 'UNAVAILABLE'>;

interface Props {
  lot: CommercialLot;
  open: boolean;
  onClose: () => void;
}

const AVAILABILITY_STATUSES: AvailabilityStatus[] = ['AVAILABLE', 'BLOCKED', 'UNAVAILABLE'];

export function LotAvailabilityDialog({ lot, open, onClose }: Props) {
  const { lotAvailability } = useMapMutations();
  const initialStatus: AvailabilityStatus = AVAILABILITY_STATUSES.includes(lot.status as AvailabilityStatus)
    ? lot.status as AvailabilityStatus
    : 'BLOCKED';
  const [status, setStatus] = useState<AvailabilityStatus>(initialStatus);
  const [reason, setReason] = useState('Atualização da disponibilidade comercial do módulo');

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus);
    setReason('Atualização da disponibilidade comercial do módulo');
  }, [initialStatus, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    try {
      await lotAvailability.mutateAsync({ lotId: lot.id, status, reason: reason.trim() });
      onClose();
    } catch {
      // Keep the dialog open after the mutation toast explains the server guard.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle>Disponibilidade de {lot.publicIdentifier}</DialogTitle>
            <DialogDescription>
              Controle a liberação operacional sem substituir os fluxos auditados de reserva, negociação e venda.
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 grid gap-4">
            <label className="grid gap-1.5">
              <Label htmlFor="module-availability">Situação *</Label>
              <select
                id="module-availability"
                value={status}
                onChange={(event) => setStatus(event.target.value as AvailabilityStatus)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {AVAILABILITY_STATUSES.map((candidate) => (
                  <option key={candidate} value={candidate}>{STATUS_CONFIG[candidate].label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <Label htmlFor="module-availability-reason">Motivo / documento de origem *</Label>
              <Textarea
                id="module-availability-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                required
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={lotAvailability.isPending}>Cancelar</Button>
            <Button type="submit" disabled={!reason.trim() || lotAvailability.isPending}>
              {lotAvailability.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar situação
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
