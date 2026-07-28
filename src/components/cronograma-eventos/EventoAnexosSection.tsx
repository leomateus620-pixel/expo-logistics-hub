import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Download,
  Eye,
  FileImage,
  FileText,
  ImagePlus,
  Loader2,
  MoreVertical,
  Paperclip,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEventoAnexos, type EventoAnexo } from "@/hooks/useEventoAnexos";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import "@/styles/cronograma-attachments.css";

interface Props {
  eventId: string;
  className?: string;
}

type UploadPhase = "idle" | "uploading" | "success" | "error";

interface UploadFeedback {
  phase: UploadPhase;
  message: string;
  buttonLabel?: string;
}

const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt";
export const SOYBEAN_ANIMATION_DURATION_MS = 1_300;

const INITIAL_FEEDBACK: UploadFeedback = {
  phase: "idle",
  message: "Envio protegido pelas permissões deste evento.",
};

const SOYBEAN_FLIGHTS = [
  { delay: 0, y: 66, shift: -19, scale: 0.72, rotate: -76, opacity: 0.72 },
  { delay: 55, y: 35, shift: 14, scale: 0.94, rotate: 58, opacity: 0.92 },
  { delay: 120, y: 76, shift: -25, scale: 0.82, rotate: -38, opacity: 0.84 },
  { delay: 175, y: 48, shift: 7, scale: 1.08, rotate: 91, opacity: 1 },
  { delay: 235, y: 24, shift: 19, scale: 0.68, rotate: -112, opacity: 0.7 },
  { delay: 300, y: 63, shift: -12, scale: 0.9, rotate: 42, opacity: 0.9 },
  { delay: 355, y: 39, shift: 18, scale: 0.76, rotate: 132, opacity: 0.78 },
  { delay: 380, y: 72, shift: -20, scale: 1, rotate: -64, opacity: 0.96 },
] as const;

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatUploadDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getFileTypeLabel(anexo: EventoAnexo) {
  const mime = anexo.mime_type.toLowerCase();
  const extension = anexo.file_name.split(".").pop()?.toLowerCase();

  if (anexo.kind === "foto" || mime.startsWith("image/")) return "Imagem";
  if (mime.includes("pdf") || extension === "pdf") return "PDF";
  if (mime.includes("word") || extension === "doc" || extension === "docx")
    return "Word";
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    extension === "xls" ||
    extension === "xlsx"
  )
    return "Excel";
  if (mime.startsWith("text/") || extension === "txt") return "Texto";
  return "Documento";
}

function SoybeanGrain({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      className={cn("cronograma-attachments__soybean", className)}
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M3.1 10.1C3.4 5 7.5 1.8 13 2.2c5.9.4 11.1 4.3 11.6 8.5.5 4.1-3.7 7.1-9.5 7.1-6.2 0-12.3-3.1-12-7.7Z"
        fill="#F6C84F"
        stroke="#9E6314"
        strokeWidth="1.25"
      />
      <path
        d="M4.5 12.2c2.9 3.8 9.7 5.2 15 2.8-2.2 2.2-5.9 3.1-9.4 2.1-2.8-.8-4.8-2.5-5.6-4.9Z"
        fill="#C9821C"
        opacity=".34"
      />
      <path
        d="M7.3 6.2c2.1-2 5.4-2.7 8.4-1.8"
        fill="none"
        stroke="#FFF2AA"
        strokeLinecap="round"
        strokeWidth="1.45"
        opacity=".9"
      />
      <ellipse
        cx="14.7"
        cy="10.8"
        rx="2.45"
        ry="1.05"
        fill="#9A5A12"
        opacity=".76"
        transform="rotate(18 14.7 10.8)"
      />
      <ellipse
        cx="14.3"
        cy="10.35"
        rx="1.05"
        ry=".38"
        fill="#FFE08A"
        opacity=".7"
        transform="rotate(18 14.3 10.35)"
      />
    </svg>
  );
}

function SoybeanBurst({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span
      className="cronograma-attachments__soybean-layer"
      aria-hidden="true"
      data-testid="soybean-burst"
    >
      {SOYBEAN_FLIGHTS.map((flight) => (
        <span
          key={`${flight.delay}-${flight.y}`}
          className="cronograma-attachments__soybean-flight"
          style={
            {
              "--soy-delay": `${flight.delay}ms`,
              "--soy-y": `${flight.y}%`,
              "--soy-shift": `${flight.shift}px`,
              "--soy-scale": flight.scale,
              "--soy-rotate": `${flight.rotate}deg`,
              "--soy-opacity": flight.opacity,
            } as CSSProperties
          }
        >
          <SoybeanGrain />
        </span>
      ))}
      <span className="cronograma-attachments__reduced-feedback">
        <SoybeanGrain />
      </span>
    </span>
  );
}

