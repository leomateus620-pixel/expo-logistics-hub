"""Digitize supplied raster boundaries, register only Exporural, export review artifacts.

Python dependencies: numpy, Pillow, opencv-python-headless, shapely.
No polygon is resized to match an official area. All unresolved identities stay pending.
Run from the repository root. Input directory defaults to ~/Downloads.
"""
import csv
import hashlib
import json
import math
import sys
from decimal import Decimal
from pathlib import Path
sys.path.insert(0, str(Path('.codex-tmp/exporural-python').resolve()))
import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, Point, MultiPoint, LineString
from shapely.ops import unary_union, snap
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/exporural/2028-revisao-2026-09-25'
DATA = ROOT / 'src/features/commercial-map/data/exporural2028'
DATA.mkdir(parents=True, exist_ok=True)
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads'
REV = '2028-exporural-2026-09-25.1'
OLD_REV = '2026.4-exporural.1'
VERSION = 6
FILES = [('Fenasoja_Parque_Ajustes_300dpi.png', 'areas-dimensions-boundaries'),
         ('Fenasoja_So_Numeros_300dpi.png', 'numbering-topology'),
         ('WhatsApp Image 2026-09-25 at 20.25.06.jpeg', 'visual-before-only')]

def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

sources = []
for name, role in FILES:
    p = SOURCE / name
    with Image.open(p) as im:
        sources.append(dict(filename=name, role=role, sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                            width=im.width, height=im.height, dpi=im.info.get('dpi')))
assert sources[0]['width'] == sources[1]['width'] == 9934
assert sources[0]['height'] == sources[1]['height'] == 7017
old = json.loads((OUT / 'referencia_anterior.json').read_text(encoding='utf-8'))
old_entities = {e['publicIdentifier']: e for e in old['entities']}
old_lots = {l['publicIdentifier']: l for l in old['lots']}

# Inventory transcription checked against the dimensions raster. Decimal strings
# are the canonical area, not a polygon-generation input.
r = {i: '450.00' for i in range(1, 66)}
def put(d, ns, value):
    for n in ns: d[n] = value
put(r, [1,2,14], '896.85'); put(r, [3], '650.00'); put(r,[4],'644.75')
put(r,[9,10],'453.42'); put(r,[11,12,29,30,31],'452.42')
put(r,[13],'575.85'); put(r,[15],'472.10'); put(r,range(20,23),'500.00')
put(r,range(23,26),'504.28'); put(r,range(26,29),'495.00')
put(r,range(32,40),'447.55'); put(r,range(40,47),'500.00'); put(r,[47],'705.35')
for n, a in enumerate(['249.64','249.12','250.05','251.01','250.00','249.96','356.69',
                       '249.60','249.03','248.02','249.12','250.00','250.03','242.21'],48): r[n]=a
put(r,range(62,66),'471.00')
s = {i:'450.00' for i in range(1,36)}
put(s,range(1,4),'500.00'); put(s,[4],'692.09'); put(s,range(5,11),'450.11')
put(s,[17],'348.98'); put(s,[18],'411.83'); put(s,[35],'649.97')
assert sum(map(Decimal,r.values())) == Decimal('29564.26')
assert sum(map(Decimal,s.values())) == Decimal('16203.53')

# Seed points identify contour interiors, not guessed vertices. Coordinates below
# are in a 1888-wide inspection grid; all contours are read at native resolution.
seeds = {}
bands = {}
def band(block, numbers, xs, y, name):
    codes = []
    for n,x in zip(numbers,xs):
        code=f'Q-{block}-{n:02}'
        seeds[code]=(x,y)
        codes.append(code)
    bands[name] = codes
