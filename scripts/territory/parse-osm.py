import xml.etree.ElementTree as E,json
r=E.parse('artifacts/territory/osm-map.xml').getroot();nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in r.findall('node')};ways=[]
for w in r.findall('way'):
 t={v.attrib['k']:v.attrib['v'] for v in w.findall('tag')};pts=[nodes[n.attrib['ref']] for n in w.findall('nd') if n.attrib['ref'] in nodes]
 if 'highway' in t or 'leisure' in t or 'water' in t or 'building' in t:ways.append({'id':w.attrib['id'],'tags':t,'points':pts})
json.dump(ways,open('artifacts/territory/osm-ways.json','w'),indent=2)
for w in ways:
 t=w['tags']
 if t.get('ref') or t.get('name') and any(n in t['name'].lower() for n in ['brasil','ubiretama','carlson','hermes','conti']): print(w['id'],t, w['points'][0],w['points'][-1])
