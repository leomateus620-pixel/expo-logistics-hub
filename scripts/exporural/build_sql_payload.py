"""Bundle exact geometry and explicit unresolved approvals; never contact a DB."""
import json, sys
from pathlib import Path
p=Path('docs/exporural/2028-revisao-2026-09-25')
read=lambda name:json.loads((p/name).read_text(encoding='utf-8'))
manifest=read('manifesto_lotes.json'); shapes={g['public_identifier']:g for g in read('geometrias_lotes.json')['lots']}
roads=read('geometria_vias.json')['roads']; old=read('referencia_anterior.json'); lineage=read('crosswalk_linhagem.json')
payload={'revision':'2028-exporural-2026-09-25.1','org_id':None,'project_id':None,'segment_id':None,
 'expected_project_version':None,'expected_project_revision':None,'expected_entity_count':None,
 'expected_lot_count':95,'cartography_approved':False,'approved_by':None,'approval_reference':None,
 'old_entities':[], 'targets':[], 'lineage':[],
 'notes':'Resolve physical identity against live preflight. All nulls/false approvals intentionally block application.'}
for e in old['entities']:
    code=e['publicIdentifier']
    if code.startswith(('Q-R-','Q-S-')) or code in [r['public_identifier'] for r in roads]:
        payload['old_entities'].append({'previous_code':code,'entity_id':None,'lot_id':None,
          'expected_geometry_version':None,'expected_geometry_md5':None,
          'expected_entity_updated_at':None,'expected_lot_updated_at':None,
          'approved':False,'retire':None,'has_linked_history_resolved':False})
for m in manifest:
    g=shapes[m['public_identifier']]
    payload['targets'].append({'code':m['public_identifier'],'kind':'lot','name':f"Quadra {m['block']} · Lote {m['lot_number']}",
      'block':m['block'],'lot_number':m['lot_number'],'official_area_sqm':m['official_area_sqm'],
      'calculated_area_sqm':g['calculated_area_sqm'],'geometry':g['geometry'],'geometry_sha256':g['geometry_sha256'],
      'label_anchor':g['label_anchor'],'source_entity_id':None,'source_lot_id':None,'action':None,
      'approved':False,'approval_reference':None})
for r in roads:
    payload['targets'].append({'code':r['public_identifier'],'kind':'road','name':r['name'],
      'documented_width_m':r['documented_width_m'],'name_confirmed':r['name_confirmed'],
      'geometry':r['geometry'],'geometry_sha256':r['geometry_sha256'],'label_anchor':r['label_anchor'],
      'source_entity_id':None,'source_lot_id':None,'action':None,'approved':False,'approval_reference':None})
for group in lineage:
    if len(group['previous_codes'])!=1 or len(group['proposed_codes'])!=1:
        payload['lineage'].append({'physical_group':group['physical_parcel'],'previous_codes':group['previous_codes'],
          'proposed_codes':group['proposed_codes'],'source_lot_id':None,'target_code':None,
          'relationship':None,'approved':False,'approval_reference':None})
for target in payload['targets']:
    # The renderer's historical source frame is derived from the SAME local ring.
    target['source_pdf_polygon']=[[round((x+60)*5500/120+600,8),round((y+120*4150/5500/2)*5500/120+900,8)]
        for x,y in target['geometry']['coordinates'][0][:-1]]
if len(sys.argv)>1:
    assert sys.argv[1]=='--approved' and len(sys.argv)==3,'Use --approved path/to/approved.json'
    approved=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
    canonical={t['code']:t for t in payload['targets']}
    assert approved['revision']==payload['revision']
    assert len(approved['targets'])==110 and {t['code'] for t in approved['targets']}==set(canonical)
    for t in approved['targets']:
        expected=canonical[t['code']]
        assert t['geometry']==expected['geometry'] and t['geometry_sha256']==expected['geometry_sha256']
        assert t.get('official_area_sqm')==expected.get('official_area_sqm')
    payload=approved
else:
    (p/'approvals_resolvidas.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(p/'carregar_payload.sql').write_text('-- PROPOSTO. Importação temporária apenas; executar na MESMA transação de migration_proposta.sql.\n'
 'CREATE TEMP TABLE exporural_review_payload(document jsonb NOT NULL) ON COMMIT DROP;\n'
 'INSERT INTO exporural_review_payload VALUES ($exporural$'+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'$exporural$::jsonb);\n',encoding='utf-8')
print(len(payload['old_entities']),len(payload['targets']))
