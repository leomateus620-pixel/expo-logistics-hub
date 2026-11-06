import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VolunteerPhoto } from "./types";

export function VolunteerPhotoPicker({
  value,
  currentUrl,
  onChange,
  onCroppingChange,
  disabled = false,
}: {
  value: VolunteerPhoto | null | undefined;
  currentUrl?: string | null;
  onChange: (photo: VolunteerPhoto | null) => void;
  onCroppingChange?: (cropping: boolean) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1),
    [x, setX] = useState(0.5),
    [y, setY] = useState(0.5);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (value?.preview) URL.revokeObjectURL(value.preview);
    },
    [value?.preview],
  );
  useEffect(() => {
    onCroppingChange?.(!!source || loading);
  }, [source, loading, onCroppingChange]);
  const choose = async (file?: File) => {
    if (!file) return;
    setError("");
    if (/heic|heif/i.test(file.type + " " + file.name)) {
      setError(
        "Converta a foto HEIC/HEIF para JPEG, PNG ou WebP antes de selecionar. No iPhone, use o formato Mais Compatível.",
      );
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("A foto deve ter até 8 MB.");
      return;
    }
    setLoading(true);
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (
        bitmap.width < 64 ||
        bitmap.height < 64 ||
        bitmap.width * bitmap.height > 12_000_000 ||
        Math.max(bitmap.width, bitmap.height) > 6000
      ) {
        bitmap.close();
        throw new Error(
          "Use uma foto de pelo menos 64 px e até 12 megapixels (máximo de 6000 px por lado).",
        );
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("Não foi possível abrir esta foto.")),
          "image/jpeg",
          0.9,
        ),
      );
      setSource({
        file,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
      });
      setZoom(1);
      setX(0.5);
      setY(0.5);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível abrir esta foto. Escolha outro arquivo.",
      );
    } finally {
      setLoading(false);
    }
  };
  const size = source ? Math.min(source.width, source.height) / zoom : 1;
  const crop = {
    x: source ? (source.width - size) * x : 0,
    y: source ? (source.height - size) * y : 0,
    size,
  };
  const apply = async () => {
    if (!source) return;
    setLoading(true);
    try {
      const img = new Image();
      img.src = source.url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      canvas
        .getContext("2d")!
        .drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, 256, 256);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Falha ao recortar a foto.")),
          "image/webp",
          0.85,
        ),
      );
      onChange({ file: source.file, crop, preview: URL.createObjectURL(blob) });
      setSource(null);
    } catch {
      setError("Não foi possível enquadrar esta foto. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="vt-photo">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.heic,.heif"
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {source ? (
        <div className="vt-crop">
          <p className="font-medium">Enquadre a foto</p>
          <p className="text-sm text-muted-foreground">
            Arraste a imagem ou use os ajustes abaixo.
          </p>
          <div
            className="vt-crop__viewport"
            role="img"
            aria-label="Prévia do recorte circular"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                offsetX: x,
                offsetY: y,
              };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const scale = 256 / size;
              setX(
                Math.min(
                  1,
                  Math.max(
                    0,
                    drag.current.offsetX -
                      (e.clientX - drag.current.x) /
                        Math.max(1, (source.width - size) * scale),
                  ),
                ),
              );
              setY(
                Math.min(
                  1,
                  Math.max(
                    0,
                    drag.current.offsetY -
                      (e.clientY - drag.current.y) /
                        Math.max(1, (source.height - size) * scale),
                  ),
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <img
              src={source.url}
              alt=""
              draggable={false}
              style={{
                width: (source.width * 256) / size,
                height: (source.height * 256) / size,
                left: (-crop.x * 256) / size,
                top: (-crop.y * 256) / size,
                maxWidth: "none",
              }}
            />
            <span className="vt-crop__mask" />
          </div>
          <label className="vt-range">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step=".01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label className="vt-range">
            Horizontal
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </label>
          <label className="vt-range">
            Vertical
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSource(null)}
            >
              Cancelar recorte
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              Trocar
            </Button>
            <Button
              type="button"
              onClick={() => void apply()}
              disabled={loading}
            >
              Usar foto
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="vt-photo__preview">
            {value?.preview || (value === undefined && currentUrl) ? (
              <img
                src={value?.preview ?? currentUrl!}
                alt="Prévia da foto do voluntário"
              />
            ) : (
              <Camera aria-hidden="true" />
            )}
          </div>
          <div className="grid gap-1">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={disabled || loading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {value || currentUrl ? "Trocar foto" : "Adicionar foto"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || loading}
                onClick={() => cameraRef.current?.click()}
                aria-label="Tirar foto com a câmera"
              >
                <Camera className="h-4 w-4" />
              </Button>
              {(value || currentUrl) && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled || loading}
                  onClick={() => onChange(null)}
                  aria-label="Remover foto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Opcional · JPEG, PNG ou WebP · até 8 MB
            </p>
          </div>
        </div>
      )}
      {loading && (
        <p role="status" className="flex gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando foto…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
