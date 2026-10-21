"""Sanitized read-only visual replay; no buyer, contract, token or credentials."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[3];out=root/'scripts/exporural/official-2026-10-20'
old=json.load(open('/tmp/exporural-live-inventory.json'));new=json.load(open('/tmp/exporural-current-inventory.json'))
apron=json.load(open(root/'docs/exporural/2028-revisao-2026-10-20/junction-apron.json'))
def camel(s):return re.sub('_([a-z])',lambda m:m[1].upper(),s)
def compile(data,updated):
 result={'entities':[],'lots':[]}
 for row in data['lots']+data['roads']:
  e=row['entity'];g=row['geometry'];m=e['metadata'].copy()
  if updated and e['public_identifier'] in ['RUA-LESTE-EXPORURAL','RUA-UBIRETAMA-LATERAL-R55']:continue
  # Only geometry presentation metadata. No internal notes or access links.
  m={k:v for k,v in m.items() if k in ['areaCode','block','lotNumber','officialAreaSqm','labelAnchor','geometryRevision','nameConfirmed','street','entityType','renderMode','segmentId','suppressTerritorialLabel']}
  if e['public_identifier']=='RUA-UBIRETAMA-LATERAL-R55' and updated:m['suppressTerritorialLabel']=True
  if e['id']==apron['entity_id'] and updated:g={**g,'geometry':apron['geometry']}
  if updated and e['public_identifier'].startswith('EXPORURAL-PASSAGEM-LESTE-'):g={**g,'extrusion_height':.032}
  result['entities'].append({**{camel(k):e[k] for k in ['id','public_identifier','name','classification','is_archived','is_sellable','layer_id','parent_entity_id']},'segmentId':'exporural' if e['segment_id']=='feb6fcb7-5bc4-4725-ad74-d408a7b56522' else None,'segmentSource':'database','metadata':m,'geometry':{'type':'Polygon','id':g['id'],'coordinates':g['geometry']['coordinates'],'elevation':g['elevation'],'extrusionHeight':g['extrusion_height'],'rotation':g['rotation'],'geometryVersion':g['version'],'calibrationVersion':g['calibration_version']}})
  if 'lot' in row:
   l=row['lot'];p=row['pricing']
   result['lots'].append({**{camel(k):l[k] for k in ['id','entity_id','public_identifier','block','lot_number','display_name','status','official_area_sqm','calculated_area_sqm','area_validation_status','is_corner','has_water','has_electricity','has_internet','is_covered','archived_at']},'sales':[],'officialPricing2028':{camel(k):v for k,v in p.items()} if p else None})
 return result
(out/'replay-data.json').write_text(json.dumps({'before':compile(old,False),'after':compile(new,True)},ensure_ascii=False,separators=(',',':'))+'\n')
