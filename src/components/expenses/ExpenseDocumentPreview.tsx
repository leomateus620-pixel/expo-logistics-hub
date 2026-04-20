import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { FileText, Eye, ExternalLink, Loader2, FileX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocItem {
  id: string;
  file_url?: string | null;
  extraction_status?: string;
}

interface Props {
  documents: DocItem[];
}

const BUCKET = 'expense-documents';

/** Extract storage path from a signed URL or raw path. */
function extractPath(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  // Already a plain path (no protocol)
  if (!fileUrl.startsWith('http')) return fileUrl;
  // Signed URL pattern: /storage/v1/object/sign/<bucket>/<path>?token=...
  const match = fileUrl.match(/\/object\/(?:sign|public|authenticated)\/[^/]+\/(.+?)(?:\?|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isImage(path: string) {
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(path);
}
function isPdf(path: string) {
  return /\.pdf$/i.test(path);
}

interface ResolvedDoc extends DocItem {
  signedUrl?: string;
  path?: string;
  loading: boolean;
  error?: boolean;
}

export default function ExpenseDocumentPreview({ documents }: Props) {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<ResolvedDoc[]>([]);
  const [viewer, setViewer] = useState<ResolvedDoc | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const initial: ResolvedDoc[] = documents.map((d) => ({ ...d, loading: true }));
      setItems(initial);

      const resolved = await Promise.all(
        documents.map(async (d) => {
          const path = extractPath(d.file_url);
          if (!path) return { ...d, loading: false, error: true } as ResolvedDoc;
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, 3600);
          if (error || !data?.signedUrl) {
            return { ...d, path, loading: false, error: true } as ResolvedDoc;
          }
          return { ...d, path, signedUrl: data.signedUrl, loading: false } as ResolvedDoc;
        })
      );
      if (!cancel) setItems(resolved);
    })();
    return () => {
      cancel = true;
    };
  }, [documents]);

  if (!documents?.length) return null;

  const ViewerContent = () => {
    if (!viewer?.signedUrl || !viewer.path) return null;
    if (isImage(viewer.path)) {
      return (
        <div className="flex items-center justify-center bg-black/90 rounded-lg overflow-auto max-h-[80dvh]">
          <img src={viewer.signedUrl} alt="Comprovante" className="max-w-full max-h-[80dvh] object-contain" />
        </div>
      );
    }
    if (isPdf(viewer.path)) {
      return (
        <iframe src={viewer.signedUrl} title="Comprovante PDF" className="w-full h-[75dvh] rounded-lg border" />
      );
    }
    return (
      <div className="text-center p-6">
        <p className="text-sm text-muted-foreground mb-3">Tipo de arquivo não suportado para visualização inline.</p>
        <Button asChild size="sm">
          <a href={viewer.signedUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="w-4 h-4 mr-1.5" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          Comprovantes ({documents.length})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((it) => {
            const fileName = it.path?.split('/').pop() || 'documento';
            const img = it.path && isImage(it.path);
            const pdf = it.path && isPdf(it.path);

            return (
              <div
                key={it.id}
                className="rounded-lg border border-border/50 bg-background/50 overflow-hidden flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => !it.loading && !it.error && setViewer(it)}
                  disabled={it.loading || it.error}
                  className={cn(
                    'relative h-24 w-full flex items-center justify-center bg-muted/40',
                    !it.loading && !it.error && 'hover:bg-muted/60 transition-colors cursor-pointer'
                  )}
                >
                  {it.loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : it.error ? (
                    <FileX className="w-7 h-7 text-destructive/70" />
                  ) : img && it.signedUrl ? (
                    <img src={it.signedUrl} alt="thumb" className="w-full h-full object-cover" />
                  ) : pdf ? (
                    <FileText className="w-8 h-8 text-primary" />
                  ) : (
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  )}
                </button>
                <div className="p-1.5 flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground truncate flex-1" title={fileName}>
                    {fileName}
                  </span>
                  {!it.loading && !it.error && it.signedUrl && (
                    <button
                      type="button"
                      onClick={() => (pdf ? window.open(it.signedUrl, '_blank') : setViewer(it))}
                      className="text-primary hover:text-primary/80 p-0.5"
                      aria-label="Visualizar"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isMobile ? (
        <Drawer open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
          <DrawerContent className="max-h-[95dvh]">
            <div className="p-3 pb-6">
              <ViewerContent />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
          <DialogContent className="max-w-4xl p-3">
            <ViewerContent />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
