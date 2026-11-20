"""Rasterize the official six closing ticks as branded 4K artwork."""

import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
UNITS = ("DIAS", "HORAS", "MINUTOS", "SEGUNDOS")
WIDTH, HEIGHT = 2112, 298


def write_clock(folder, reference):
    folder.mkdir(parents=True, exist_ok=True)
    clock = json.loads(
        subprocess.check_output(
            ["node", "--import", "tsx", str(HERE / "contagem.ts"), reference],
            cwd=ROOT,
            text=True,
        )
    )
    fonts = ROOT / "src/assets/fonts"
    number = ImageFont.truetype(str(fonts / "hind-semibold.ttf"), 141)
    label = ImageFont.truetype(str(fonts / "hind-semibold.ttf"), 42)
    fill = Image.new("RGBA", (WIDTH, HEIGHT))
    gradient = ImageDraw.Draw(fill)
    stops = [(6, 30, 55, 245), (10, 55, 89, 240), (7, 36, 65, 245)]
    for x in range(WIDTH):
        t = 2 * x / (WIDTH - 1)
        index = min(int(t), 1)
        color = tuple(
            round(c + (v - c) * (t - index))
            for c, v in zip(stops[index], stops[index + 1])
        )
        gradient.line((x, 0, x, HEIGHT), fill=color)
    # Echo the curved field lines of the FenaSoja emblem at the panel edges.
    engraving = Image.new("RGBA", fill.size)
    pen = ImageDraw.Draw(engraving)
    for line in range(3):
        left = [
            (x, round(HEIGHT - 8 - line * 24 - 0.003 * (186 - x) ** 2))
            for x in range(-3, 187)
        ]
        pen.line(left, fill=(226, 190, 119, 45), width=3)
        pen.line(
            [(WIDTH - 1 - x, y) for x, y in left], fill=(226, 190, 119, 45), width=3
        )
    for x in range(WIDTH // 3, WIDTH * 2 // 3):
        strength = math.exp(-(((x - WIDTH / 2) / 156) ** 2))
        pen.line((x, 4, x, 8), fill=(255, 220, 142, round(155 * strength)))
    fill = Image.alpha_composite(fill, engraving)
    shape = Image.new("L", fill.size)
    ImageDraw.Draw(shape).rounded_rectangle(
        (0, 0, WIDTH - 1, HEIGHT - 1), radius=26, fill=255
    )
    backdrop = Image.new("RGBA", fill.size)
    backdrop.paste(fill, mask=shape)
    edge = ImageDraw.Draw(backdrop)
    edge.line((27, 2, WIDTH - 28, 2), fill="#edbf65", width=4)
    for i, tick in enumerate(clock["ticks"]):
        panel = backdrop.copy()
        draw = ImageDraw.Draw(panel)
        if isinstance(tick, list):
            for k, (value, unit) in enumerate(zip(tick, UNITS)):
                cx = (2 * k + 1) * WIDTH // 8
                if k:
                    # Composite a translucent divider onto the navy surface.
                    draw.line(
                        (k * WIDTH // 4, 64, k * WIDTH // 4, HEIGHT - 62),
                        fill="#73736a",
                        width=2,
                    )
                draw.text(
                    (cx, 118), f"{value:02}", font=number, anchor="mm", fill="#fff8e9"
                )
                draw.text((cx, 218), unit, font=label, anchor="mm", fill="#f8ce77")
        else:
            draw.text(
                (WIDTH // 2, HEIGHT // 2), tick, font=label, anchor="mm", fill="#fff8e9"
            )
        panel.save(folder / f"tick-{i}.png")
    return clock
