import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseNfceQr, hasUsefulData, type NfceQrData } from '@/lib/parseNfceQr';
import { Camera, CheckCircle, AlertTriangle, RotateCcw, X, ScanLine } from 'lucide-react';

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (data: NfceQrData) => void;
}

type ScanState = 'idle' | 'scanning' | 'success' | 'error' | 'no-camera';

export default function QrScannerDialog({ open, onOpenChange, onResult }: QrScannerDialogProps) {
  const isMobile = useIsMobile();
  const [state, setState] = useState<ScanState>('idle');
  const [parsedData, setParsedData] = useState<NfceQrData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = useRef<any>(null);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanup = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    cleanup();
    setState('scanning');
    setErrorMsg('');
    setParsedData(null);

    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import('html5-qrcode');

    const readerId = 'qr-reader-container';
    const el = document.getElementById(readerId);
    if (!el) return;

    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
        (decodedText: string) => {
          const now = Date.now();
          // Block duplicate reads within 3s
          if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 3000) return;
          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;

          const data = parseNfceQr(decodedText);
          setParsedData(data);

          if (hasUsefulData(data)) {
            setState('success');
            scanner.stop().catch(() => {});
          } else {
            setState('error');
            setErrorMsg('QR lido, mas sem dados fiscais reconhecíveis. Tente outro QR Code.');
            scanner.stop().catch(() => {});
          }
        },
        () => {} // ignore scan failures (continuous)
      );
    } catch (err: any) {
      if (err?.toString?.().includes('NotAllowedError') || err?.toString?.().includes('Permission')) {
        setState('no-camera');
        setErrorMsg('Permissão de câmera negada. Habilite nas configurações do navegador.');
      } else {
        setState('error');
        setErrorMsg(err?.message || 'Erro ao iniciar câmera');
      }
    }
  }, [cleanup]);

  useEffect(() => {
    if (open) {
      // Small delay for DOM to render
      const t = setTimeout(startScanner, 300);
      return () => { clearTimeout(t); cleanup(); };
    } else {
      cleanup();
      setState('idle');
      setParsedData(null);
    }
  }, [open, startScanner, cleanup]);

  const handleUseData = () => {
    if (parsedData) {
      onResult(parsedData);
      onOpenChange(false);
    }
  };

  const handleRetry = () => {
    startScanner();
  };

  const content = (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Scanner viewport */}
      {(state === 'scanning' || state === 'idle') && (
        <div className="relative w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-black/90">
          <div id="qr-reader-container" ref={containerRef} className="w-full h-full" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <ScanLine className="w-16 h-16 text-primary/60 animate-pulse" />
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-white/70 font-medium">
            Aponte para o QR Code da nota fiscal
          </p>
        </div>
      )}

      {/* Success state */}
      {state === 'success' && parsedData && (
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">QR Code lido com sucesso!</span>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 space-y-1.5 text-sm">
            {parsedData.accessKey && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Chave</span>
                <span className="font-mono text-[10px] truncate max-w-[200px]">{parsedData.accessKey}</span>
              </div>
            )}
            {parsedData.amount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Valor</span>
                <span className="font-bold text-foreground">R$ {parsedData.amount.toFixed(2)}</span>
              </div>
            )}
            {parsedData.issuerCnpj && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">CNPJ Emissor</span>
                <span className="font-mono text-xs">{parsedData.issuerCnpj}</span>
              </div>
            )}
            {parsedData.issueDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Data</span>
                <span className="text-xs">{parsedData.issueDate}</span>
              </div>
            )}
            {parsedData.invoiceNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Nota Nº</span>
                <span className="text-xs">{parsedData.invoiceNumber}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRetry} variant="outline" className="flex-1 gap-1.5" size="sm">
              <RotateCcw className="w-3.5 h-3.5" /> Escanear outro
            </Button>
            <Button onClick={handleUseData} className="flex-1 gap-1.5" size="sm">
              <CheckCircle className="w-3.5 h-3.5" /> Usar dados
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {(state === 'error' || state === 'no-camera') && (
        <div className="w-full space-y-3 text-center">
          <div className="flex flex-col items-center gap-2 text-destructive">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
          {state === 'error' && (
            <div className="flex gap-2">
              <Button onClick={handleRetry} variant="outline" className="flex-1 gap-1.5" size="sm">
                <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
              </Button>
              {parsedData && (
                <Button onClick={handleUseData} className="flex-1 gap-1.5" size="sm">
                  Usar mesmo assim
                </Button>
              )}
            </div>
          )}
          {state === 'no-camera' && (
            <Button onClick={() => onOpenChange(false)} variant="outline" className="gap-1.5">
              <X className="w-3.5 h-3.5" /> Fechar
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Camera className="w-4 h-4" /> Escanear Nota Fiscal
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-4 h-4" /> Escanear Nota Fiscal
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
