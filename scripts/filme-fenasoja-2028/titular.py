"""Light the beveled 3D wordmark inside the existing photographic sky at the final delivery resolution."""

import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


class SkyTitle:
    def __init__(self):
        script = Path(__file__).with_name("letreiro.mjs")
        data = json.loads(subprocess.check_output(["node", str(script)]))
        word, year = [np.array(item).reshape(-1, 3, 3) for item in data]
        year[:, :, 0] += word[:, :, 0].max() + 0.28
        mesh = np.concatenate([word, year])
        mesh[:, :, 0] -= mesh[:, :, 0].max() / 2
        self.mesh = mesh
        self.gold = np.arange(len(mesh)) >= len(word)
        self.size = np.ptp(mesh[:, :, 0])
        self.light = np.array([-0.53, 0.58, 0.62])

    def render(self, frame, seconds, width=3840):
        scale = width / 1280

        def picture(frame):
            return (
                cv2.resize(
                    frame, (width, width * 9 // 16), interpolation=cv2.INTER_LANCZOS4
                )
                if width != 1280
                else frame
            )

        # The emblem and the passing atmospheric veil are already in the source film.
        # Only the narrow line of generated placeholder type needs a clean sky plate.
        if seconds < 1.7:
            return picture(frame)
        frame = frame.copy()
        roi = frame[383:434, 490:790].copy()
        luma = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        bright = cv2.morphologyEx(luma, cv2.MORPH_TOPHAT, np.ones((11, 11), np.uint8))
        mask = np.uint8(bright > 3) * 255
        mask[:9] = 0
        mask[-13:] = 0
        mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
        frame[383:434, 490:790] = cv2.inpaint(roi, mask, 3, cv2.INPAINT_TELEA)

        reveal = smooth((seconds - 2.45) / 1.45)
        frame = picture(frame)
        if reveal == 0:
            return frame
        # Camera settles to a slight three-quarter angle. The lettering shares the
        # left-side sun and cool overhead fill of the aerial background.
        yaw, pitch = np.radians([17 - 6 * reveal, -14 + 3 * reveal])
        cy, sy, cp, sp = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch)
        rotation = np.array(
            [[cy, sy * sp, sy * cp], [0, cp, -sp], [-sy, cy * sp, cy * cp]]
        )
        vertices = self.mesh @ rotation.T
        normal = np.cross(
            vertices[:, 1] - vertices[:, 0], vertices[:, 2] - vertices[:, 0]
        )
        normal /= np.maximum(1e-10, np.linalg.norm(normal, axis=1, keepdims=True))
        visible = np.where(normal[:, 2] > 0.008)[0]
        visible = visible[np.argsort(vertices[visible, :, 2].mean(axis=1))]
        path = vertices[:, :, :2].copy()
        path *= (20 / (20 - vertices[:, :, 2]))[:, :, None]
        path *= 480 / self.size
        path[:, :, 0] += 300
        path[:, :, 1] = 88 + (1 - reveal) * 12 - path[:, :, 1]
        bounds = (340, 356, 940, 468)
        x, y, right, bottom = [round(n * scale) for n in bounds]
        # Supersample just the letterbox surrounding the mesh, not the full film.
        pixels = np.rint(path * 2 * scale).astype(np.int32)
        colors = np.zeros((round(224 * scale), round(1200 * scale), 4), np.uint8)
        diffuse = np.clip(normal @ self.light, 0, 1)
        half_vector = self.light + np.array([0, 0, 1])
        half_vector /= np.linalg.norm(half_vector)
        sheen = np.maximum(0, normal @ half_vector) ** 14
        # Sky reflection is cool on cobalt enamel and warm on brass.
        sky = np.clip(normal[:, 1] * 0.5 + normal[:, 2] * 0.42, 0, 1)
        base = np.where(self.gold[:, None], [27, 134, 219], [159, 62, 7])
        highlight = np.where(self.gold[:, None], [98, 95, 31], [62, 100, 71])
        lit = base * (0.55 + 0.65 * diffuse[:, None]) + highlight * sky[:, None]
        lit += (sheen * 105)[:, None] * np.array([0.67, 0.86, 1.0])
        # A soft reflection from the sunward edge travels across the bevel.
        lit = np.clip(lit, 0, 255).astype(int).tolist()
        for i in visible:
            cv2.fillConvexPoly(colors, pixels[i], (*lit[i], 255))
        rgba = cv2.resize(colors, (right - x, bottom - y), interpolation=cv2.INTER_AREA)
        coverage = rgba[:, :, 3:4].astype(float) / 255
        # Blue horizon and warm sunrise reflections change across the curved
        # bevel and across the height of the enamel, as on a real extruded sign.
        rows, cols = np.indices(coverage.shape[:2]) / scale
        height_on_face = np.clip((88 + 12 * (1 - reveal) - rows) / 48, 0, 1)
        shoulder = np.exp(-(((height_on_face - 0.82 - cols * 0.00011) / 0.18) ** 2))
        soft_light = (0.74 + 0.29 * height_on_face + 0.15 * shoulder)[:, :, None]
        radiance = rgba[:, :, :3].astype(float) * soft_light
        warm = (cols > 397)[:, :, None]
        glint = shoulder[:, :, None] * coverage
        radiance += glint * np.where(warm, [22, 34, 38], [40, 36, 23])
        alpha = coverage
        bg = frame[y:bottom, x:right].astype(float)
        # The supersampled color is premultiplied. Atmospheric scatter leaves
        # the moving blue sky and low mist in the enamel's reflection.
        opacity = reveal * 0.94
        out = bg * (1 - alpha * opacity) + radiance * opacity
        frame[y:bottom, x:right] = np.clip(out, 0, 255).astype(np.uint8)
        return frame


def render_title(source, output, ffmpeg, width=3840):
    capture = cv2.VideoCapture(str(source))
    try:
        if not capture.isOpened() or (int(capture.get(3)), int(capture.get(4))) != (
            1280,
            720,
        ):
            raise ValueError("The sky pass requires the original 1280×720 aerial shot")
        fps = capture.get(cv2.CAP_PROP_FPS)
        title = SkyTitle()
        command = [
            ffmpeg,
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{width * 9 // 16}",
            "-r",
            str(fps),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-threads",
            "4",
            "-crf",
            "13",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            i = 0
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                encoder.stdin.write(title.render(frame, i / fps, width).tobytes())
                i += 1
            encoder.stdin.close()
            if encoder.wait() or not i:
                raise RuntimeError("Title pass failed")
    finally:
        capture.release()
