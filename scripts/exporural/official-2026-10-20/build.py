"""Compile official PDF vectors against an explicitly exported live inventory.
Never imports preview IDs, estimates official areas, or mutates a database.
Dependencies: pymupdf, numpy, shapely. Run extract.py first.
"""
import csv,hashlib,json,math,sys,uuid
from pathlib import Path
from decimal import Decimal
import numpy as np
from shapely.geometry import Polygon,Point,LineString,box,mapping,shape
from shapely.affinity import affine_transform
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/exporural/2028-revisao-2026-10-20'
DATA=ROOT/'src/features/commercial-map/data/exporural2028October'
REV='2028-exporural-2026-10-20.1'
PDF=OUT/'fontes/A1 - Fenasoja Exporural Planta Geral - sem imagem.pdf'
assert hashlib.sha256(PDF.read_bytes()).hexdigest()=='863fac46cc4f7b00a6e04c8d25be9b81396c0ae4af0a9da2be8209c4fdd9065f'
V=json.load(open('/tmp/exporural-vectors.json'));live=json.load(open(sys.argv[1]))
L={r['lot']['public_identifier']:r for r in live['lots']};roads={r['entity']['public_identifier']:r for r in live['roads']}
P={k:Polygon(v) for k,v in V['polys'].items()}
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def geom(p):
 assert p.geom_type=='Polygon' and p.is_valid and not p.is_empty
 return json.loads(json.dumps(mapping(p)))
def oldpoly(r):return shape(r['geometry']['geometry'])
# Multiple stable centroids surround the intervention. Fit a single similarity,
# retaining park placement, rotation and local registered scale. No per-lot fit.
codes=[f'Q-S-{n:02}' for n in [10,18,19,20,21,22,23,24,25]]+[f'Q-R-{n:02}' for n in [37,38,39,26,27,28]]
A=np.array([P[c].centroid.coords[0] for c in codes]);B=np.array([oldpoly(L[c]).centroid.coords[0] for c in codes])
X=np.array([[x,-y,1,0] if i==0 else [y,x,0,1] for x,y in A for i in range(2)])
a,b,tx,ty=np.linalg.lstsq(X,B.ravel(),rcond=None)[0]
T=[a,-b,b,a,tx,ty];T=[float(x) for x in T]
# PDF 1:500: one metre occupies 5.6692913 points. Local metric calibration is
# independent of printed areas. Do not reinterpret normalized scene units as m.
PDF_POINTS_PER_M=72/25.4*2
units_per_m=math.hypot(a,b)*PDF_POINTS_PER_M
local={c:affine_transform(p,T) for c,p in P.items()}
controls=[dict(code=c,pdf=A[i].tolist(),persisted=B[i].tolist(),residual_m=float(np.linalg.norm(np.array(local[c].centroid.coords[0])-B[i])/units_per_m)) for i,c in enumerate(codes)]
write(OUT/'calibracao.json',dict(revision=REV,transform=T,type='single local similarity; global project untouched',pdfPointsPerMeter=PDF_POINTS_PER_M,mapUnitsPerMeter=units_per_m,controls=controls,rmseMeters=math.sqrt(sum(c['residual_m']**2 for c in controls)/len(controls)),maxResidualMeters=max(c['residual_m'] for c in controls),endpointSnapPoints=.1,curveSegmentsPerBezier=16,areaToleranceSqm=.15,registrationToleranceMeters=.65,precision='PDF vector quantization plus inherited raster registration; not geodetic coordinates'))
areas={c:format(Decimal(str(r['lot']['official_area_sqm'])),'.2f') for c,r in L.items() if c.startswith('Q-')}
for n,v in enumerate(['449.91','376.85','376.88','506.30','450.00','450.00','348.98'],11):areas[f'Q-S-{n:02}']=v
for n,v in enumerate(['268.01','268.01','268.03','268.00','268.00','268.01','267.85','333.34','268.07','268.02','268.01','268.02','268.03','268.04','268.04'],40):areas[f'Q-R-{n:02}']=v
for n in range(55,73):areas[f'Q-R-{n:02}']=format(Decimal(str(L[f'Q-R-{n-7:02}']['lot']['official_area_sqm'])),'.2f')
assert len(areas)==107
assert sum(Decimal(v) for c,v in areas.items() if c.startswith('Q-R'))==Decimal('29444.39')
assert sum(Decimal(v) for c,v in areas.items() if c.startswith('Q-S'))==Decimal('16113.47')
manifest=[dict(code=c,block=c[2],lot_number=int(c[-2:]),official_area_sqm=areas[c],source_page=1) for c in sorted(areas)]
write(DATA/'manifest.json',manifest)
retired=[L[f'Q-R-{n:02}'] for n in range(40,48)]
targets=[]
for row in manifest:
 c=row['code']; n=row['lot_number'];block=row['block']
 if not ((block=='R' and n>=40) or (block=='S' and 11<=n<=17)):continue
 previous=c if block=='S' else f'Q-R-{n-7:02}' if n>=55 else None
 r=L[previous] if previous else None
 # Explicit mandate: four lower geometries and calculated areas remain bit-identical.
 p=oldpoly(r) if block=='R' and n>=69 else local[c]
 entity_id=r['entity']['id'] if r else str(uuid.uuid5(uuid.NAMESPACE_URL,REV+':entity:'+c))
 lot_id=r['lot']['id'] if r else str(uuid.uuid5(uuid.NAMESPACE_URL,REV+':lot:'+c))
 origins=[]
 if not r:
  for old in retired:
   overlap=p.intersection(oldpoly(old)).area/units_per_m**2
   if overlap>.01:origins.append(dict(lot_id=old['lot']['id'],entity_id=old['entity']['id'],code=old['lot']['public_identifier'],overlap_sqm=round(overlap,6)))
 assert r or origins,c
 targets.append(dict(**row,kind='lot',entity_id=entity_id,lot_id=lot_id,previous_code=previous,action='preserve' if r else 'create',preserve_geometry=block=='R' and n>=69,geometry=geom(p),label_anchor=list(p.representative_point().coords[0]),calculated_area_sqm=r['lot']['calculated_area_sqm'] if block=='R' and n>=69 else round(p.area/units_per_m**2,6),source_pdf_polygon=list(P[c].exterior.coords),origins=origins))