band('S',range(35,24,-1),[620,700,770,835,905,970,1035,1105,1170,1240,1305],370,'S superior esquerda')
band('S',range(24,17,-1),[1400,1470,1535,1600,1670,1740,1800],370,'S superior direita')
band('S',range(1,5),[615,690,760,850],525,'S inferior oeste')
band('S',range(5,11),[970,1035,1100,1170,1235,1305],525,'S inferior centro')
band('S',range(11,18),[1400,1470,1535,1600,1670,1740,1800],525,'S inferior leste')
band('R',[15,16,17,18,19,5,6,7,8],[112,161,209,257,305,350,400,449,495],695,'R superior oeste')
band('R',[9,10,11,12,29,30,31],[582,634,680,730,782,835,885],700,'R superior central oeste')
band('R',range(32,40),[970,1020,1070,1120,1170,1220,1270,1320],700,'R superior central leste')
band('R',range(40,48),[1405,1460,1515,1570,1625,1680,1735,1800],700,'R superior direita')
band('R',[13],[200],890,'R faixa rasa oeste')
band('R',[14],[302],920,'R longitudinal oeste')
band('R',[1],[400],910,'R dupla oeste superior')
band('R',[2],[400],1030,'R dupla oeste inferior')
band('R',[3],[685],900,'R dupla central superior')
band('R',[4],[685],990,'R dupla central inferior')
band('R',[20,21,22],[750,815,880],890,'R inferior central oeste')
band('R',[23,24,25],[975,1040,1100],890,'R inferior central meio')
band('R',[26,27,28],[1190,1250,1310],890,'R inferior central leste')
band('R',[48,49,50],[1410,1465,1525],875,'R pequena ilha superior oeste')
band('R',[51,52,53,54],[1595,1650,1710,1790],875,'R pequena ilha superior leste')
band('R',[55,56,57],[1410,1465,1525],1000,'R pequena ilha inferior oeste')
band('R',[58,59,60,61],[1595,1650,1710,1770],1000,'R pequena ilha inferior leste')
band('R',[62,63,64,65],[1510,1600,1660,1710],1080,'R perimetro inferior')
assert len(seeds)==100

