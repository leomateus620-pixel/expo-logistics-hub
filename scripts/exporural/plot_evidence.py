"""Scientific QA plates from the exact preview coordinates; not runtime screenshots."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
root=Path('docs/exporural/2028-revisao-2026-09-25')
read=lambda f:json.loads((root/f).read_text(encoding='utf-8'))
cal=read('calibracao.json'); old=read('referencia_anterior.json'); shapes=read('geometrias_lotes.json')['lots']; roads=read('geometria_vias.json')['roads']
affine=np.array(cal['rasterGridToHistoricalSourceAffine']); inverse=np.linalg.inv(affine[:2]); factor=cal['inspectionGrid']['nativePixelsPerGridUnit']
def grid(p):
    x,y=p; source=np.array([(x+60)*5500/120+600,(y+120*4150/5500/2)*5500/120+900])
    return (source-affine[2])@inverse
def localshape(e):return [grid(p) for p in e['geometry']['coordinates'][0]]
before=[dict(public_identifier=e['publicIdentifier'],geometry=e['geometry']) for e in old['entities'] if e['publicIdentifier'].startswith(('Q-R-','Q-S-'))]
before_roads=[dict(public_identifier=e['publicIdentifier'],geometry=e['geometry']) for e in old['entities'] if e['classification']=='ROAD']
views={'geral':(40,305,1872,1240),'faixas_s':(540,307,1865,642),'central_r':(540,625,1865,1035),
       'subdivisoes':(1340,820,1860,1048),'perimetro_62_65':(1430,1015,1820,1250),'nova_via':(750,440,1090,1040)}
font_path='C:/Windows/Fonts/arial.ttf'
native=Image.open(root/'fontes/Fenasoja_Parque_Ajustes_300dpi.png').convert('RGB')
base=native.resize((1888,round(native.height/factor)),Image.Resampling.LANCZOS)
out=root/'evidencias/pranchas';out.mkdir(parents=True,exist_ok=True)
for name,bounds in views.items():
    x0,y0,x1,y1=bounds; scale=min(1800/(x1-x0),1000/(y1-y0)); w=round((x1-x0)*scale);h=round((y1-y0)*scale)
    def pos(p):return ((p[0]-x0)*scale,(p[1]-y0)*scale+60)
    for mode in ['antes','depois','sobreposicao']:
        im=Image.new('RGB',(w,h+60),'#f0f1e9')
        if mode=='sobreposicao': im.paste(base.crop(bounds).resize((w,h),Image.Resampling.LANCZOS),(0,60))
        d=ImageDraw.Draw(im)
        font=ImageFont.truetype(font_path, max(12,min(22,round(scale*13))))
        title=ImageFont.truetype(font_path,18)
        d.rectangle((0,0,w,60),fill='#17382d')
        d.text((12,10),f'EXPORURAL | {name} | {mode.upper()}',fill='white',font=title)
        d.text((12,33),'Prancha tecnica das coordenadas do preview | sem validacao cadastral',fill='#d6e8dc',font=ImageFont.truetype(font_path,13))
        lots=before if mode=='antes' else shapes
        rd=before_roads if mode=='antes' else roads
        if mode!='sobreposicao':
            for r in rd:d.polygon([pos(p) for p in localshape(r)],fill='#66706b')
        for e in lots:
            pts=[pos(p) for p in localshape(e)]
            if mode=='sobreposicao':
                d.line(pts,fill='#cf2145',width=2)
            else:
                d.polygon(pts,fill='#a5bf81',outline='#334e33',width=1)
                center=grid(e['label_anchor']) if 'label_anchor' in e else np.mean(localshape(e)[:-1],axis=0)
                if x0<center[0]<x1 and y0<center[1]<y1:
                    text=e['public_identifier'][2:]; d.text(pos(center),text,fill='#112618',font=font,anchor='mm')
        if mode=='sobreposicao':
            for r in roads:
                if r['public_identifier'].startswith('EXPORURAL-ACESSO'):d.line([pos(p) for p in localshape(r)],fill='#006dd8',width=3)
        if mode!='antes':
            for e in old['entities']:
                if e['publicIdentifier'] in ['B37','B38']:
                    pts=[pos(p) for p in localshape(e)]
                    d.line(pts,fill='#ff7300',width=4)
                    center=np.mean(localshape(e)[:-1],axis=0)
                    if x0<center[0]<x1 and y0<center[1]<y1:
                        d.text(pos(center),e['publicIdentifier']+' conflito',fill='#a84000',font=font,anchor='mm')
        im.save(out/f'{name}-{mode}.png')
print('18 technical plates generated, identical extents before/after/overlay')
