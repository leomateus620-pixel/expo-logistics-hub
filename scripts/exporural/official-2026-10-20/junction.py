"""Johan/Ubiretama apron: negative space bounded by persisted official lots.
No commercial polygon is changed. Run against a fresh explicit inventory export.
"""
import json,hashlib
from pathlib import Path
from shapely.geometry import shape,box,mapping
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[3];out=root/'docs/exporural/2028-revisao-2026-10-20'
live=json.load(open('/tmp/exporural-current-inventory.json'))
rows={r['entity']['public_identifier']:r for r in live['lots']+live['roads']}
a=shape(rows['Q-S-17']['geometry']['geometry']);b=shape(rows['Q-R-47']['geometry']['geometry'])
r=rows['RUA-UBIRETAMA'];original=shape(r['geometry']['geometry'])
# The inner limit follows the official curved lot faces. The unchanged eastern
# cadastral edge bounds the apron. Mask stops at the S/17 and R/47 row ends.
curved=[p for p in a.exterior.coords if p[1]>a.bounds[3]-.1 and p[0]>a.centroid.x]
west=min(p[0] for p in curved)
mask=box(west,a.bounds[3]-(a.bounds[2]-west),original.bounds[2],b.bounds[3])
protected=unary_union([shape(x['geometry']['geometry']) for x in live['lots']])
paved=original.union(mask.difference(protected))
assert paved.is_valid and paved.geom_type=='Polygon'
assert paved.intersection(protected).area<1e-7
assert paved.difference(original).difference(mask).area<1e-9
result={'revision':'2028-exporural-2026-10-21.surfaces.1','entity_id':r['entity']['id'],'previous_geometry':r['geometry']['geometry'],'previous_version':r['geometry']['version'],'geometry':mapping(paved),'added_area_local_sq':paved.difference(original).area,'mask':mapping(mask),'commercial_polygons_changed':0}
(out/'junction-apron.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Added road surface',result['added_area_local_sq'],'local square units; commercial polygons changed: 0')
