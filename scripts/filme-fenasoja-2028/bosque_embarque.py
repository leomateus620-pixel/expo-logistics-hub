"""Registra a plate do bosque na câmera móvel da segunda geração do embarque.

Uso: python bosque_embarque.py 02-higgsfield.mp4 02-bosque-corda.mp4
Origem: Higgsfield Seedance 2.5, 751a7ce1-37bb-4559-82c0-1ee213bc89bd.
Requer OpenCV, NumPy e FFmpeg com libx264.
"""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

ASSETS = Path(__file__).resolve().parent / "bosque"
WIDTH, HEIGHT = 1280, 720
FIRST_FRAME, LAST_FRAME = 43, 211


def half_luma(frame):
    half = cv2.resize(frame, (WIDTH // 2, HEIGHT // 2), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(half, cv2.COLOR_BGR2GRAY)


def render(source, target, ffmpeg, report):
    cv2.setNumThreads(2)
    source_clip = cv2.VideoCapture(str(source))
    reference = cv2.imread(str(ASSETS / "registro-parque.webp"))
    plate = cv2.imread(str(ASSETS / "placa-bosque.webp"), cv2.IMREAD_UNCHANGED)
    if reference is None or plate is None or plate.shape != (HEIGHT, WIDTH, 4):
        raise ValueError("Verifique as plates de autoria em bosque/.")
    size = (
        source_clip.get(cv2.CAP_PROP_FRAME_WIDTH),
        source_clip.get(cv2.CAP_PROP_FRAME_HEIGHT),
    )
    if (
        size != (WIDTH, HEIGHT)
        or source_clip.get(cv2.CAP_PROP_FPS) != 24
        or source_clip.get(cv2.CAP_PROP_FRAME_COUNT) != 217
    ):
        source_clip.release()
        raise ValueError(
            "A tomada de origem precisa conter os 217 quadros nativos a 1280×720, 24 fps."
        )

    alpha = plate[:, :, 3]
    delta = plate[:, :, :3].astype(np.float32) - reference.astype(np.float32)
    delta[alpha == 0] = 0
    y, x = np.indices((HEIGHT, WIDTH), dtype=np.float32)
    grid = np.dstack((x, y))
    coordinates = grid.copy()
    previous = half_luma(reference)
    optical_flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)
    # A aeronave, as pessoas e o cabo estão no primeiro plano. A área à direita é o bosque da Casa.
    allowed = (y < HEIGHT * 0.49) | ((x > WIDTH * 0.68) & (y < HEIGHT * 0.64))
    audit = []
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(dir=target.parent) as directory:
            output = Path(directory) / "embarque.mp4"
            command = [
                ffmpeg,
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgr24",
                "-s",
                "1280x720",
                "-framerate",
                "24",
                "-i",
                "-",
                "-vf",
                "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "13",
                "-threads",
                "3",
                "-preset",
                "fast",
                "-color_primaries",
                "bt709",
                "-color_trc",
                "bt709",
                "-colorspace",
                "bt709",
                "-color_range",
                "tv",
                "-movflags",
                "+faststart",
                str(output),
            ]
            with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
                try:
                    for index in range(LAST_FRAME + 1):
                        ok, frame = source_clip.read()
                        if not ok:
                            raise ValueError(f"O vídeo não contém o quadro {index}.")
                        current = half_luma(frame)
                        displacement = optical_flow.calc(current, previous, None)
                        previous = current
                        displacement = (
                            cv2.resize(
                                displacement,
                                (WIDTH, HEIGHT),
                                interpolation=cv2.INTER_LINEAR,
                            )
                            * 2
                        )
                        coordinates = cv2.remap(
                            coordinates,
                            grid + displacement,
                            None,
                            cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REPLICATE,
                        )
                        if index < FIRST_FRAME:
                            continue
                        alignment = cv2.remap(
                            reference, coordinates, None, cv2.INTER_LINEAR
                        )
                        foliage = cv2.remap(alpha, coordinates, None, cv2.INTER_LINEAR)
                        changes = cv2.remap(delta, coordinates, None, cv2.INTER_LINEAR)
                        residual = cv2.GaussianBlur(
                            frame.astype(np.float32) - alignment, (0, 0), 1.3
                        )
                        error = np.abs(residual).max(axis=2)
                        confidence = (
                            np.clip((43 - error) / 24, 0, 1) * allowed * (foliage > 10)
                        )
                        corrected = np.clip(
                            frame.astype(np.float32)
                            + changes * confidence[:, :, None] * 0.82,
                            0,
                            255,
                        ).astype(np.uint8)
                        encoder.stdin.write(corrected.tobytes())
                        if index in (FIRST_FRAME, LAST_FRAME) or index % 24 == 0:
                            difference = cv2.absdiff(corrected, frame).max(axis=2)
                            changed = int(np.count_nonzero(difference > 1))
                            if changed < 600 or np.any(difference[~allowed]):
                                raise RuntimeError(
                                    f"Verificação espacial falhou no quadro {index}."
                                )
                            audit.append(
                                {
                                    "frame": index,
                                    "changedPixels": changed,
                                    "protectedPixelsChanged": 0,
                                }
                            )
                finally:
                    encoder.stdin.close()
                if encoder.wait():
                    raise RuntimeError("O FFmpeg não concluiu a exportação.")
            output.replace(target)
    finally:
        source_clip.release()
    if report:
        report.write_text(json.dumps(audit, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--report", type=Path)
    options = parser.parse_args()
    render(options.source, options.target, options.ffmpeg, options.report)