function AttachmentThumbnail({
  anexo,
  getSignedUrl,
  onOpen,
}: {
  anexo: EventoAnexo;
  getSignedUrl: (path: string) => Promise<string | null>;
  onOpen: (url: string, trigger: HTMLButtonElement) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSignedUrl(anexo.file_path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anexo.file_path, getSignedUrl]);

  return (
    <button
      type="button"
      onClick={(event) => url && onOpen(url, event.currentTarget)}
      disabled={!url}
      className="cronograma-attachments__thumbnail focus-ring"
      aria-label={`Visualizar ${anexo.file_name}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : loading ? (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <FileImage
          className="h-5 w-5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function EventoAnexosSection({ eventId, className }: Props) {
  const {
    anexos,
    isLoading,
    upload,
    uploading,
    remove,
    removing,
    getSignedUrl,
  } = useEventoAnexos(eventId);
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const menuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const soybeanTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const soybeanActiveRef = useRef(false);
  const titleId = useId();
  const guidanceId = useId();
  const statusId = useId();
  const [lightbox, setLightbox] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<EventoAnexo | null>(null);
  const [soybeanActive, setSoybeanActive] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>(INITIAL_FEEDBACK);

  const canUpload = Boolean(user);
  const effectivePhase: UploadPhase = uploading ? "uploading" : feedback.phase;
  const uploadBusy = effectivePhase === "uploading";
  const statusMessage = !canUpload
    ? "Faça login para anexar arquivos a este evento."
    : uploading && feedback.phase !== "uploading"
      ? "Enviando arquivo…"
      : feedback.message;

  const buttonLabel = !canUpload
    ? "Acesso necessário"
    : uploadBusy
      ? "Enviando…"
      : (feedback.buttonLabel ?? "Anexar arquivo");

  useEffect(() => {
    return () => {
      if (soybeanTimerRef.current !== null)
        window.clearTimeout(soybeanTimerRef.current);
      if (feedbackTimerRef.current !== null)
        window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const startSoybeanAnimation = () => {
    if (soybeanActiveRef.current) return;
    soybeanActiveRef.current = true;
    setSoybeanActive(true);
    soybeanTimerRef.current = window.setTimeout(() => {
      soybeanActiveRef.current = false;
      soybeanTimerRef.current = null;
      setSoybeanActive(false);
    }, SOYBEAN_ANIMATION_DURATION_MS);
  };

  const scheduleIdleFeedback = () => {
    if (feedbackTimerRef.current !== null)
      window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(INITIAL_FEEDBACK);
      feedbackTimerRef.current = null;
    }, 2_400);
  };

  const openFilePicker = () => {
    fileRef.current?.click();
    startSoybeanAnimation();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }

    const selectedFiles = Array.from(files);
    const failures: Array<{ fileName: string; message: string }> = [];
    let successCount = 0;

    for (const [index, file] of selectedFiles.entries()) {
      setFeedback({
        phase: "uploading",
        message: `Enviando ${index + 1} de ${selectedFiles.length}: ${file.name}`,
      });
      try {
        await upload(file);
        successCount += 1;
      } catch (error: unknown) {
        failures.push({
          fileName: file.name,
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível enviar o arquivo.",
        });
      }
    }

    if (failures.length === 0) {
      const message =
        successCount === 1
          ? "Arquivo anexado com sucesso."
          : `${successCount} arquivos anexados com sucesso.`;
      setFeedback({
        phase: "success",
        message,
        buttonLabel:
          successCount === 1 ? "Arquivo anexado" : "Arquivos anexados",
      });
      toast({
        title: successCount === 1 ? "Arquivo anexado" : "Arquivos anexados",
        description: message,
      });
      scheduleIdleFeedback();
    } else {
      const firstFailure = failures[0];
      const prefix =
        successCount > 0
          ? `${successCount} de ${selectedFiles.length} arquivos foram anexados. `
          : "";
      const message = `${prefix}Falha em ${firstFailure.fileName}: ${firstFailure.message}`;
      setFeedback({
        phase: "error",
        message,
        buttonLabel: "Tentar novamente",
      });
      toast({
        title:
          successCount > 0
            ? "Envio concluído com pendência"
            : "Falha no upload",
        description: message,
        variant: "destructive",
      });
    }

    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const handleOpen = async (
    anexo: EventoAnexo,
    trigger?: HTMLElement | null,
  ) => {
    const url = await getSignedUrl(anexo.file_path);
    if (!url) {
      toast({
        title: "Arquivo indisponível",
        description: "Não foi possível abrir este anexo agora.",
        variant: "destructive",
      });
      return;
    }
    if (anexo.kind === "foto") {
      previewTriggerRef.current = trigger ?? null;
      setLightbox({ url, name: anexo.file_name });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async (anexo: EventoAnexo) => {
    const url = await getSignedUrl(anexo.file_path);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    toast({
      title: "Download indisponível",
      description: "Não foi possível preparar este arquivo para download.",
      variant: "destructive",
    });
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    try {
      await remove(confirmRemove);
      toast({ title: "Anexo removido" });
    } catch (error: unknown) {
      toast({
        title: "Falha ao remover",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível remover o anexo.",
        variant: "destructive",
      });
    } finally {
      setConfirmRemove(null);
    }
  };

  const renderStatusIcon = () => {
    if (!canUpload || effectivePhase === "error")
      return <AlertCircle aria-hidden="true" />;
    if (effectivePhase === "uploading")
      return <Loader2 className="animate-spin" aria-hidden="true" />;
    if (effectivePhase === "success") return <Check aria-hidden="true" />;
    return <ShieldCheck aria-hidden="true" />;
  };

  return (
    <section
      className={cn(
        "cronograma-attachments cronograma-drawer-section border-t border-border/50 pt-5",
        className,
      )}
      aria-labelledby={titleId}
      aria-busy={uploadBusy}
    >
      <p className="cronograma-section-eyebrow">Registros e comprovações</p>

      <div className="cronograma-attachments__surface">
        <header className="cronograma-attachments__header">
          <span
            className="cronograma-attachments__heading-icon"
            aria-hidden="true"
          >
            <Paperclip />
          </span>
          <div className="min-w-0 flex-1">
            <div className="cronograma-attachments__title-row">
              <h3 id={titleId}>Anexos e fotos</h3>
              {anexos.length > 0 && (
                <span
                  className="cronograma-attachments__count"
                  aria-label={`${anexos.length} ${anexos.length === 1 ? "anexo" : "anexos"}`}
                >
                  {anexos.length}
                </span>
              )}
            </div>
            <p id={guidanceId} className="cronograma-attachments__guidance">
              Registre fotos e documentos que comprovem as informações deste
              evento.
            </p>
            <div
              className="cronograma-attachments__formats"
              aria-label="Formatos e limite aceitos"
            >
              <span>Imagens, PDF, Word, Excel ou TXT</span>
              <span>Até 20 MB por arquivo</span>
            </div>
          </div>
        </header>

        <div className="cronograma-attachments__actions">
          <Button
            type="button"
            size="sm"
            onClick={openFilePicker}
            disabled={!canUpload || uploadBusy}
            className="cronograma-attachments__upload-button"
            data-state={effectivePhase}
            data-soy-active={soybeanActive ? "true" : "false"}
            aria-describedby={`${guidanceId} ${statusId}`}
            aria-busy={uploadBusy}
          >
            <SoybeanBurst active={soybeanActive} />
            <span className="cronograma-attachments__upload-content">
              {uploadBusy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : effectivePhase === "success" ? (
                <Check aria-hidden="true" />
              ) : effectivePhase === "error" || !canUpload ? (
                <AlertCircle aria-hidden="true" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
              <span>{buttonLabel}</span>
            </span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => cameraRef.current?.click()}
            disabled={!canUpload || uploadBusy}
            className="cronograma-attachments__camera-button sm:hidden"
            aria-describedby={statusId}
          >
            <Camera aria-hidden="true" />
            Tirar foto
          </Button>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            tabIndex={-1}
            aria-label="Selecionar arquivos para anexar"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-label="Tirar foto para anexar"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </div>

        <div className="cronograma-attachments__status-wrap">
          <p
            id={statusId}
            className="cronograma-attachments__status"
            data-state={!canUpload ? "error" : effectivePhase}
            role={effectivePhase === "error" || !canUpload ? "alert" : "status"}
            aria-live={
              effectivePhase === "error" || !canUpload ? "assertive" : "polite"
            }
            aria-atomic="true"
          >
            {renderStatusIcon()}
            <span>{statusMessage}</span>
          </p>
          {uploadBusy && (
            <span
              className="cronograma-attachments__progress"
              aria-hidden="true"
            >
              <span />
            </span>
          )}
        </div>

        <div className="cronograma-attachments__content">
          {isLoading ? (
            <div
              className="cronograma-attachments__loading"
              aria-label="Carregando anexos"
              aria-busy="true"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>Carregando anexos…</span>
            </div>
          ) : anexos.length === 0 ? (
            <div className="cronograma-attachments__empty">
              <span
                className="cronograma-attachments__empty-icon"
                aria-hidden="true"
              >
                <FileImage />
              </span>
              <div>
                <p>Nenhum anexo enviado ainda</p>
                <span>Seja o primeiro a registrar uma foto ou documento.</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="cronograma-attachments__list-heading">
                <p>Arquivos anexados</p>
                <span>
                  {anexos.length === 1 ? "1 item" : `${anexos.length} itens`}
                </span>
              </div>
              <ul
                className="cronograma-attachments__list"
                aria-label="Arquivos anexados ao evento"
              >
                {anexos.map((anexo) => {
                  const canDelete = user?.id === anexo.uploaded_by;
                  return (
                    <li key={anexo.id} className="cronograma-attachments__item">
                      {anexo.kind === "foto" ? (
                        <AttachmentThumbnail
                          anexo={anexo}
                          getSignedUrl={getSignedUrl}
                          onOpen={(url, trigger) => {
                            previewTriggerRef.current = trigger;
                            setLightbox({ url, name: anexo.file_name });
                          }}
                        />
                      ) : (
                        <span
                          className="cronograma-attachments__document-icon"
                          aria-hidden="true"
                        >
                          <FileText />
                        </span>
                      )}

                      <div className="cronograma-attachments__file-info">
                        <p
                          className="cronograma-attachments__file-name"
                          title={anexo.file_name}
                        >
                          {anexo.file_name}
                        </p>
                        <p className="cronograma-attachments__file-meta">
                          <span>{getFileTypeLabel(anexo)}</span>
                          <span aria-hidden="true">•</span>
                          <span>{formatSize(anexo.size_bytes)}</span>
                        </p>
                        <p className="cronograma-attachments__file-meta cronograma-attachments__file-provenance">
                          <span>
                            {anexo.uploader_name ?? "Usuário não identificado"}
                          </span>
                          <span aria-hidden="true">•</span>
                          <span>{formatUploadDate(anexo.created_at)}</span>
                          {!canDelete && (
                            <span className="cronograma-attachments__readonly">
                              Exclusão restrita
                            </span>
                          )}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            ref={(node) => {
                              if (node)
                                menuTriggerRefs.current.set(anexo.id, node);
                              else menuTriggerRefs.current.delete(anexo.id);
                            }}
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="cronograma-attachments__menu-trigger"
                            aria-label={`Ações para ${anexo.file_name}`}
                          >
                            <MoreVertical aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          collisionPadding={12}
                          className="w-56"
                        >
                          <DropdownMenuItem
                            onSelect={() =>
                              void handleOpen(
                                anexo,
                                menuTriggerRefs.current.get(anexo.id),
                              )
                            }
                          >
                            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                            {anexo.kind === "foto"
                              ? "Visualizar imagem"
                              : "Abrir arquivo"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void handleDownload(anexo)}
                          >
                            <Download
                              className="mr-2 h-4 w-4"
                              aria-hidden="true"
                            />
                            Baixar arquivo
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!canDelete || removing}
                            onSelect={() =>
                              canDelete && setConfirmRemove(anexo)
                            }
                            className={cn(
                              canDelete &&
                                "text-destructive focus:text-destructive",
                            )}
                          >
                            <Trash2
                              className="mr-2 h-4 w-4"
                              aria-hidden="true"
                            />
                            <span className="flex min-w-0 flex-col">
                              <span>
                                {removing && canDelete
                                  ? "Excluindo…"
                                  : "Excluir anexo"}
                              </span>
                              {!canDelete && (
                                <span className="text-[10px] font-normal">
                                  Somente quem anexou pode excluir
                                </span>
                              )}
                            </span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(lightbox)}
        onOpenChange={(open) => !open && setLightbox(null)}
      >
        {lightbox && (
          <DialogContent
            className="cronograma-attachments__lightbox-content [&>button:last-child]:hidden"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              previewTriggerRef.current?.focus();
            }}
          >
            <DialogTitle className="sr-only">
              Visualização de {lightbox.name}
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                className="cronograma-attachments__lightbox-close focus-ring"
                aria-label="Fechar visualização"
              >
                <X />
              </button>
            </DialogClose>
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="cronograma-attachments__lightbox-image"
            />
          </DialogContent>
        )}
      </Dialog>

      {confirmRemove && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setConfirmRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover este anexo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O arquivo será excluído
                permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleConfirmRemove()}
                disabled={removing}
              >
                {removing ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
