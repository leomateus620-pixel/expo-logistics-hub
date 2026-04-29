import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, MessageCircle, AlertTriangle, User, Plane, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface WhatsAppGuestData {
  phone: string;
  message: string;
  url: string;
  guestName: string;
  phoneValid: boolean;
  kind?: 'guest' | 'recipient';
  recipientType?: string;
}

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
  whatsappGuests?: WhatsAppGuestData[];
  driverName?: string;
  startedAt?: string;
}

function GuestSection({ guest, isOnly }: { guest: WhatsAppGuestData; isOnly: boolean }) {
  return (
    <div className="space-y-3">
      {!isOnly && guest.guestName && (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{guest.guestName}</span>
        </div>
      )}

      <div className="rounded-xl bg-muted/50 border border-border/40 p-4">
        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {guest.message}
        </p>
      </div>

      {!guest.phoneValid && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {guest.guestName
            ? `Telefone de ${guest.guestName} inválido ou não cadastrado`
            : 'Telefone do hóspede inválido ou não cadastrado'}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 gap-1.5"
          onClick={() => {
            navigator.clipboard.writeText(guest.message);
            toast.success(guest.guestName ? `Mensagem para ${guest.guestName} copiada!` : 'Mensagem copiada!');
          }}
        >
          <Copy className="w-4 h-4" />
          Copiar
        </Button>
        <Button
          className={cn(
            'flex-1 gap-1.5',
            guest.phoneValid
              ? 'bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white'
              : 'opacity-50 cursor-not-allowed'
          )}
          disabled={!guest.phoneValid}
          onClick={() => {
            if (guest.phoneValid) {
              window.open(guest.url, '_blank');
            }
          }}
        >
          <MessageCircle className="w-4 h-4" />
          Enviar no WhatsApp
        </Button>
      </div>
    </div>
  );
}

function RecipientCard3D({ recipient, idx }: { recipient: WhatsAppGuestData; idx: number }) {
  const typeLabel =
    recipient.recipientType === 'agente_viagem' ? 'Agente de Viagem' : 'Notificação';

  return (
    <div
      className="relative animate-recipient-rise"
      style={{
        perspective: '1200px',
        animationDelay: `${200 * idx}ms`,
      }}
    >
      <div
        className="relative rounded-2xl p-5 border border-amber-400/30
                   bg-gradient-to-br from-emerald-950/80 via-emerald-900/60 to-amber-900/40
                   backdrop-blur-xl overflow-hidden
                   shadow-[0_25px_60px_-15px_rgba(242,201,76,0.4),0_8px_20px_-8px_rgba(0,100,0,0.5)]
                   transition-transform duration-300 hover:scale-[1.015]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Gold shimmer overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-0 -left-1/2 w-1/2 h-full bg-gradient-to-r from-transparent via-amber-300/20 to-transparent animate-gold-shimmer" />
        </div>

        {/* Glow halo */}
        <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-400/20 blur-3xl" />

        <div className="relative space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 shadow-[0_4px_12px_rgba(242,201,76,0.35)]">
              <Plane className="w-4 h-4 text-amber-200" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-amber-50 leading-tight">
                {recipient.guestName}
              </span>
              <Badge className="bg-amber-400/15 text-amber-200 border border-amber-400/30 text-[10px] gap-1 w-fit mt-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                {typeLabel}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl bg-emerald-950/40 border border-amber-400/20 p-3 backdrop-blur-sm">
            <p className="text-sm text-amber-50/95 whitespace-pre-wrap leading-relaxed font-medium">
              {recipient.message}
            </p>
          </div>

          {!recipient.phoneValid && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/15 border border-destructive/30 text-xs text-destructive-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Telefone de {recipient.guestName} inválido
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5 bg-amber-400/10 border-amber-400/40 text-amber-50 hover:bg-amber-400/20 hover:text-amber-50"
              onClick={() => {
                navigator.clipboard.writeText(recipient.message);
                toast.success(`Mensagem para ${recipient.guestName} copiada!`);
              }}
            >
              <Copy className="w-4 h-4" />
              Copiar
            </Button>
            <Button
              className={cn(
                'flex-1 gap-1.5 shadow-lg',
                recipient.phoneValid
                  ? 'bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white shadow-[0_8px_20px_-6px_rgba(34,197,94,0.5)]'
                  : 'opacity-50 cursor-not-allowed'
              )}
              disabled={!recipient.phoneValid}
              onClick={() => {
                if (recipient.phoneValid) window.open(recipient.url, '_blank');
              }}
            >
              <MessageCircle className="w-4 h-4" />
              Enviar no WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StartTripDialog({ open, onOpenChange, whatsappData, whatsappGuests, driverName, startedAt }: StartTripDialogProps) {
  // Determine the list of guests to render
  const allItems: WhatsAppGuestData[] = whatsappGuests && whatsappGuests.length > 0
    ? whatsappGuests
    : whatsappData
      ? [{ phone: whatsappData.phone, message: whatsappData.message, url: whatsappData.url, guestName: whatsappData.guestName, phoneValid: whatsappData.phoneValid }]
      : [];

  const guests = allItems.filter((g) => g.kind !== 'recipient');
  const recipients = allItems.filter((g) => g.kind === 'recipient');

  const resolvedStartedAt = startedAt || whatsappData?.startedAt;
  if (!resolvedStartedAt || allItems.length === 0) return null;

  const startTime = new Date(resolvedStartedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  const isMultiGuest = guests.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="w-5 h-5 text-accent" />
            Viagem Iniciada
          </DialogTitle>
          <DialogDescription>
            Iniciada às {startTime} — envie {isMultiGuest ? 'as mensagens' : 'a mensagem'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-accent/10 text-accent border-accent/20 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Em deslocamento
            </Badge>
            <span className="text-xs text-muted-foreground">às {startTime}</span>
            {isMultiGuest && (
              <Badge variant="outline" className="text-xs">
                {guests.length} hóspedes
              </Badge>
            )}
          </div>

          {guests.map((guest, idx) => (
            <div key={'g-' + guest.guestName + idx}>
              {isMultiGuest && idx > 0 && <Separator className="my-2" />}
              <GuestSection guest={guest} isOnly={!isMultiGuest} />
            </div>
          ))}

          {recipients.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <Separator className="flex-1" />
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  <Plane className="w-3.5 h-3.5" />
                  Agentes & Parceiros
                </div>
                <Separator className="flex-1" />
              </div>

              {recipients.map((rec, idx) => (
                <RecipientCard3D key={'r-' + rec.guestName + idx} recipient={rec} idx={idx} />
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
