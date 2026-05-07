import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gauge, Check, SkipForward, AlertTriangle, Car } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, nowSPLocal, ensureSPOffset } from '@/lib/utils';

export interface OdometerConfirmPayload {
  km_retirada: number | null;
  km_devolucao: number | null;
  fim_em: string; // SP offset ISO
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transport: any | null;
  vehicle: any | null;
  driverName?: string;
  estimatedKm?: number | null;
  isReturnFlow?: boolean;
  isPending?: boolean;
  onConfirm: (payload: OdometerConfirmPayload) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

export default function OdometerFinalizeSheet({
  open, onOpenChange, transport, vehicle, driverName, estimatedKm, isReturnFlow, isPending, onConfirm,
}: Props) {
  const isMobile = useIsMobile();
  const [kmSaida, setKmSaida] = useState('');
  const [kmChegada, setKmChegada] = useState('');
  const [fimEm, setFimEm] = useState('');

  useEffect(() => {
    if (open && transport) {
      setKmSaida(transport.km_retirada != null ? String(transport.km_retirada) : '');
      setKmChegada('');
      setFimEm(nowSPLocal());
    }
  }, [open, transport]);

  const lastKnownKm = vehicle?.km_atual != null ? Number(vehicle.km_atual) : null;
  const nSaida = kmSaida ? Number(kmSaida) : null;
  const nChegada = kmChegada ? Number(kmChegada) : null;
  const rodados = nSaida != null && nChegada != null ? nChegada - nSaida : null;
  const invalido = rodados != null && rodados < 0;

  const comparison = useMemo(() => {
    if (rodados == null || !estimatedKm || estimatedKm <= 0) return null;
    const diff = rodados - estimatedKm;
    const pct = (diff / estimatedKm) * 100;
    let tone: 'ok' | 'warn' | 'bad' = 'ok';
    let label = 'Dentro do esperado';
    if (Math.abs(pct) > 30) { tone = 'bad'; label = pct > 0 ? 'Muito acima' : 'Muito abaixo'; }
    else if (Math.abs(pct) > 10) { tone = 'warn'; label = pct > 0 ? 'Acima do esperado' : 'Abaixo do esperado'; }
    return { diff, pct, tone, label };
  }, [rodados, estimatedKm]);

  const handleConfirm = (skip: boolean) => {
    onConfirm({
      km_retirada: skip ? (transport?.km_retirada ?? null) : (nSaida != null && Number.isFinite(nSaida) ? nSaida : null),
      km_devolucao: skip ? null : (nChegada != null && Number.isFinite(nChegada) ? nChegada : null),
      fim_em: ensureSPOffset(fimEm || nowSPLocal()),
    });
  };

  const Body = (
    <div className="flex flex-col gap-4">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-4 shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.4)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg shadow-primary/30">
            <Gauge className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              {isReturnFlow ? 'Finalizar volta' : 'Finalizar viagem'}
            </p>
            <h3 className="text-lg font-bold truncate">Registrar odômetro</h3>
          </div>
        </div>
        {(vehicle || driverName) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {vehicle && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 backdrop-blur px-2.5 py-1 border border-border/40">
                <Car className="w-3.5 h-3.5 text-primary" />
                <span className="font-semibold">{vehicle.placa}</span>
                {vehicle.modelo && <span className="text-muted-foreground">· {vehicle.modelo}</span>}
              </span>
            )}
            {driverName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 backdrop-blur px-2.5 py-1 border border-border/40">
                👤 {driverName}
              </span>
            )}
            {lastKnownKm != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 backdrop-blur px-2.5 py-1 border border-border/40">
                Odômetro atual: <span className="font-mono font-semibold">{fmt(lastKnownKm)}</span> km
              </span>
            )}
          </div>
        )}
      </div>

      {!vehicle ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p>Este transporte não tem veículo vinculado. Você pode finalizar sem registrar odômetro.</p>
        </div>
      ) : (
        <>
          {/* KM retirada */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">KM de retirada</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder={lastKnownKm != null ? String(lastKnownKm) : 'Ex.: 12450'}
              value={kmSaida}
              onChange={(e) => setKmSaida(e.target.value)}
              className="h-14 text-2xl font-mono font-bold tabular-nums text-center"
            />
            {transport?.km_retirada != null && (
              <p className="text-[11px] text-muted-foreground">Salvo na partida: <span className="font-mono">{fmt(Number(transport.km_retirada))}</span> km</p>
            )}
          </div>

          {/* KM devolução */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">KM de devolução</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Leia o painel do veículo agora"
              value={kmChegada}
              onChange={(e) => setKmChegada(e.target.value)}
              className={cn(
                'h-14 text-2xl font-mono font-bold tabular-nums text-center',
                invalido && 'border-destructive/60 ring-2 ring-destructive/20',
              )}
              autoFocus={!isMobile}
            />
            {invalido && (
              <p className="text-[11px] text-destructive">A devolução não pode ser menor que a retirada.</p>
            )}
          </div>

          {/* Resumo vivo */}
          <div className={cn(
            'rounded-2xl border p-4 transition-all',
            rodados == null
              ? 'border-border/40 bg-muted/30'
              : invalido
                ? 'border-destructive/30 bg-destructive/10'
                : 'border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.1)]'
          )}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">KM rodados</span>
              {comparison && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] border',
                    comparison.tone === 'ok' && 'bg-success/10 text-success border-success/30',
                    comparison.tone === 'warn' && 'bg-amber-500/10 text-amber-600 border-amber-500/30',
                    comparison.tone === 'bad' && 'bg-destructive/10 text-destructive border-destructive/30',
                  )}
                >
                  {comparison.label} ({comparison.pct > 0 ? '+' : ''}{comparison.pct.toFixed(0)}%)
                </Badge>
              )}
            </div>
            <p className={cn(
              'text-3xl font-mono font-bold tabular-nums mt-1',
              rodados == null ? 'text-muted-foreground' : invalido ? 'text-destructive' : 'text-foreground',
            )}>
              {rodados == null ? '—' : fmt(rodados)} <span className="text-base font-medium text-muted-foreground">km</span>
            </p>
            {estimatedKm ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                Estimado da rota: <span className="font-mono">{fmt(Math.round(estimatedKm))}</span> km (ida e volta)
              </p>
            ) : null}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <Button
          onClick={() => handleConfirm(false)}
          disabled={isPending || invalido}
          className="h-12 rounded-xl font-semibold text-base bg-gradient-to-r from-primary to-primary/85 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
        >
          <Check className="w-5 h-5 mr-2" />
          {isReturnFlow ? 'Finalizar volta' : 'Finalizar viagem'}
        </Button>
        <Button
          onClick={() => handleConfirm(true)}
          variant="outline"
          disabled={isPending}
          className="h-11 rounded-xl text-sm"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Pular e usar KM estimado do transporte
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="liquid-glass-card rounded-t-3xl border-t border-white/10 backdrop-blur-xl max-h-[92dvh] overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <SheetHeader className="sr-only">
            <SheetTitle>Registrar odômetro</SheetTitle>
            <SheetDescription>Informe o KM final do veículo</SheetDescription>
          </SheetHeader>
          {Body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg liquid-glass-card backdrop-blur-xl border-white/10 rounded-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Registrar odômetro</DialogTitle>
          <DialogDescription>Informe o KM final do veículo</DialogDescription>
        </DialogHeader>
        {Body}
      </DialogContent>
    </Dialog>
  );
}