native=cv2.imread(str(SOURCE/FILES[1][0]))
factor=native.shape[1]/1888
_,binary=cv2.threshold(cv2.cvtColor(native,cv2.COLOR_BGR2GRAY),230,255,cv2.THRESH_BINARY)
contours,_=cv2.findContours(binary,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
candidates=[c for c in contours if 45000<cv2.contourArea(c)<1100000]
raw={}
for code,(x,y) in seeds.items():
    hits=[c for c in candidates if cv2.pointPolygonTest(c,(x*factor,y*factor),False)>0]
    assert hits, f'No enclosed contour for {code}'
    c=min(hits,key=cv2.contourArea)
    # Sub-pixel inspection-grid simplification removes raster staircase noise.
    p=cv2.approxPolyDP(c, 3.2, True).reshape(-1,2)/factor
    raw[code]=Polygon(p)
assert len({p.wkb for p in raw.values()})==100

# Share identical divider vertices. Thin raster strokes leave paired edges;
# cluster endpoints within 1.4 inspection px (0.31 m), then insert all junctions
# on neighbors. No movement depends on the printed area.
coords=[(code,i,np.array(p)) for code,poly in raw.items() for i,p in enumerate(poly.exterior.coords[:-1])]
parent=list(range(len(coords)))
def find(i):
    while parent[i]!=i:
        parent[i]=parent[parent[i]]; i=parent[i]
    return i
for i,(_,_,p) in enumerate(coords):
    for j in range(i):
        if coords[i][0]!=coords[j][0] and np.linalg.norm(p-coords[j][2])<1.4:
            parent[find(i)]=find(j)
groups={}
for i,(_,_,p) in enumerate(coords): groups.setdefault(find(i),[]).append(p)
centers={i:np.mean(ps,axis=0) for i,ps in groups.items()}
snapped={code:[] for code in raw}
for i,(code,_,_) in enumerate(coords): snapped[code].append(centers[find(i)])
polys={code:Polygon(ps) for code,ps in snapped.items()}
vertices=MultiPoint([p for poly in polys.values() for p in poly.exterior.coords])
polys={code:snap(poly,vertices,1.0) for code,poly in polys.items()}
for code,p in polys.items(): assert p.is_valid, f'Invalid boundary {code}'

# Registration controls connect stable physical corners to the REPOSITORY plan
# frame. They do not certify cadastral/geodetic coordinates. Independent checks
# are excluded from the least-squares fit. Original global conversion is intact.
controls=[
 ('S west upper corner',[575.1,328.8],[4004,1277]),
 ('S east island upper west corner',[1373.1,322.5],[5227,1277]),
 ('R central upper west tangent',[556.1,652.6],[3994,1763]),
 ('R small west island west tangent',[1378.7,854.1],[5228,2080]),
 ('R01 west upper corner',[352.7,867.6],[3687,2080]),
 ('R62 west upper corner',[1483.8,1048.0],[5378,2374]),
]
checks=[('R13 southwest',[61.2,930.9],[3244,2165]),
        ('R02 southeast',[524.4,1079.2],[3940,2415.095355731225]),
        ('R west band northeast',[519.9,643.9],[3943.012028601695,1763])]
A=np.array([[*p,1] for _,p,_ in controls])
B=np.array([q for _,_,q in controls])
matrix=np.linalg.lstsq(A,B,rcond=None)[0]
def source_point(p): return np.array([*p,1])@matrix
def local_point(p):
    x,y=source_point(p)
    return [round((x-600)/5500*120-60,9),round((y-900)/4150*(120*4150/5500)-(120*4150/5500)/2,9)]
def local_poly(p): return orient(Polygon([local_point(q) for q in p.exterior.coords]),sign=1.0)
def control_record(row):
    name,p,q=row; residual=source_point(p)-q
    return dict(name=name,raster_native_px=[round(v*factor,3) for v in p],repository_source=q,
                fitted_source=source_point(p).tolist(),residual_m=float(np.linalg.norm(residual)/6.875))
calibration=dict(revision=REV,status='REQUIRES_CARTOGRAPHIC_APPROVAL',
    coordinateSystem='LOCAL_NORMALIZED',srid=0,units='scene units; 0.15 scene units per metre',
    nativeRaster=dict(width=9934,height=7017,origin='top left',x='right',y='down'),
    inspectionGrid=dict(width=1888,height=7017/factor,nativePixelsPerGridUnit=factor),
    rasterGridToHistoricalSourceAffine=matrix.tolist(),
    historicalSourceToLocal=dict(crop=[600,900,5500,4150],width=120,height=120*4150/5500),
    controls=[control_record(c) for c in controls],independentChecks=[control_record(c) for c in checks],
    gridAxesScaleSourceUnits=[float(np.linalg.norm(matrix[0])),float(np.linalg.norm(matrix[1]))],
    gridXRotationDegrees=float(math.degrees(math.atan2(matrix[0,1],matrix[0,0]))),
    precision='Raster digitization and repository registration; not a cadastral survey or centimetric accuracy',
    extraction=dict(source=FILES[1][0],threshold=230,simplificationNativePx=3.2,sharedEndpointSnapGridPx=1.4,
                    note='Extracted closed white faces. Shared divider nodes averaged; junctions snapped. No area fitting.'),
    previousAreaTolerancePercent=0.15,areaToleranceApproved=False)
for key in ['controls','independentChecks']:
    vals=[c['residual_m'] for c in calibration[key]]
    calibration[key+'RmseMeters']=math.sqrt(sum(v*v for v in vals)/len(vals))
    calibration[key+'MaxMeters']=max(vals)

manifest=[]; geometries=[]
for block,areas in [('R',r),('S',s)]:
    for n,area in sorted(areas.items()):
        code=f'Q-{block}-{n:02}'
        p=local_poly(polys[code]); ring=[list(q) for q in p.exterior.coords]
        label=list(p.representative_point().coords[0])
        calculated=p.area/(0.15**2)
        geom=dict(public_identifier=code,revision=REV,geometry_version=VERSION,
                  geometry=dict(type='Polygon',coordinates=[ring]),label_anchor=label,
                  raster_native_ring=[[round(x*factor,3),round(y*factor,3)] for x,y in polys[code].exterior.coords],
                  calculated_area_sqm=round(calculated,6),
                  area_difference_percent=round((calculated-float(area))/float(area)*100,6),
                  geometry_sha256=digest(dict(type='Polygon',coordinates=[ring])),
                  verification='NEEDS_REVIEW',area_validation_status='UNVALIDATED')
        geometries.append(geom)
        manifest.append(dict(public_identifier=code,block=block,lot_number=f'{n:02}',official_area_sqm=area,
          revision=REV,geometry_version=VERSION,source_area=FILES[0][0],source_area_sha256=sources[0]['sha256'],
          source_topology=FILES[1][0],source_topology_sha256=sources[1]['sha256'],
          physical_group=next(k for k,v in bands.items() if code in v),
          lineage_status='PENDING',commercial_release='NOT_AUTHORIZED',geometry_sha256=geom['geometry_sha256']))

# Street surfaces are bounded by the same parcel graph, with intersections
# allowed. Their source envelopes follow the depicted corridors only.
road_inputs=[
 ('RUA-BRUNO-SCHWARTZ','Rua Bruno Schwartz',[(554,463),(1840,453),(1837,483),(554,491)],'adjust_existing'),
 ('RUA-JOHAN-MULLER','Rua Johan Muller',[(554,625),(1835,615),(1854,644),(554,654)],'adjust_existing'),
 ('RUA-GUSTAVO-BESSEL','Rua Gustavo Bessel',[(59,844),(524,834),(556,829),(1858,822),(1843,852),(1378,856),(1140,859),(918,864),(558,869),(524,864),(59,876)],'adjust_existing'),
 ('RUA-EMANUEL-BRACHMANN','Rua Emanuel Brachmann',[(1141,1016),(1798,1022),(1783,1049),(1141,1047)],'adjust_existing'),
 ('RUA-15-NOVEMBRO','Rua 15 de Novembro',[(1347,319),(1374,319),(1378,1048),(1351,1047)],'adjust_existing'),
 ('RUA-PASTOR-ALBERT-LEHENBAUER','Rua Pastor Albert Lehenbauer',[(552,320),(576,320),(555,625),(556,650),(560,1102),(525,1102),(519,644),(550,644)],'adjust_existing'),
 ('RUA-UBIRETAMA','Rua Ubiretama',[(1841,319),(1865,319),(1865,890),(1743,1270),(1720,1263),(1783,1060),(1828,935),(1858,790),(1835,615)],'adjust_existing'),
 ('EXPORURAL-ACESSO-TRANSVERSAL-01','Via interna — denominação a confirmar',[(914.8,473),(941.8,473),(946.3,1019),(919.4,1019)],'new_road'),
 ('EXPORURAL-PASSAGEM-INTERNA-01','Passagem interna — denominação a confirmar',[(1558.6,852),(1572.6,852),(1574,1038),(1560,1038)],'existing_passage_new_entity'),
 ('EXPORURAL-PASSAGEM-INTERNA-02','Corredor existente — denominação a confirmar',[(1140,858),(1167,858),(1167,1047),(1141,1047)],'existing_passage_new_entity'),
]
all_lots=unary_union(list(polys.values()))
roads=[]
for code,name,pts,action in road_inputs:
    # Clipping at the digitized faces avoids asphalting corner arcs or lots.
    p=Polygon(pts).difference(all_lots)
    if p.geom_type=='MultiPolygon':
        pieces=sorted(p.geoms,key=lambda p:p.area,reverse=True)
        assert sum(q.area for q in pieces[1:])<20, (code,'disconnected road')
        p=pieces[0]
    assert p.is_valid and len(p.interiors)==0,(code,'road topology')
    lp=local_poly(p); geometry=dict(type='Polygon',coordinates=[[list(q) for q in lp.exterior.coords]])
    roads.append(dict(public_identifier=code,name=name,action=action,classification='ROAD',is_sellable=False,
                      revision=REV,geometry_version=VERSION,geometry=geometry,geometry_sha256=digest(geometry),
                      label_anchor=list(lp.representative_point().coords[0]),
                      documented_width_m=6 if code in ['EXPORURAL-ACESSO-TRANSVERSAL-01','EXPORURAL-PASSAGEM-INTERNA-02'] else None,
                      name_confirmed=not code.startswith('EXPORURAL-'),
                      raster_native_ring=[[round(x*factor,3),round(y*factor,3)] for x,y in p.exterior.coords]))

# Relationships express candidates by physical region. Many-to-many rows stay
# grouped; neither equal numbers nor a raster can resolve a production UUID.
relations=[]
def relation(oldcodes,newcodes,action,region,confidence):
    def ids(block,ns):return [f'Q-{block}-{n:02}' for n in ns]
    os=ids(*oldcodes); ns=ids(*newcodes)
    relations.append(dict(physical_parcel=region,previous_codes=os,proposed_codes=ns,previous_revision=OLD_REV,
      proposed_revision=REV,action=action,confidence=confidence,status='PENDING_APPROVAL',
      evidence='Repository geometry + registered numbering/dimensions rasters; no live UUID or legal identity verified',
      previous_areas_sqm={k:old_lots[k]['officialAreaSqm'] for k in os},
      proposed_areas_sqm={m['public_identifier']:m['official_area_sqm'] for m in manifest if m['public_identifier'] in ns},
      previous_geometry_versions={k:old_entities[k]['geometry']['geometryVersion'] for k in os},
      previous_geometry_hashes={k:digest(dict(type='Polygon',coordinates=old_entities[k]['geometry']['coordinates'])) for k in os},
      proposed_geometry_hashes={g['public_identifier']:g['geometry_sha256'] for g in geometries if g['public_identifier'] in ns},
      proposed_geometry_version=VERSION,production_entity_ids=None,production_lot_ids=None,
      required_approval='Resolve UUIDs and physical continuity; inspect reservations, negotiations, sales, contracts and price history; approve all parent/child allocations explicitly'))
for n in [1,2,5,6,7,8,13,14,15,16,17,18,19]:
    relation(('R',[n]),('R',[n]),'parcela_preservada_candidata',f'R oeste parcela {n:02}','medium')
for n in [3,4]:relation(('R',[n]),('R',[n]),'ajuste_area_limite_candidato',f'R dupla central {n:02}','medium')
for a,b in zip(range(48,56),range(40,48)):relation(('R',[a]),('R',[b]),'renumeracao_candidata',f'R faixa superior leste posicao {b-39}','medium')
for a,b in zip(range(56,60),range(62,66)):relation(('R',[a]),('R',[b]),'renumeracao_e_ajuste_limite_candidatos',f'R perimetro inferior posicao {b-61}','medium')
for a,b in zip(range(28,31),range(26,29)):relation(('R',[a]),('R',[b]),'renumeracao_candidata',f'R ilha central leste posicao {b-25}','medium')
for a,b,c in zip(range(41,44),range(48,51),range(55,58)):relation(('R',[a]),('R',[b,c]),'divisao_candidata',f'R pequena ilha oeste coluna {a-40}','medium')
for a,b,c in zip(range(44,48),range(51,55),range(58,62)):relation(('R',[a]),('R',[b,c]),'divisao_candidata',f'R pequena ilha leste coluna {a-43}','medium')
relation(('R',[9,10,11,12,*range(31,41)]),('R',[9,10,11,12,*range(29,40)]),'reparcelamento_correspondencia_pendente','R faixa central superior cortada pela transversal','low')
relation(('R',list(range(20,28))),('R',list(range(20,26))),'reparcelamento_correspondencia_pendente','R faixa central inferior e nova passagem','low')
for a,b in zip(range(19,26),range(18,25)):relation(('S',[a]),('S',[b]),'renumeracao_candidata',f'S superior direita posicao {25-a}','medium')
for a,b in zip(range(12,19),range(11,18)):relation(('S',[a]),('S',[b]),'renumeracao_candidata',f'S inferior direita posicao {a-11}','medium')
relation(('S',list(range(26,37))),('S',list(range(25,36))),'reparcelamento_correspondencia_pendente','S superior esquerda terminal maior trocado de lado','low')
relation(('S',list(range(1,12))),('S',list(range(1,11))),'reparcelamento_correspondencia_pendente','S inferior esquerda cortada pela transversal','low')
assert sorted(k for row in relations for k in row['previous_codes'])==sorted(old_lots)
assert sorted(k for row in relations for k in row['proposed_codes'])==sorted(seeds)

summary=dict(revision=REV,base_commit='552f06fe86d928921fe3e9fa455b8972bfa3dca9',sources=sources,
  pdf_cad_available=False,scope='R/S lots and directly affected roads only',
  totals=dict(R=dict(count=65,official_area_sqm='29564.26'),S=dict(count=35,official_area_sqm='16203.53'),all=dict(count=100,official_area_sqm='45767.79')),
  excluded_unnumbered_area_sqm='568.78',excluded_area_destination='PENDING',
  global_reference_revision_unchanged='2026.4',previous_geometry_revision=OLD_REV,geometry_version=VERSION)
write(DATA/'manifesto_lotes.json',manifest); write(OUT/'manifesto_lotes.json',manifest)
write(DATA/'geometrias_lotes.json',geometries)
write(OUT/'geometrias_lotes.json',dict(coordinate_system='LOCAL_NORMALIZED',srid=0,calibration_file='calibracao.json',lots=geometries))
write(DATA/'geometria_vias.json',roads); write(OUT/'geometria_vias.json',dict(coordinate_system='LOCAL_NORMALIZED',srid=0,roads=roads))
write(DATA/'revisao.json',summary); write(OUT/'fontes_e_revisao.json',summary)
write(DATA/'topologia.json',bands); write(OUT/'calibracao.json',calibration)
write(OUT/'crosswalk_linhagem.json',relations)
for filename,rows in [('manifesto_lotes.csv',manifest),('crosswalk_linhagem.csv',relations)]:
    with (OUT/filename).open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader()
        writer.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in row.items()} for row in rows)

