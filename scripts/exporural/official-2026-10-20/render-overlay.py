import json,sys
from pathlib import Path
import pymupdf as fitz,numpy as np
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);out=root/'docs/exporural/2028-revisao-2026-10-20'
pdf=fitz.open(str(next((out/'fontes').glob('*.pdf'))))[0]
# Same technical camera/crop for exact vector overlay and previous geometry.
clip=fitz.Rect(1700,590,2370,1570);scale=1.5
pix=pdf.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=clip)
base=Image.frombytes('RGB',[pix.width,pix.height],pix.samples).convert('RGBA')
t=json.load(open(out/'calibracao.json'))['transform'];M=np.array([[t[0],t[1]],[t[2],t[3]]]);inv=np.linalg.inv(M);tr=np.array(t[4:]);
def pixel(p):
 q=inv@(np.array(p)-tr);return ((q[0]-clip.x0)*scale,(q[1]-clip.y0)*scale)
for name,rows,color in [('overlay-official',json.load(open(root/'src/features/commercial-map/data/exporural2028October/lots.json')),(0,100,255,90)),('overlay-before',[dict(geometry=r['geometry']) for r in json.load(open(out/'expected-before.json')) if r['lot_id']],(230,50,25,70))]:
 im=base.copy();layer=Image.new('RGBA',im.size);draw=ImageDraw.Draw(layer)
 for row in rows:
  points=[pixel(p) for p in row['geometry']['coordinates'][0]]
  draw.polygon(points,fill=color);draw.line(points,fill=color[:3]+(255,),width=2)
 im=Image.alpha_composite(im,layer).convert('RGB');im.save(out/'evidencias'/f'{name}.jpg',quality=94)
