"""Prepare a downloaded Higgsfield source tile offline (Pillow and NumPy).

Usage: python prepare-park-albedo.py interior-floor original.png
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


# Target sRGB average, retained grain contrast and large-scale light removal.
FINISHES = {
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


def prepare_grass(image, destination):
    """Pack local sRGB fibers and a linear, independently sampled 48 m density field."""
    size = 512
    blade = image.resize((size, size), Image.Resampling.LANCZOS)
    fibers = periodic_component(np.asarray(blade, dtype=float))
    blurred = np.asarray(blade.filter(ImageFilter.GaussianBlur(26)), dtype=float)
    fibers = np.clip(fibers - fibers.mean(axis=(0, 1))
                     - 0.62 * (blurred - blurred.mean(axis=(0, 1))) + [132, 149, 92], 20, 240)

    # Interpolate across a repeated lattice and extract the middle repeat so
    # opposite edges meet. Several cell sizes soften the large pasture forms.
    rng = np.random.default_rng(1986)
    density = np.zeros((size, size))
    for cells, weight in [(5, .27), (14, .29), (45, .25), (110, .12), (225, .07)]:
        lattice = rng.integers(0, 256, (cells, cells), dtype=np.uint8)
        tripled = Image.fromarray(np.tile(lattice, (3, 3)))
        smooth = tripled.resize((size * 3, size * 3), Image.Resampling.BICUBIC)
        density += weight * np.asarray(smooth.crop((size, size, size * 2, size * 2)))
    lo, hi = np.percentile(density, [2, 98])
    alpha = np.clip((density - lo) / (hi - lo), 0, 1) * 193 + 38
    alpha = np.rint(alpha / 7) * 7
    tile = Image.fromarray(np.uint8(np.dstack([fibers, alpha])))
    tile.save(destination, quality=70, alpha_quality=70, method=6)


def prepare(kind, source, destination):
    with Image.open(source) as original:
        image = original.convert("RGB")
    if kind == "grass":
        prepare_grass(image, destination)
        return
    target, contrast, light_removal = FINISHES[kind]
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
    parser.add_argument("kind", choices=["grass", *FINISHES])
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    material_dir = Path(__file__).resolve().parents[2] / "public/maps/materials"
    version = 2 if args.kind == "grass" else 1
    prepare(args.kind, args.source, args.output or material_dir / f"warm-{args.kind}-v{version}.webp")