# Exact vector gaps from the actual divider edges. Passage has no official name.
# Include intersections up to the receiving road, never below Emanuel.
def vertex(c,edge):
 pts=list(P[c].exterior.coords)[:-1]
 return sorted(pts,key=lambda p:p[0],reverse=edge=='right')[:2]
def gap(left,right):
 a=sorted(vertex(left,'right'),key=lambda p:p[1]);b=sorted(vertex(right,'left'),key=lambda p:p[1])
 return Polygon([a[0],b[0],b[1],a[1]])
def joined_gap(a,b,c,d):
 top=list(gap(a,b).exterior.coords)[:-1];bottom=list(gap(c,d).exterior.coords)[:-1]
 return Polygon([top[0],top[1],top[2],bottom[1],bottom[2],bottom[3],bottom[0],top[3]]).buffer(0)
gaps=[gap('Q-S-13','Q-S-14'),joined_gap('Q-R-42','Q-R-43','Q-R-50','Q-R-51'),joined_gap('Q-R-57','Q-R-58','Q-R-64','Q-R-65')]
# Connect each longitudinal strip across its bordering horizontal roads. Only
# the previously persisted lower passage owns the final segment.
new_roads=[]
for i,g in enumerate(gaps):
 p=affine_transform(g,T)
 # A 6 m extension at each end connects to horizontal streets; clip to lot union
 # and the actual receiving road envelopes below, preserving each curb.
 x0,y0,x1,y1=p.bounds
 all_lots=unary_union([shape(t['geometry']) for t in targets]+[oldpoly(r) for c,r in L.items() if c not in [x['lot']['public_identifier'] for x in retired] and not any(t['previous_code']==c for t in targets)])
 bordering=[('RUA-BRUNO-SCHWARTZ','RUA-JOHAN-MULLER'),('RUA-JOHAN-MULLER','RUA-GUSTAVO-BESSEL'),('RUA-GUSTAVO-BESSEL','RUA-EMANUEL-BRACHMANN')][i]
 # Follow the straight surveyed edges, extending only into receiving streets.
 strip=Polygon([list(p.exterior.coords)[0],list(p.exterior.coords)[1],list(p.exterior.coords)[2],list(p.exterior.coords)[3]]) if i==0 else p
 ext=p.union(LineString([p.centroid.coords[0],(p.centroid.x,y0-.9)]).buffer((x1-x0)/2,cap_style=2)).union(LineString([p.centroid.coords[0],(p.centroid.x,y1+.9)]).buffer((x1-x0)/2,cap_style=2))
 # End caps land within horizontal roads; protect all lot faces including corners.
 miny=min(oldpoly(roads[c]).bounds[1] for c in bordering);maxy=max(oldpoly(roads[c]).bounds[3] for c in bordering)
 ext=ext.intersection(box(x0-.1,miny,x1+.1,maxy)).difference(all_lots)
 if ext.geom_type!='Polygon':ext=max(ext.geoms,key=lambda q:q.area)
 code=f'EXPORURAL-PASSAGEM-LESTE-{i+1:02}' if i<2 else 'EXPORURAL-PASSAGEM-INTERNA-01'
 old=roads.get(code)
 new_roads.append(dict(code=code,kind='road',name='Passagem longitudinal leste - trecho '+str(i+1),entity_id=old['entity']['id'] if old else str(uuid.uuid5(uuid.NAMESPACE_URL,REV+':entity:'+code)),action='preserve' if old else 'create',previous_code=code if old else None,geometry=geom(ext),label_anchor=list(p.representative_point().coords[0]),documented_width_m=3,source_pdf_polygon=list(g.convex_hull.exterior.coords),name_confirmed=False))
