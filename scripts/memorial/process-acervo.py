"""Deterministic, reversible photographic preparation. Originals are never rewritten.

python scripts/memorial/process-acervo.py
Requires Pillow, numpy and opencv-python-headless. Manual corners are in catalog.json,
in EXIF-oriented source pixels, TL/TR/BR/BL. No generative pixels or text repair.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import cv2
import numpy as np
import json
import hashlib
import sys

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'public/memorial-voluntariado'
CATALOG = ROOT / 'src/features/memorial/catalog.json'


def process():
    records = json.loads(CATALOG.read_text(encoding='utf-8'))
    manifest_path = ROOT / 'src/features/memorial/assets.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    previews = []
    for record in records:
        piece_id = record['id']
        if len(sys.argv) > 1 and piece_id not in sys.argv[1:]: continue
        if record['kind'] == 'epilogue':
            # Exhibition copy is deterministic; this is not historical artwork.
            im = Image.new('RGB', (900, 1200), '#111514')
            draw = ImageDraw.Draw(im)
            for inset, color, width in [(10, '#b48d43', 10), (30, '#6d542a', 2), (50, '#b48d43', 2)]:
                draw.rectangle((inset, inset, 899-inset, 1199-inset), outline=color, width=width)
            font_path = 'C:/Windows/Fonts/georgia.ttf'
            for text, y, size, color in [('FENASOJA', 375, 73, '#eee5cc'), ('2028', 470, 170, '#d7b776'), ('LOADING…', 755, 39, '#d7b776')]:
                draw.text((450, y), text, font=ImageFont.truetype(font_path, size), fill=color, anchor='mt')
            original = None
            matrix = None
        else:
            original = MEDIA / 'originals' / record['sourceFile']
            source = ImageOps.exif_transpose(Image.open(original)).convert('RGB')
            pts = np.float32(record['crop'])
            width = round((np.linalg.norm(pts[1]-pts[0]) + np.linalg.norm(pts[2]-pts[3])) / 2)
            height = round((np.linalg.norm(pts[3]-pts[0]) + np.linalg.norm(pts[2]-pts[1])) / 2)
            matrix = cv2.getPerspectiveTransform(pts, np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]]))
            rgb = cv2.warpPerspective(np.array(source), matrix, (width,height), flags=cv2.INTER_CUBIC)
            # Explicit conservative WB multiplier only; never remove reflected text or invent missing pixels.
            gains = np.array(record.get('whiteBalance', [1,1,1]))
            im = Image.fromarray(np.clip(rgb*gains, 0, 255).astype('uint8'))
        im.save(MEDIA / 'faces' / f'{piece_id}.webp', quality=94, method=6)
        thumb = im.copy()
        thumb.thumbnail((420,560))
        thumb.save(MEDIA / 'thumbnails' / f'{piece_id}.webp', quality=87, method=6)
        small = im.copy()
        small.thumbnail((240,320))
        small.save(MEDIA / 'thumbnails' / f'{piece_id}-240.webp', quality=85, method=6)
        manifest[piece_id] = {**manifest.get(piece_id, {}), **{
            'width': im.width, 'height': im.height,
            'originalSha256': hashlib.sha256(original.read_bytes()).hexdigest() if original else None,
            'homography': matrix.tolist() if matrix is not None else None,
            'faceBytes': (MEDIA / 'faces' / f'{piece_id}.webp').stat().st_size,
            'thumbnailBytes': (MEDIA / 'thumbnails' / f'{piece_id}.webp').stat().st_size,
        }}
        print(f'{piece_id}: {im.width}x{im.height} source face', flush=True)
        previews.append((record, im))
    (ROOT / 'src/features/memorial/assets.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    # Comparison input for individual editorial/visual review; full faces remain available separately.
    for start in range(0,len(previews),6):
        sheet = Image.new('RGB',(1800,1760),'#e5e1d6')
        draw = ImageDraw.Draw(sheet)
        for j,(record,im) in enumerate(previews[start:start+6]):
            x=(j%3)*600; y=(j//3)*880
            if record.get('sourceFile'):
                original_im=ImageOps.exif_transpose(Image.open(MEDIA/'originals'/record['sourceFile']))
                original_im.thumbnail((280,800)); sheet.paste(original_im,(x,y+40))
            copy=im.copy(); copy.thumbnail((280,800)); sheet.paste(copy,(x+300,y+40))
            draw.text((x+5,y+8),f"{record['year']} / {record.get('edition', 'epilogo')} - source | rectified",fill='#141414')
        sheet.save(ROOT/f'docs/memorial/evidence/faces-comparison-{start//6+1:02}.jpg',quality=92)


if __name__ == '__main__':
    process()