# Numerical QA on independent geometry, with no official-area rescaling.
local={g['public_identifier']:Polygon(g['geometry']['coordinates'][0]) for g in geometries}
overlaps=[]
for i,(a,p) in enumerate(local.items()):
    for b,q in list(local.items())[:i]:
        area=p.intersection(q).area/.15**2
        if area>1e-6: overlaps.append([a,b,area])
protected=[]
for code,p in local.items():
    for name in ['B7','B8','D3','B37','B38','C4']:
        area=p.intersection(Polygon(old_entities[name]['geometry']['coordinates'][0])).area/.15**2
        if area>1e-6: protected.append([code,name,area])
qa=dict(lot_overlaps=overlaps,protected_overlaps=protected,
  cadastral_acceptance='BLOCKED',
  blocking_reasons=['area_tolerance_not_met','preserved_support_overlap'] if protected else ['area_tolerance_not_met'],
  max_abs_area_difference_percent=max(abs(g['area_difference_percent']) for g in geometries),
  lots_outside_previous_area_tolerance=[g['public_identifier'] for g in geometries if abs(g['area_difference_percent'])>.15],
  control_rmse_m=calibration['controlsRmseMeters'],check_rmse_m=calibration['independentChecksRmseMeters'])
write(OUT/'evidencias/geometria_qa.json',qa)
print(json.dumps(qa,indent=2))
