"""Check canonical IDs, names, numbers and official fills in vector PDF artifacts."""
import json
from collections import Counter
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream
import pypdfium2 as pdfium

root = Path('docs/validation/pavilion-company-grouping')
reports = []
for pavilion in [12, 13]:
    source = json.loads((root / f'pavilion-{pavilion}-canonical.json').read_text())
    reader = PdfReader(root / f'pavilion-{pavilion}-reported.pdf')
    first = reader.pages[0]
    first_text = ' '.join(first.extract_text().split())
    detail_text = ''.join(''.join(page.extract_text().split()) for page in reader.pages[1:])
    operators = ContentStream(first.get_contents(), reader).operations
    numeric_text = [str(operands[0]) for operands, op in operators if op == b'Tj']
    assert (float(first.mediabox.width) > float(first.mediabox.height)) == (pavilion == 12)
    for row in source['payload']['lots']:
        if row['lotNumber']:
            assert row['lotNumber'] in numeric_text
    for group in source['groups']:
        assert first_text.count(group['name']) == 1
        assert len(group['lotIds']) == len(set(group['lotIds']))
        for contract in [c for order in group['orders'] for c in order['contracts']]:
            assert contract['id'] in detail_text
            assert contract['number'] not in first_text
    fills = Counter(tuple(round(float(v), 2) for v in operands) for operands, op in operators if op == b'rg')
    counts = Counter(row['status'] for row in source['payload']['lots'])
    colors = {'SOLD': '#2563eb', 'AVAILABLE': '#22c55e', 'SALE_OPEN': '#eab308', 'BLOCKED': '#dc2626'}
    for status, count in counts.items():
        color = colors[status][1:]
        key = tuple(round(int(color[i:i + 2], 16) / 255, 2) for i in [0, 2, 4])
        assert fills[key] == count + 1  # One fill per lot plus one legend key.
    for page in reader.pages:
        for obj in page.get('/Resources', {}).get('/XObject', {}).values():
            assert obj.get_object().get('/Subtype') != '/Image'
        for operands, op in ContentStream(page.get_contents(), reader).operations:
            if op == b'Tm':
                assert -1 <= float(operands[4]) <= float(page.mediabox.width) + 1
                assert -1 <= float(operands[5]) <= float(page.mediabox.height) + 1
    document = pdfium.PdfDocument(str(root / f'pavilion-{pavilion}-reported.pdf'))
    for index, page in enumerate(document):
        page.render(scale=1.3).to_pil().save(root / f'pavilion-{pavilion}-pdf-page-{index + 1}.png')
    reports.append({'pavilion': pavilion, 'pages': len(reader.pages), 'lotNumbers': len(source['payload']['lots']),
                    'uniqueCompanyLabels': len(source['groups']), 'officialFillCounts': dict(counts),
                    'contractIDsAndExactCoveragePreserved': True, 'rasterImagesInPdf': 0, 'textWithinPage': True})
report = {'passed': True, 'boundary': 'Synthetic persisted relationships on official fixture polygons, actual application jsPDF export, vector operators and source snapshot checked.', 'documents': reports}
(root / 'pdf-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
