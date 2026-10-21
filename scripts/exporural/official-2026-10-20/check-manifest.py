"""Independent transcription check: PDF text inside each extracted vector face."""
import json,re
from decimal import Decimal
from pathlib import Path
import pymupdf as fitz
from shapely.geometry import Polygon,Point
root=Path(__file__).resolve().parents[3];out=root/'docs/exporural/2028-revisao-2026-10-20'
pdf=fitz.open(str(next((out/'fontes').glob('*.pdf'))))[0]
polys=json.load(open('/tmp/exporural-vectors.json'))['polys'];manifest=json.load(open(root/'src/features/commercial-map/data/exporural2028October/manifest.json'))
words=pdf.get_text('words');checks=[]
for row in manifest:
 p=Polygon(polys[row['code']]);candidates=[]
 for x0,y0,x1,y1,t,*_ in words:
  m=re.fullmatch(r'(\d[\d.]*,\d{1,2})(?:m[²2])?',t)
  if not m:continue
  value=Decimal(m[1].replace('.','').replace(',','.'))
  if value<100:continue
  point=Point((x0+x1)/2,(y0+y1)/2)
  if p.contains(point):candidates.append((p.boundary.distance(point),format(value,'.2f')))
 candidates.sort(reverse=True)
 value=candidates[0][1] if candidates else None
 checks.append({'code':row['code'],'pdf_area_sqm':value,'manifest_area_sqm':row['official_area_sqm'],'matches':value is not None and Decimal(value)==Decimal(row['official_area_sqm'])})
(out/'manifest-pdf-check.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print('PDF individual matches:',sum(r['matches'] for r in checks),'/',len(checks));print([r for r in checks if not r['matches']])
assert all(r['matches'] for r in checks)