# Rebuild only the affected east portions of existing streets as the negative
# space between official lots. Original road geometry outside the mask survives.
lot_union=unary_union([shape(t['geometry']) for t in targets])
old_changed=unary_union([oldpoly(r) for r in retired]+[oldpoly(L[t['previous_code']]) for t in targets if t['previous_code'] and not t['preserve_geometry']])
# Fill freed edge slivers along the original roads; never pave the whole block.
for code in ['RUA-BRUNO-SCHWARTZ','RUA-JOHAN-MULLER','RUA-GUSTAVO-BESSEL','RUA-EMANUEL-BRACHMANN','RUA-15-NOVEMBRO','RUA-UBIRETAMA']:
 old=roads[code];original=oldpoly(old)
 affected=box(40.7,-32.4,57.1,-13.4)
 # Curbs adjacent to changed lots follow the official vector outline. Freed old
 # land is paved only within 0.65 m of its existing street footprint.
 freed=old_changed.difference(lot_union).intersection(original.buffer(units_per_m*.65)).intersection(affected)
 p=original.union(freed).difference(lot_union)
 if p.geom_type!='Polygon':
  # Existing self-near raster footprints may leave detached millimetric pieces.
  p=max(p.geoms,key=lambda q:q.area)
 new_roads.append(dict(code=code,kind='road',name=old['entity']['name'],entity_id=old['entity']['id'],action='preserve',previous_code=code,geometry=geom(p),label_anchor=old['entity']['metadata'].get('labelAnchor'),name_confirmed=True))
# Validate target topologies independently. Original unrelated raster overlaps are
# reported separately and never fixed by silently moving neighboring parcels.
for i,t in enumerate(targets):
 p=shape(t['geometry']);assert p.contains(Point(t['label_anchor'])),t['code']
 for u in targets[:i]:assert p.intersection(shape(u['geometry'])).area<1e-7,(t['code'],u['code'])
for t in targets:
 for r in new_roads:assert shape(t['geometry']).intersection(shape(r['geometry'])).area<1e-7,(t['code'],r['code'])
write(DATA/'lots.json',targets);write(DATA/'roads.json',new_roads)
expected=[]
for r in retired+[L[t['previous_code']] for t in targets if t['previous_code']]+[roads[r['previous_code']] for r in new_roads if r['previous_code']]:
 expected.append(dict(entity_id=r['entity']['id'],entity_updated_at=r['entity']['updated_at'],lot_id=r.get('lot',{}).get('id'),lot_updated_at=r.get('lot',{}).get('updated_at'),geometry_id=r['geometry']['id'],geometry_version=r['geometry']['version'],geometry=r['geometry']['geometry'],retire=r in retired))
write(OUT/'expected-before.json',expected)
write(OUT/'payload.json',dict(**({'expected_fingerprint':sys.argv[2]} if len(sys.argv)>2 else {}),revision=REV,source_sha256=hashlib.sha256(PDF.read_bytes()).hexdigest(),project_id=live['project']['id'],org_id=live['project']['org_id'],segment_id='feb6fcb7-5bc4-4725-ad74-d408a7b56522',expected_source_revision='2028-exporural-2026-09-25.1',map_units_per_meter=units_per_m,expected=expected,targets=targets+new_roads,manifest=manifest))
with (OUT/'crosswalk.csv').open('w') as f:
 w=csv.writer(f,lineterminator="\n");w.writerow(['previous_code','new_code','lot_uuid','entity_uuid','action','geometry','official_area_sqm','origin_uuids'])
 for t in targets:w.writerow([t['previous_code'],t['code'],t['lot_id'],t['entity_id'],t['action'],'unchanged' if t['preserve_geometry'] else 'PDF vectors',t['official_area_sqm'],';'.join(o['lot_id'] for o in t['origins'])])
write(OUT/'geometry-qa.json',dict(numbered_lots=107,R=72,S=35,affected_lots=len(targets),target_overlaps=0,road_lot_overlaps=0,source_vector_faces=len(P),unitsPerMeter=units_per_m,areaResiduals=[dict(code=t['code'],official=t['official_area_sqm'],calculated=t['calculated_area_sqm'],delta=round(float(t['calculated_area_sqm'])-float(t['official_area_sqm']),6)) for t in targets if not t['preserve_geometry']]))
print('Built',len(targets),'lots,',len(new_roads),'roads; local scale',units_per_m)
