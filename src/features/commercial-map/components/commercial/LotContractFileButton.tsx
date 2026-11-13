import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getContractSignedUrl } from '../../services/commercialMapService';
import type { SaleContractVersion } from '../../dashboard/salesOrders/salesOrdersService';
import { mapErrorMessage } from '../../hooks/useCommercialMap';

export function LotContractFileButton({ version, children = 'Abrir contrato', className }: {
  version: Pick<SaleContractVersion, 'storagePath' | 'originalName' | 'mimeType'>;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const pdf = version.mimeType === 'application/pdf';
  useEffect(() => () => { request.current++; }, []);

  async function authorize(download = !pdf) {
    const currentRequest = ++request.current;
    setError(null);
    setLoading(true);
    try {
      const authorizedUrl = await getContractSignedUrl(version.storagePath, download ? version.originalName : undefined);
      if (currentRequest !== request.current) return;
      if (download) {
        const link = document.createElement('a');
        link.href = authorizedUrl;
        link.download = version.originalName;
        link.click();
      } else {
        setUrl(authorizedUrl);
      }
    } catch (failure) {
      if (currentRequest === request.current) setError(mapErrorMessage(failure));
    } finally {
      if (currentRequest === request.current) setLoading(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next && pdf) void authorize();
    if (!next) {
      request.current++;
      setUrl(null);
      setError(null);
      setLoading(false);
    }
  }}>
    <DialogTrigger asChild>
      <button ref={trigger} type="button" className={className}>{children}</button>
    </DialogTrigger>
    <DialogContent className={pdf ? 'max-w-4xl bg-card' : 'bg-card'} onCloseAutoFocus={(event) => {
      if (trigger.current?.isConnected) {
        event.preventDefault();
        trigger.current.focus({ preventScroll: true });
      }
    }}>
      <DialogHeader className="pr-10">
        <DialogTitle>Contrato da venda</DialogTitle>
        <DialogDescription className="break-all">{version.originalName}</DialogDescription>
      </DialogHeader>
      {loading && <p role="status">Solicitando acesso temporário…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {open && pdf && url && <iframe className="h-[62dvh] min-h-0 w-full rounded-md border"
        title={`Prévia de ${version.originalName}`} src={url} referrerPolicy="no-referrer" />}
      <DialogFooter>
        {pdf && url && <Button asChild variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">Abrir em outra aba</a>
        </Button>}
        {pdf && !url && error && <Button variant="outline" disabled={loading} onClick={() => void authorize(false)}>Tentar novamente</Button>}
        <Button variant={pdf ? 'outline' : 'default'} disabled={loading} onClick={() => void authorize(true)}>Baixar contrato</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
