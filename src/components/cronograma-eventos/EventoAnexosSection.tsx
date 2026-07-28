import { useEffect, useRef, useState } from 'react';
import { Camera, Download, ImagePlus, Loader2, Paperclip, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useEventoAnexos, type EventoAnexo } from '@/hooks/useEventoAnexos';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Props {
  eventId: string;
  className?: string;
}

const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt';

function formatSize(bytes: number) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function ThumbImage({ anexo, getSignedUrl, onOpen }: { anexo: EventoAnexo; getSignedUrl: (p: string) => Promise<string | null>; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    getSignedUrl(anexo.file_path).then((u) => {
      if (!cancel) setUrl(u);
    });
    return () => {
      cancel = true;
    };
  }, [anexo.file_path, getSignedUrl]);
  return (
    <button
      type="button"
      onClick={() => url && onOpen(url)}
      className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40 transition hover:ring-2 hover:ring-primary/60"
    >
      {url ? (
        <img src={url} alt={anexo.file_name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </button>
  );
}

export function EventoAnexosSection({ eventId, className }: Props) {
  const { anexos, isLoading, upload, uploading, remove, removing, getSignedUrl } = useEventoAnexos(eventId);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<EventoAnexo | null>(null);

  const fotos = anexos.filter((a) => a.kind === 'foto');
  const docs = anexos.filter((a) => a.kind === 'documento');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
      try {
        await upload(f);
      } catch (err: any) {
        toast({
          title: 'Falha no upload',
          description: err?.message ?? 'Não foi possível enviar o arquivo.',
          variant: 'destructive',
        });
      }
    }
    if (arr.length > 0) {
      toast({ title: 'Anexos atualizados', description: `${arr.length} arquivo(s) enviados.` });
    }
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const handleDownload = async (anexo: EventoAnexo) => {
    const url = await getSignedUrl(anexo.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    try {
      await remove(confirmRemove);
      toast({ title: 'Anexo removido' });
    } catch (err: any) {
      toast({ title: 'Falha ao remover', description: err?.message, variant: 'destructive' });
    } finally {
      setConfirmRemove(null);
    }
  };

  return (
    <section className={cn('cronograma-drawer-section border-t border-border/50 pt-5', className)} aria-labelledby="cronograma-attach-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="cronograma-section-eyebrow">Registros e comprovações</p>
          <h3 id="cronograma-attach-title" className="mt-1 flex items-center gap-2 text-sm font-black text-foreground">
            <Paperclip className="h-4 w-4 text-primary" aria-hidden />
            Anexos e fotos
            {anexos.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {anexos.length}
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Anexe fotos ou documentos para validar o registro deste evento (até 20&nbsp;MB por arquivo).
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Anexar arquivo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="rounded-lg sm:hidden"
        >
          <Camera className="h-4 w-4" />
          Foto
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando anexos…
        </div>
      ) : anexos.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          Nenhum anexo enviado. Seja o primeiro a registrar uma foto ou documento.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {fotos.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fotos</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotos.map((a) => (
                  <div key={a.id} className="relative">
                    <ThumbImage anexo={a} getSignedUrl={getSignedUrl} onOpen={(u) => setLightbox(u)} />
                    {(user?.id === a.uploaded_by) && (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(a)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
                        aria-label="Remover anexo"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <p className="mt-1 truncate text-[10px] text-muted-foreground" title={a.uploader_name ?? ''}>
                      {a.uploader_name ?? 'Anônimo'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Documentos</p>
              <ul className="space-y-2">
                {docs.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/60 p-2.5"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">{a.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.uploader_name ?? 'Anônimo'} · {formatSize(a.size_bytes)} ·{' '}
                        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.created_at))}
                      </p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => handleDownload(a)} aria-label="Baixar">
                      <Download className="h-4 w-4" />
                    </Button>
                    {user?.id === a.uploaded_by && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmRemove(a)}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {confirmRemove && (
        <AlertDialog open onOpenChange={(o) => !o && setConfirmRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover este anexo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O arquivo será excluído permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmRemove} disabled={removing}>
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
