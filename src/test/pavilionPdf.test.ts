import { describe, expect, it } from 'vitest';
import { createPavilionPdf } from '@/features/commercial-map/dashboard/pavilionPdf';
import { buildDashboardPavilionGeometry } from '@/features/commercial-map/dashboard/commercialDashboardPavilionGeometry';
import { getCommercialMiniMapGeometry } from '@/features/commercial-map/dashboard/commercialDashboardGeometry';
import { createPavilionOccupancyFixture } from './helpers/pavilionOccupancyFixture';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';

describe('commercial pavilion vector PDF', () => {
  it.each([12, 13])('exports every official number with A3 orientation and no raster image for Pavilion %i', async pavilion => {
    const { snapshot, payload } = createPavilionOccupancyFixture(pavilion);
    const source = buildDashboardPavilionGeometry(snapshot);
    const geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const pdf = await createPavilionPdf(snapshot, payload, geometry, source.accesses);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.internal.pageSize.getWidth() > pdf.internal.pageSize.getHeight()).toBe(pavilion === 12);
    const bytes = pdf.output('arraybuffer');
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('/Subtype /Image');
    const page = (pdf.internal as unknown as { pages: string[][] }).pages[1].join('\n');
    snapshot.records.forEach(({ lot }) => { if (lot.lotNumber) expect(page).toContain(`(${lot.lotNumber}) Tj`); });
    if (process.env.PAVILION_PDF_EVIDENCE) {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const output = 'docs/validation/pavilion-occupancy'; await mkdir(output, { recursive: true });
      await writeFile(`${output}/pavilion-${pavilion}-commercial.pdf`, new Uint8Array(bytes));
      await writeFile(`${output}/pavilion-${pavilion}-source.json`, JSON.stringify({ ...payload,
        colors: Object.fromEntries(Object.entries(STATUS_CONFIG).map(([status, value]) => [status, value.color])),
        totals: { lots: snapshot.totalLots, sold: snapshot.soldLots, open: snapshot.saleOpenLots, available: snapshot.availableLots },
      }, null, 2));
    }
  });
  it('rejects a stale inventory snapshot instead of exporting mismatched colors and identities', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const source = buildDashboardPavilionGeometry(snapshot), geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    await expect(createPavilionPdf(snapshot, { ...payload, lots: payload.lots.slice(1) }, geometry)).rejects.toThrow('inventários divergentes');
  });
  it('paginates a dense 257-space pavilion without squeezing the company directory onto one page', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture(12, true);
    const source = buildDashboardPavilionGeometry(snapshot), geometry = getCommercialMiniMapGeometry(source.records, source.outlines, source.contentEnvelope);
    const pdf = await createPavilionPdf(snapshot, payload, geometry, source.accesses);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
    if (process.env.PAVILION_PDF_EVIDENCE) {
      const { mkdir, writeFile } = await import('node:fs/promises'); await mkdir('tmp/pdfs', { recursive: true });
      await writeFile('tmp/pdfs/pavilion-12-dense-qa.pdf', new Uint8Array(pdf.output('arraybuffer')));
    }
  });
});
