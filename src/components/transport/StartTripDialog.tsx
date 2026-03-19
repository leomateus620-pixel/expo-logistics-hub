import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, MessageCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StartTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  whatsappData: {
    phone: string;
    message: string;
    url: string;
    guestName: string;
    driverName: string;
    startedAt: string;
    phoneValid: boolean;
  } | null;
}

export default function StartTripDialog({ open, onOpenChange, whatsappData }: StartTripDialogProps) {
  if (!whatsappData) return null;

  const startTime = new Date(whatsappData.startedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="w-5 h-5 text-accent" />
            Viagem Iniciada
          </DialogTitle>
          <DialogDescription>
            Iniciada às {startTime} — envie a mensagem ao hóspede
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <Badge className="bg-accent/10 text-accent border-accent/20 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Em deslocamento
            </Badge>
            <span className="text-xs text-muted-foreground">às {startTime}</span>
          </div>

          {/* Message preview */}
          <div className="rounded-xl bg-muted/50 border border-border/40 p-4">
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {whatsappData.message}
            </p>
          </div>

          {/* Phone warning */}
          {!whatsappData.phoneValid && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Telefone do hóspede inválido ou não cadastrado
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(whatsappData.message);
                toast.success('Mensagem copiada!');
              }}
            >
              <Copy className="w-4 h-4" />
              Copiar
            </Button>
            <Button
              className={cn(
                'flex-1 gap-1.5',
                whatsappData.phoneValid
                  ? 'bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white'
                  : 'opacity-50 cursor-not-allowed'
              )}
              disabled={!whatsappData.phoneValid}
              onClick={() => {
                if (whatsappData.phoneValid) {
                  window.open(whatsappData.url, '_blank');
                }
              }}
            >
              <MessageCircle className="w-4 h-4" />
              Enviar no WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
