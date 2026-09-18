"""Create compact, reviewable evidence from completed local scene runs (Pillow)."""
import json, statistics
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops, ImageStat

root = Path(__file__).resolve().parents[2]
out = root / 'docs/validation/internal-ground'
final = json.loads((out/'final/runtime.json').read_text())
baselines = [json.loads((out/p/'runtime.json').read_text()) for p in ['baseline-fixed','baseline-repeat']]
summary = {'browser': final['browser'], 'fixture': True, 'viewport': final['viewport'], 'views': len(final['views']), 'performance': []}
for name in dict.fromkeys(m['name'] for m in final['metrics']):
    before = [m for r in baselines for m in r['metrics'] if m['name'] == name]
    after = [m for m in final['metrics'] if m['name'] == name]
    b, a = [statistics.median(m['meanMs'] for m in group) for group in [before, after]]
    summary['performance'].append({'view':name, 'beforeMedianMs':b, 'afterMedianMs':a, 'deltaPercent':100*(a/b-1),
       'beforeSamplesMs':[m['meanMs'] for m in before], 'afterSamplesMs':[m['meanMs'] for m in after],
       'beforeCalls':[m['renderer']['calls'] for m in before], 'afterCalls':[m['renderer']['calls'] for m in after]})
summary['scene'] = {phase:{k:r['final']['spatial'][k] for k in ['meshes','instances','allocatedTriangles','geometries','materials','geometryBufferBytes']} for phase,r in [('before',baselines[-1]),('after',final)]}
summary['renderer'] = {phase:{k:r['metrics'][-1]['renderer'][k] for k in ['geometries','textures','programs','dpr','width','height','gpuRenderer']} for phase,r in [('before',baselines[-1]),('after',final)]}
summary['health'] = final['final']['health']
areas = ['quadraA','quadraB','bosque','etnias','expositores','visitantes','arena','exporural','br472','motorhome','amusement','rearParking','parkingSeam']
for view in ['top','oblique','low','medium','far']:
    sheet=Image.new('RGB',(1920,1344),'white');draw=ImageDraw.Draw(sheet)
    for i, area in enumerate(areas):
        im=Image.open(out/'final'/f'{area}-{view}.png');im.thumbnail((480,316));x=(i%4)*480;y=(i//4)*336
        sheet.paste(im,(x,y+20));draw.text((x+6,y+3),area+' '+view,fill='black')
    sheet.save(out/f'review-{view}.jpg',quality=88)
for folder in ['final','stress','functional']:
    for src in (out/folder).glob('*.png'):
        Image.open(src).convert('RGB').save(src.with_suffix('.webp'),quality=86,method=4)
comparison=Image.new('RGB',(1440,5*494),'white');draw=ImageDraw.Draw(comparison)
for i, area in enumerate(['quadraA','bosque','etnias','expositores','arena']):
    for j, phase in enumerate(['before','final']):
        im=Image.open(out/phase/f'{area}-oblique.png');im.thumbnail((720,474))
        comparison.paste(im,(j*720,i*494+20));draw.text((j*720+6,i*494+3),area+' - '+phase,fill='black')
comparison.save(out/'before-after.jpg',quality=88)
a,b=[Image.open(out/phase/'external.png').convert('RGB').crop((400,160,1100,780)) for phase in ['before','final']]
diff=ImageChops.difference(a,b)
summary['externalSample']={'crop':[400,160,1100,780],'meanAbsoluteRgb':ImageStat.Stat(diff).mean,'differentPixelFraction':sum(p!=(0,0,0) for p in diff.getdata())/(700*620)}
(out/'summary.json').write_text(json.dumps(summary,indent=2))
rows=[]
for area in areas:
    images=''.join(f'<td><a href="final/{area}-{v}.webp"><img loading="lazy" src="final/{area}-{v}.webp"></a></td>' for v in ['top','oblique','low','medium','far'])
    rows.append(f'<tr><th>{area}</th>{images}</tr>')
html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Solo interno — validação visual</title><style>body{font:15px system-ui;margin:24px;background:#f2f5f1;color:#142820}table{width:100%;border-collapse:collapse}td,th{padding:5px}img{width:100%;display:block}th{text-align:left}a{color:inherit}</style><h1>Solo interno canônico</h1><p>Rota /mapa-comercial, cena real com dados de teste locais. Clique em cada captura para ampliar. <a href="README.md">Auditoria e resultados</a> · <a href="summary.json">Métricas</a></p><p>13 regiões, cinco perspectivas; nenhum plano acrescentado para preencher a faixa entre estacionamentos.</p><table><tr><th>Região</th><th>Superior</th><th>Oblíqua</th><th>Baixa</th><th>Intermediária</th><th>Afastada</th></tr>'''+''.join(rows)+'</table></html>'
(out/'index.html').write_text(html,encoding='utf-8')
print(json.dumps(summary,indent=2))
