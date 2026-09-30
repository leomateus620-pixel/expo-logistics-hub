"""Build compact, reproducible review sheets without changing full captures.

Run from any directory with the bundled Python/Pillow runtime. Full-resolution
captures may later be archived; --source-root accepts that archive directory.
The manifest retains all capture filenames and SHA-256 digests, including views
not selected for a review sheet. Candidate commit stays pending until supplied.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version


REPOSITORY = Path(__file__).resolve().parents[2]
EVIDENCE = REPOSITORY / "docs/validation/access-spatial-correction"
BASELINE_COMMIT = "bb82eefb"
MAX_WIDTH, MAX_HEIGHT = 2400, 3000
TARGET_BYTES = 2_300_000
QA_CAPTION = "QA local · fixture BLOCKED em vermelho · sem dados/validação de produção"
COLORS = {"background": "#f3f4f2", "text": "#172622", "muted": "#54645e", "cell": "#ffffff", "image": "#e7ebe6"}
SCENE_COLUMNS = (("desktop", "before", "Desktop · antes"), ("desktop", "after", "Desktop · depois"),
                 ("mobile-emulated", "before", "Toque emulado · antes"), ("mobile-emulated", "after", "Toque emulado · depois"))
ROW_LABELS = {"top": "Vista superior", "oblique": "Vista oblíqua", "ground": "Vista ao nível da rua", "reduced": "Gráficos reduzidos"}
SCENES = (("gate9", "Portão 9 · duas vias e faixa verde", ("top", "oblique", "ground")),
          ("ubiretama", "Rua Ubiretama · alinhamento lateral", ("top", "oblique", "ground")),
          ("south-road", "Rua sul da Expo Rural · conexão", ("top", "oblique", "ground")),
          ("p12", "Pavilhão 12 · árvores sobre o concreto", ("top", "oblique", "ground", "reduced")),
          ("tower", "Portão 9 · construção da torre", ("oblique", "ground")))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font_source() -> str:
    # Font identity/digest is recorded so the same runtime reproduces the PNGs.
    for candidate in ("C:/Windows/Fonts/arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(candidate, 18).path
        except OSError:
            continue
    raise SystemExit("Arial or DejaVu Sans is required for legible review captions")


FONT = font_source()


def font(size: int, scale: float = 1) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, max(12, round(size * scale)))


def control_crop(root: Path, phase: str, width: int, size: tuple[int, int]) -> tuple[int, int, int, int]:
    report = json.loads((root / phase / "controls.json").read_text(encoding="utf-8"))
    view = next(view for view in report["views"] if view["width"] == width)
    rail = view["rail"]
    # Same native scale and margin for before/after; retain full PNG as source.
    return (max(0, math.floor(rail["x"] - 24)), max(0, math.floor(rail["y"] - 24)),
            min(size[0], math.ceil(rail["x"] + rail["width"] + 24)),
            min(size[1], math.ceil(rail["y"] + rail["height"] + 24)))


def specifications(root: Path, reports_root: Path) -> list[dict]:
    sheets = []
    for scene, title, rows in SCENES:
        cells = []
        for row in rows:
            for device, phase, _ in SCENE_COLUMNS:
                cells.append({"source": f"{phase}/2028-{device}-{scene}-{row}.png", "caption": ROW_LABELS[row], "crop": None})
        sheets.append({"filename": f"2028-{scene}.png", "title": f"2028 · {title}",
                       "columns": [column[2] for column in SCENE_COLUMNS], "rows": len(rows), "cells": cells, "controls": False})
    control_cells = []
    for width, theme in ((1440, "day"), (1440, "night"), (390, "day"), (320, "day")):
        label = f"{width} px · {'noite' if theme == 'night' else 'dia'} · rail em escala nativa"
        for phase in ("before", "after"):
            source = f"{phase}/controls-{width}-{theme}.png"
            with Image.open(root / source) as image:
                crop = control_crop(reports_root, phase, width, image.size)
            control_cells.append({"source": source, "caption": label, "crop": crop})
    sheets.append({"filename": "controls-rail.png", "title": "Rail de controles · 1440, 390 e 320 px",
                   "columns": ["Antes", "Depois"], "rows": 4, "cells": control_cells, "controls": True})
    return sheets


def render(root: Path, sheet: dict, baseline: str, candidate: str, scale: float) -> Image.Image:
    columns = len(sheet["columns"])
    width = round(2240 * scale)
    margin, gutter = round(20 * scale), round(12 * scale)
    header, footer, caption_height = round(130 * scale), round(42 * scale), round(52 * scale)
    cell_width = (width - 2 * margin - gutter * (columns - 1)) // columns
    image_height = round((150 if sheet["controls"] else 440) * scale)
    cell_height = image_height + caption_height
    height = header + sheet["rows"] * (cell_height + gutter) + footer
    if width > MAX_WIDTH or height > MAX_HEIGHT:
        raise ValueError(f"Sheet exceeds maximum dimensions: {width}×{height}")
    canvas = Image.new("RGB", (width, height), COLORS["background"])
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, round(16 * scale)), sheet["title"], font=font(28, scale), fill=COLORS["text"])
    draw.text((margin, round(54 * scale)), QA_CAPTION, font=font(18, scale), fill=COLORS["muted"])
    for column, label in enumerate(sheet["columns"]):
        x = margin + column * (cell_width + gutter)
        draw.text((x, round(100 * scale)), label, font=font(19, scale), fill=COLORS["text"])
    for index, cell in enumerate(sheet["cells"]):
        row, column = divmod(index, columns)
        x, y = margin + column * (cell_width + gutter), header + row * (cell_height + gutter)
        draw.rectangle((x, y, x + cell_width - 1, y + cell_height - 1), fill=COLORS["cell"])
        draw.rectangle((x, y, x + cell_width - 1, y + image_height - 1), fill=COLORS["image"])
        with Image.open(root / cell["source"]) as original:
            image = original.convert("RGB")
            if cell["crop"]:
                image = image.crop(cell["crop"])
            fit = min(cell_width / image.width, image_height / image.height)
            # Rail is compared at one common native scale; do not enlarge crops.
            if sheet["controls"]:
                fit = min(scale, fit)
            image = image.resize((max(1, round(image.width * fit)), max(1, round(image.height * fit))), Image.Resampling.LANCZOS)
            canvas.paste(image, (x + (cell_width - image.width) // 2, y + (image_height - image.height) // 2))
        draw.text((x + round(8 * scale), y + image_height + round(4 * scale)), cell["caption"], font=font(16, scale), fill=COLORS["text"])
        draw.text((x + round(8 * scale), y + image_height + round(27 * scale)), Path(cell["source"]).name, font=font(14, scale), fill=COLORS["muted"])
    draw.text((margin, height - round(30 * scale)), f"Baseline: {baseline} · Candidato: {candidate} · originais e hashes no manifest.json",
              font=font(15, scale), fill=COLORS["muted"])
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=EVIDENCE)
    parser.add_argument("--reports-root", type=Path, help="controls.json directory; defaults to capture root when present, otherwise evidence docs")
    parser.add_argument("--output", type=Path, default=EVIDENCE / "gallery")
    parser.add_argument("--baseline-commit", default=BASELINE_COMMIT)
    parser.add_argument("--candidate-commit", default="pending")
    args = parser.parse_args()
    root, output = args.source_root.resolve(), args.output.resolve()
    reports_root = (args.reports_root or (root if all((root / phase / "controls.json").is_file() for phase in ("before", "after")) else EVIDENCE)).resolve()
    required = [f"{phase}/2028-{device}-{scene}-{row}.png" for scene, _, rows in SCENES for row in rows
                for device, phase, _ in SCENE_COLUMNS]
    required += [f"{phase}/controls-{width}-{theme}.png" for phase in ("before", "after")
                 for width, theme in ((1440, "day"), (1440, "night"), (390, "day"), (320, "day"))]
    missing = [source for source in required if not (root / source).is_file()]
    missing += [str(reports_root / phase / "controls.json") for phase in ("before", "after") if not (reports_root / phase / "controls.json").is_file()]
    if missing:
        raise SystemExit("Capture inputs are not complete; no gallery written:\n" + "\n".join(missing))
    sheets = specifications(root, reports_root)
    output.mkdir(parents=True, exist_ok=True)
    usage = {}
    results = []
    for sheet in sheets:
        scale = 1.0
        while True:
            image = render(root, sheet, args.baseline_commit, args.candidate_commit, scale)
            encoded = io.BytesIO()
            image.save(encoded, format="PNG", optimize=True, compress_level=9)
            payload = encoded.getvalue()
            if len(payload) <= TARGET_BYTES or scale <= .65:
                break
            scale = round(scale - .05, 2)
        target = output / sheet["filename"]
        target.write_bytes(payload)
        for cell in sheet["cells"]:
            usage.setdefault(cell["source"], []).append(sheet["filename"])
        results.append({"file": sheet["filename"], "title": sheet["title"], "size": list(image.size), "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(), "renderScale": scale, "columns": sheet["columns"], "cells": sheet["cells"]})
    captures = []
    featured = []
    for filename, title in (("tower-lightning-cloud-full.png", "Raio real · nuvem, contato e torre iluminada"),
                            ("tower-lightning-reduced-graphics.png", "Raio real · gráficos reduzidos")):
        source = root / "after" / filename
        if source.is_file():
            (output / filename).write_bytes(source.read_bytes())
            usage.setdefault(f"after/{filename}", []).append(filename)
            featured.append({"file": filename, "source": f"after/{filename}", "title": title,
                             "sha256": sha256(source), "bytes": source.stat().st_size})
    for phase in ("before", "after"):
        for path in sorted((root / phase).glob("*.png")):
            relative = path.relative_to(root).as_posix()
            with Image.open(path) as image:
                dimensions = list(image.size)
            captures.append({"file": relative, "sha256": sha256(path), "bytes": path.stat().st_size, "size": dimensions,
                             "usedIn": usage.get(relative, [])})
    manifest = {"schemaVersion": 1, "baselineCommit": args.baseline_commit, "candidateCommit": args.candidate_commit,
                "evidenceBoundary": QA_CAPTION, "fullCapturesModified": False, "resampling": "Pillow LANCZOS; fit entire image without crop except documented rail crops",
                "maximumDimensions": [MAX_WIDTH, MAX_HEIGHT], "targetBytesPerSheet": TARGET_BYTES,
                "renderer": {"script": "scripts/access-spatial-correction/gallery.py", "sha256": sha256(Path(__file__)),
                             "python": sys.version.split()[0], "pillow": pillow_version, "font": Path(FONT).name, "fontSha256": sha256(Path(FONT))},
                "controlCropReports": [{"file": f"{phase}/controls.json", "sha256": sha256(reports_root / phase / "controls.json")} for phase in ("before", "after")],
                "sheets": results, "featuredOriginals": featured, "captures": captures}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index = ["# Comparação visual local", "", QA_CAPTION + ".", "",
             f"Baseline `{args.baseline_commit}`; commit candidato `{args.candidate_commit}`. Toque é emulação de Chromium, sem validação em dispositivo físico.", "",
             "As folhas mantêm proporção e usam LANCZOS. A rail usa recortes registrados, em escala comum. Os originais não são movidos nem alterados por este script.", "",
             "[Manifesto completo de fontes e SHA-256](manifest.json)", ""]
    for sheet in results:
        index += [f"## {sheet['title']}", "", f"![{sheet['title']}]({sheet['file']})", ""]
    for capture in featured:
        index += [f"## {capture['title']}", "", f"![{capture['title']}]({capture['file']})", ""]
    index += ["A vista ao nível da rua de Ubiretama tem obstrução parcial por copa existente. O alinhamento é legível nas vistas superior/oblíqua e verificado pelos testes de geometria e suporte físico.", ""]
    index += ["## Reprodução", "", "```powershell",
              "& 'C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/access-spatial-correction/gallery.py",
              "```", "", "Após arquivar os originais, acrescente `--source-root <diretório-do-arquivo>`. Os relatórios `before/controls.json` e `after/controls.json` são buscados nos docs quando não existem no arquivo externo; outro local pode ser passado com `--reports-root`. Para registrar o commit final, acrescente `--candidate-commit <sha>`.", ""]
    (output / "README.md").write_text("\n".join(index), encoding="utf-8")
    print(json.dumps({"sheets": [{key: sheet[key] for key in ("file", "size", "bytes")} for sheet in results],
                      "totalSheetBytes": sum(sheet["bytes"] for sheet in results), "sourceCaptures": len(captures),
                      "sourceBytes": sum(capture["bytes"] for capture in captures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
