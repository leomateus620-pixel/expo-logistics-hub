"""Optimize the supplied graphite reference without inventing a tiled surface.

The side finishes are independent assets from the selected Creative Production
study. This center crop follows the user's principal source; no historical face
or inscription is altered here. The versioned reference is a portable fallback.
"""
from pathlib import Path
from PIL import Image, ImageOps
import sys

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/memorial-voluntariado/environment'
supplied=Path('C:/Users/Leonardo/Downloads/Superfície de grafite e latão.png')
source=Path(sys.argv[1]) if len(sys.argv)>1 else supplied if supplied.exists() else OUT/'reference.webp'
image=ImageOps.exif_transpose(Image.open(source)).convert('RGB')
width,height=image.size
center=image.crop((round(width*.082),round(height*.15),round(width*.952),round(height*.94)))
center=ImageOps.fit(center,(1280,720),Image.Resampling.LANCZOS)
target=OUT/'graphite.webp'
center.save(target,quality=84,method=6)
print(f'graphite.webp: {target.stat().st_size} bytes; center crop from {source.name}')
