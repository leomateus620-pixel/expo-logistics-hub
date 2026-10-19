"""Verify the exported vector snapshots, without relying on raster screenshots."""
import json
from collections import Counter
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream

root = Path('docs/validation/pavilion-occupancy')
reports = []
for pavilion in [12, 13]:
    source = json.loads((root / f'pavilion-{pavilion}-source.json').read_text())
    pdf = PdfReader(str(root / f'pavilion-{pavilion}-commercial.pdf'))
    first = pdf.pages[0]
    text = first.extract_text()
    all_text = '\n'.join(page.extract_text() for page in pdf.pages)
    operations = ContentStream(first.get_contents(), pdf).operations
    numeric_text = [str(operands[0]) for operands, operator in operations if operator == b'Tj']
    assert len(pdf.pages) >= 2
    assert (float(first.mediabox.width) > float(first.mediabox.height)) == (pavilion == 12)
    assert sorted(round(float(v)) for v in [first.mediabox.width, first.mediabox.height]) == [842, 1191]
    for row in source['lots']:
        if row['lotNumber']:
            assert row['lotNumber'] in numeric_text, f"Number absent: {row['lotNumber']}"
    for value, label in [(source['totals']['lots'], 'lotes'), (source['totals']['sold'], 'vendidos'), (source['totals']['open'], 'em andamento'), (source['totals']['available'], 'disponíveis')]:
        assert f'{value} {label}' in text
    expected_contracts, expected_names = set(), set()
    for row in source['lots']:
        if len(row['associations']) != 1:
            continue
        a = row['associations'][0]
        if a['inconsistent']:
            continue
        expected_names.add(a['displayName'])
        expected_contracts.update(c['number'] for c in a['contracts'] if c['number'])
    normalized = ' '.join(all_text.split())
    for value in expected_names | expected_contracts:
        assert value in normalized, f'Authorized identity/reference absent: {value}'
    fills = Counter()
    for operands, operator in operations:
        if operator == b'rg':
            fills[tuple(round(float(v), 2) for v in operands)] += 1
    counts = Counter(row['status'] for row in source['lots'])
    for status, count in counts.items():
        color = source['colors'][status].lstrip('#')
        key = tuple(round(int(color[i:i + 2], 16) / 255, 2) for i in [0, 2, 4])
        assert fills[key] == count + 1, f'{status}: expected {count} lot fills plus one legend key, got {fills[key]}'
    for page in pdf.pages:
        for obj in page.get('/Resources', {}).get('/XObject', {}).values():
            assert obj.get_object().get('/Subtype') != '/Image'
        for operands, operator in ContentStream(page.get_contents(), pdf).operations:
            if operator == b'Tm':
                x, y = float(operands[4]), float(operands[5])
                assert -1 <= x <= float(page.mediabox.width) + 1
                assert -1 <= y <= float(page.mediabox.height) + 1
    assert 'VÍNCULO CONTRADITÓRIO' not in all_text
    assert 'Documento anexado não comprova assinatura' in all_text
    reports.append({'pavilion': pavilion, 'pages': len(pdf.pages), 'format': 'A3 landscape' if pavilion == 12 else 'A3 portrait',
                    'official_numbers': len(source['lots']), 'status_fills_match': dict(counts),
                    'authorized_names': sorted(expected_names), 'authorized_contracts': sorted(expected_contracts), 'raster_images': 0,
                    'text_positions_within_page': True})
report = {'passed': True, 'boundary': 'Synthetic records exported through the actual jsPDF application function; vector operators, text and source snapshots checked.', 'documents': reports}
(root / 'pdf-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
