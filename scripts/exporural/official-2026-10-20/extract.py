import pymupdf as fitz, numpy as np,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
from shapely.geometry import LineString,Polygon,Point
from shapely.ops import unary_union,polygonize
p=fitz.open(str(ROOT/'docs/exporural/2028-revisao-2026-10-20/fontes/A1 - Fenasoja Exporural Planta Geral - sem imagem.pdf'))[0]
drawings=[d for d in p.get_drawings() if d['layer']=='LOTES - EXPORURAL']
print('drawings',len(drawings))
paths=[]
for d in drawings:
 for it in d['items']:
  if it[0]=='l': paths.append([list(it[1]),list(it[2])])
  elif it[0]=='c':
   a,b,c,e=map(np.array,it[1:]); paths.append([((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*e).tolist() for t in np.linspace(0,1,17)])
  elif it[0]=='qu':
   q=it[1]; paths.append([list(q.ul),list(q.ur),list(q.lr),list(q.ll),list(q.ul)])
  elif it[0]=='re':
   q=it[1]; paths.append([list(q.tl),list(q.tr),list(q.br),list(q.bl),list(q.tl)])
  else: raise Exception(it)
# PDF line/Bezier exporters differ at endpoints by <0.07 pt. Merge endpoint
# clusters at 0.10 pt (0.018 m on paper), never fit areas or raster contours.
pts=[(i,j,p) for i,path in enumerate(paths) for j,p in enumerate(path) if j in (0,len(path)-1)]
parents=list(range(len(pts)))
def find(i):
 while parents[i]!=i: parents[i]=parents[parents[i]];i=parents[i]
 return i
for i,(_,_,a) in enumerate(pts):
 for j,(_,_,b) in enumerate(pts[:i]):
  if np.linalg.norm(np.array(a)-b)<.1:parents[find(i)]=find(j)
groups={}
for i,(_,_,pt) in enumerate(pts):groups.setdefault(find(i),[]).append(pt)
centers={i:np.mean(v,axis=0).tolist() for i,v in groups.items()}
for i,(path,j,_) in enumerate(pts):paths[path][j]=centers[find(i)]
faces=list(polygonize(unary_union([LineString(x) for x in paths if len(set(map(tuple,x)))>1])))
print('faces',len(faces), sorted([round(x.area,1) for x in faces])[-10:])
polys={}
for w in p.get_text('words'):
 x0,y0,x1,y1,txt,*_=w
 if not txt.isdigit() or len(txt)!=2:continue
 x,y=(x0+x1)/2,(y0+y1)/2
 block='S' if 400<y<800 else 'R' if 800<y<1500 else None
 if block is None:continue
 hits=[f for f in faces if f.contains(Point(x,y)) and f.area>500]
 if not hits: print('MISSING',block,txt,x,y);continue
 code=f'Q-{block}-{int(txt):02}'
 polys[code]=min(hits,key=lambda q:q.area)
print('found',len(polys),sorted(polys))
json.dump({'paths':paths,'polys':{k:list(v.exterior.coords) for k,v in polys.items()}},open('/tmp/exporural-vectors.json','w'))
