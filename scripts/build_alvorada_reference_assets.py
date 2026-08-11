#!/usr/bin/env python3
"""Prepare original Santa Rosa and user-approved FENASOJA identity assets.

The generated city horizons deliberately remove the photographed sky. The
live Three.js atmosphere remains authoritative while the distant real city,
vegetation and countryside provide the geographic visual truth behind the 3D
foreground.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageEnhance


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    progress = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return progress * progress * (3.0 - 2.0 * progress)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def grade_city(image: Image.Image) -> Image.Image:
    graded = ImageEnhance.Contrast(image).enhance(1.08)
    graded = ImageEnhance.Color(graded).enhance(1.1)
    graded = ImageEnhance.Sharpness(graded).enhance(1.08)
    return graded


def create_horizon(
    source: Image.Image,
    crop: tuple[int, int, int, int],
    output: Path,
) -> None:
    original_width, original_height = source.size
    left, top, right, bottom = crop
    city = grade_city(source.crop(crop).convert("RGBA"))
    width, height = city.size
    pixels = city.load()

    # The photographed horizon varies gently across the frame. A broad feather
    # preserves the hill/tree silhouettes without leaving a rectangular sky.
    for y in range(height):
        absolute_y = y + top
        for x in range(width):
            normalized_x = (x + left) / original_width
            horizon = original_height * (
                0.304
                + 0.014 * math.sin(normalized_x * math.pi * 1.65)
                + 0.007 * math.sin(normalized_x * math.pi * 4.4)
            )
            skyline_alpha = smoothstep(horizon + 8.0, horizon + 96.0, absolute_y)
            edge_feather = width * 0.215
            edge_alpha = min(
                smoothstep(0.0, edge_feather, x),
                smoothstep(0.0, edge_feather, width - 1 - x),
            )
            lower_feather = 1.0 - smoothstep(height * 0.965, height, y)
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (
                red,
                green,
                blue,
                round(255 * skyline_alpha * edge_alpha * lower_feather),
            )

    output.parent.mkdir(parents=True, exist_ok=True)
    city.save(output, "WEBP", quality=92, method=6, lossless=False)


def clean_symbol(source: Path, output: Path) -> None:
    symbol = Image.open(source).convert("RGBA")
    cleaned = Image.new("RGBA", symbol.size, (0, 0, 0, 0))
    cleaned_pixels = cleaned.load()
    source_pixels = symbol.load()
    visible_points: list[tuple[int, int]] = []
    for y in range(symbol.height):
        for x in range(symbol.width):
            red, green, blue, alpha = source_pixels[x, y]
            if alpha <= 8:
                continue
            cleaned_pixels[x, y] = (red, green, blue, alpha)
            visible_points.append((x, y))

    if not visible_points:
        raise ValueError("The official symbol contains no visible pixels")

    left = max(0, min(point[0] for point in visible_points) - 22)
    top = max(0, min(point[1] for point in visible_points) - 22)
    right = min(symbol.width, max(point[0] for point in visible_points) + 23)
    bottom = min(symbol.height, max(point[1] for point in visible_points) + 23)
    cropped = cleaned.crop((left, top, right, bottom))
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(
        cropped,
        ((canvas.width - cropped.width) // 2, (canvas.height - cropped.height) // 2),
    )
    canvas.save(output, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--panorama", type=Path, required=True)
    parser.add_argument("--symbol", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    panorama = Image.open(arguments.panorama).convert("RGB")
    width, height = panorama.size
    top = round(height * 0.265)
    create_horizon(
        panorama,
        (0, top, width, height),
        arguments.output / "santa-rosa-horizon.webp",
    )

    portrait_width = round(width * 0.55)
    portrait_left = (width - portrait_width) // 2
    create_horizon(
        panorama,
        (portrait_left, top, portrait_left + portrait_width, height),
        arguments.output / "santa-rosa-horizon-portrait.webp",
    )

    clean_symbol(
        arguments.symbol,
        arguments.output / "fenasoja-symbol-official.png",
    )

    manifest = {
        "version": 1,
        "cityPanorama": {
            "sourceSha256": sha256(arguments.panorama),
            "desktop": "santa-rosa-horizon.webp",
            "portrait": "santa-rosa-horizon-portrait.webp",
        },
        "symbol": {
            "sourceSha256": sha256(arguments.symbol),
            "asset": "fenasoja-symbol-official.png",
        },
    }
    (arguments.output / "reference-assets.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
