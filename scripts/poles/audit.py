"""Independent planar clearance audit with Shapely (not the runtime solver)."""
import csv
import json
from pathlib import Path
from shapely.geometry import Point, Polygon

folder = Path('docs/validation/pole-location')
before = json.loads((folder / 'baseline-inventory.json').read_text(encoding='utf-8'))
after = json.loads((folder / 'candidate-inventory.json').read_text(encoding='utf-8'))
assert before['data'] == after['data']
assert before['nodes'] == after['nodes']
assert before['connections'] == after['connections']
old = {p['node']['id']: p for p in before['placements']}
constraints = [(c, Polygon(c['polygon'])) for c in after['constraints']]
lots = {e['publicIdentifier']: Polygon(e['geometry']['coordinates'][0]) for e in after['data']['entities'] if e['classification'] == 'SELLABLE_LOT'}
rows = []
for placement in after['placements']:
    n = placement['node']
    if n['type'] != 'POLE':
        assert old[n['id']] == placement, n['id']
        continue
    b, a = Point(old[n['id']]['renderPosition']), Point(placement['renderPosition'])
    conflicts = lambda q: sorted(set(c['id'] for c, shape in constraints if shape.distance(q) < n['radius'] + c['margin'] - .0001))
    host = placement['poleAudit']['sourceLotIdentifier']
    rows.append({
        'id': n['sourceMarkerId'], 'sourcePage': n['sourcePagePosition'],
        'sourcePosition': n['position'], 'before': list(b.coords[0]), 'after': list(a.coords[0]),
        'sourceLot': host, 'insideSourceLotBefore': lots[host].covers(b) if host else None,
        'insideSourceLotAfter': lots[host].covers(a) if host else None,
        'beforeConflicts': conflicts(b), 'afterConflicts': conflicts(a),
        'delta': round(a.distance(b), 6), 'displacementFromSource': round(a.distance(Point(n['position'])), 6),
        'groundElevation': placement['groundElevation'],
    })
assert all(not r['afterConflicts'] for r in rows)
assert all(r['insideSourceLotAfter'] is not False for r in rows)
report = {
    'sourcePdfSha256': 'bbe9603392feb499fd0f2bc604f61e79dbf2a841504b92848253f9f9b9f679ce',
    'poleCount': len(rows), 'movedCount': sum(r['delta'] > .000001 for r in rows),
    'conflictingPolesBefore': sum(bool(r['beforeConflicts']) for r in rows),
    'conflictingPolesAfter': sum(bool(r['afterConflicts']) for r in rows),
    'sourceLotBindings': sum(bool(r['sourceLot']) for r in rows),
    'outsideSourceLotBefore': sum(r['insideSourceLotBefore'] is False for r in rows),
    'outsideSourceLotAfter': sum(r['insideSourceLotAfter'] is False for r in rows),
    'maxDisplacementFromPrevious': max(r['delta'] for r in rows),
    'unchanged': ['commercial inventory', 'source nodes', 'connections', '20 transformer placements'],
    'rows': rows,
}
(folder / 'audit.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (folder / 'pole-positions.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, ensure_ascii=False))
