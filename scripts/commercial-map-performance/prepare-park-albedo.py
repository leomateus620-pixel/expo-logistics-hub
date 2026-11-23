"""Prepare a downloaded Higgsfield source tile offline (Pillow and NumPy).

Usage: python prepare-park-albedo.py interior-floor original.png
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


# Target sRGB average, retained grain contrast and large-scale light removal.
FINISHES = {
    "grass": ([127, 146, 98], 0.72, 0.85),
    "woodland": ([134, 109, 82], 0.65, 0.85),
    "metal": ([222, 225, 225], 0.60, 0.85),
    "interior-floor": ([199, 197, 190], 0.95, 0.65),
}


def periodic_component(image):
    """Remove the smooth opposite-edge discrepancy without mirroring features."""
    residual = np.zeros_like(image)
    residual[0] = image[-1] - image[0]
    residual[-1] = -residual[0]
    residual[:, 0] += image[:, -1] - image[:, 0]
    residual[:, -1] -= image[:, -1] - image[:, 0]
    height, width = image.shape[:2]
    x, y = np.meshgrid(np.fft.fftfreq(width) * 2 * np.pi, np.fft.fftfreq(height) * 2 * np.pi)
    laplacian = 2 * np.cos(x) + 2 * np.cos(y) - 4
    laplacian[0, 0] = 1
    correction = np.fft.fft2(residual, axes=(0, 1)) / laplacian[:, :, None]
    correction[0, 0] = 0
    return image - np.fft.ifft2(correction, axes=(0, 1)).real


def prepare(kind, source, destination):
    target, contrast, light_removal = FINISHES[kind]
    with Image.open(source) as original:
        image = original.convert("RGB")
    if kind == "metal":
        # Matching troughs in this source are 16 rib periods apart.
        image = image.crop((53, 54, 969, 970))
    pixels = np.asarray(image.resize((256, 256), Image.Resampling.LANCZOS)).astype(float)
    if kind == "metal":
        columns = pixels.mean(axis=0)
        pixels -= 0.90 * (columns - columns.mean(axis=0))[None, :, :]
    pixels = periodic_component(pixels)
    native = Image.fromarray(np.uint8(pixels.clip(0, 255)))
    low_frequency = np.asarray(native.filter(ImageFilter.GaussianBlur(18)), dtype=float)
    pixels -= pixels.mean(axis=(0, 1)) + light_removal * (low_frequency - low_frequency.mean(axis=(0, 1)))
    color = np.asarray(target) + contrast * pixels
    Image.fromarray(np.uint8(color.clip(0, 255))).save(destination, quality=88, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=FINISHES)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    material_dir = Path(__file__).resolve().parents[2] / "public/maps/materials"
    prepare(args.kind, args.source, args.output or material_dir / f"warm-{args.kind}-v1.webp")
