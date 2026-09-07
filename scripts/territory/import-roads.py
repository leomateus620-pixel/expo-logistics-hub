import json,math
w=json.load(open('artifacts/territory/osm-aligned.json'));roads=[]
# Liang-Barsky clipping to the finite decorative support area.
def clip(a,b):
 dx=b[0]-a[0];dz=b[1]-a[1];t0=0;t1=1
 for p,q in [(-dx,a[0]+175),(dx,230-a[0]),(-dz,a[1]+255),(dz,240-a[1])]:
  if abs(p)<1e-10:
   if q<0:return None
  elif p<0:t0=max(t0,q/p)
  else:t1=min(t1,q/p)
  if t0>t1:return None
 return [[round(a[0]+t0*dx,4),round(a[1]+t0*dz,4)],[round(a[0]+t1*dx,4),round(a[1]+t1*dz,4)]]
for x in w:
 t=x['tags'];hw=t.get('highway');pts=x['local']
 if not hw or hw in ['footway','path','steps','cycleway','track'] or t.get('service')=='parking_aisle':continue
 high=bool(t.get('ref')) or hw in ['primary','primary_link','secondary','secondary_link']
 pieces=[];piece=[]
 for a,b in zip(pts,pts[1:]):
  seg=clip(a,b)
  if not seg:continue
  mid=[(seg[0][i]+seg[1][i])/2 for i in range(2)]
  # Preserve established official scene including lateral district. Only exterior edges imported.
  allowed=high or not(-61<mid[0]<61 and -45<mid[1]<49)
  # Existing west approach owns roundabout and arterial in this interval.
  if not high and -90<mid[0]<-40 and -25<mid[1]<49:allowed=False
  if allowed:
   if piece and math.dist(piece[-1],seg[0])<.001:piece.append(seg[1])
   else:
    if len(piece)>1:pieces.append(piece)
    piece=seg
  elif len(piece)>1:pieces.append(piece);piece=[]
 if len(piece)>1:pieces.append(piece)
 for i,ps in enumerate(pieces):
  if len(ps)<2:continue
  roads.append({'id':f'osm-{x["id"]}-{i}','name':t.get('name',t.get('ref','Via externa')),'kind':'highway' if high and not hw.endswith('link') and not t.get('junction') else 'access' if high or hw in ['unclassified','tertiary'] else 'local','points':ps,'width':1.52 if high and not hw.endswith('link') else .98 if hw!='service' else .73,'shoulder':.25 if high else .08,'evidence':'osm-aligned','sourceWay':x['id'],'surface':t.get('surface','unspecified'),'junction':t.get('junction'),'bridge':t.get('bridge'),'layer':t.get('layer','0'),'ref':t.get('ref')})
json.dump({'attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','source':'https://api.openstreetmap.org/api/0.6/map?bbox=-54.49,-27.855,-54.465,-27.828','retrieved':'2026-09-07','calibration':{'a':[-54.4777125,-27.8434439,3964,4200],'b':[-54.4756499,-27.8467157,1110,4185],'c':[-54.4800196,-27.8446064,3964,2440]},'roads':roads},open('src/features/commercial-map/data/territoryRoadSource.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(roads),sum(len(r['points']) for r in roads),'layers',set(r['layer'] for r in roads),'bridges',set(r['bridge'] for r in roads))
