import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { HistoryImage } from './mediaTypes';

export default function HistoryImageViewer({ image, onClose, returnFocus }: { image: HistoryImage; onClose: () => void; returnFocus: () => void }) {
  const [failed, setFailed] = useState(false);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="fenasoja-history-viewer" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}
      onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
      <DialogTitle>Fotografia completa</DialogTitle>
      {failed ? <p role="status">Não foi possível carregar a fotografia ampliada.</p> : <img src={image.fullSrc} alt={image.alt} width={image.width} height={image.height} decoding="async" onError={() => setFailed(true)} />}
      <DialogDescription>{image.caption} Crédito: {image.credit || 'autoria não identificada'}{image.collection ? ` · Acervo: ${image.collection}` : ''}.</DialogDescription>
    </DialogContent>
  </Dialog>;
}
