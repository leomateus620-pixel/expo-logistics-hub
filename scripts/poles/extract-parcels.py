"""Extract black source cells; register each parcel locally without modifying the plan."""
import pdfplumber,json,sys,hashlib
from pathlib import Path
from shapely import set_precision
from shapely.geometry import LineString,Point,Polygon
from shapely.ops import polygonize,unary_union
base=Path('docs/validation/pole-location')
pdf=Path(sys.argv[1]);assert hashlib.sha256(pdf.read_bytes()).hexdigest()=='bbe9603392feb499fd0f2bc604f61e79dbf2a841504b92848253f9f9b9f679ce'
with pdfplumber.open(pdf) as d:
 p=d.pages[0]; lines=[]
 for obj in [*p.curves,*p.lines,*p.rects]:
  if obj.get('stroking_color') not in [(0.,0.,0.),0]:continue
  points=[(round(x,2),round(y,2)) for x,y in obj['pts']]
  for a,b in zip(points,points[1:]):
   if a!=b:lines.append(LineString([a,b]))
 cells=list(polygonize(unary_union([set_precision(line,.1) for line in lines])))
print('cells',len(cells))
data=json.loads((base/'baseline-inventory.json').read_text(encoding='utf-8'))
m=[[.129924644,-.000030718164,-80.2768449],[.000040594404,.129907002,-57.7913497]]
world=lambda p: [m[0][0]*p[0]+m[0][1]*p[1]+m[0][2],m[1][0]*p[0]+m[1][1]*p[1]+m[1][2]]
worldcells=[Polygon([world(p) for p in c.exterior.coords]) for c in cells]
lots=[(e,Polygon(e['geometry']['coordinates'][0])) for e in data['data']['entities'] if e['classification']=='SELLABLE_LOT']
matches=[]
for i,c in enumerate(worldcells):
 if c.area<.3 or c.area>100:continue
 best=sorted([(c.intersection(g).area/c.union(g).area,e) for e,g in lots if c.intersects(g)],key=lambda x:-x[0])
 if best and best[0][0]>.55:
  matches.append({'id':best[0][1]['publicIdentifier'],'iou':best[0][0],'polygon':list(cells[i].exterior.coords),'sourceCell':i})
print('matches',len(matches),'lot total',len(lots))
assigned=[]
for n in data['nodes']:
 if n['type']!='POLE':continue
 pt=Point(n['sourcePagePosition']);hits=[c for c in matches if Polygon(c['polygon']).buffer(1.0).covers(pt)]
 if hits:
  c=min(hits,key=lambda c:Polygon(c['polygon']).distance(pt));assigned.append({'id':n['sourceMarkerId'],'lot':c['id'],'iou':round(c['iou'],4),'sourceCell':c['sourceCell']})
print('assigned',len(assigned));print(assigned[:20])
(base/'pdf-cells.json').write_text(json.dumps({'matches':matches,'assigned':assigned}),encoding='utf-8')

bindings={a['id']:a['lot'] for a in assigned}
Path('src/features/commercial-map/data/electricalSourceLots.json').write_text(json.dumps(bindings,indent=2)+'\n',encoding='utf-8')
