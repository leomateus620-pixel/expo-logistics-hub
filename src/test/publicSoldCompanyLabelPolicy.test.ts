import { describe, expect, it } from 'vitest';
import {
  compactCompanyCaptionAbbreviations,
  isReadablePublicCompanyCaption,
  usesCompactPublicCompanyLabels,
} from '@/features/commercial-map/public/publicSoldCompanyLabelPolicy';

describe('public company captions in compact portrait viewports', () => {
  it('uses CSS dimensions so a high-DPR phone receives the same rules', () => {
    expect(usesCompactPublicCompanyLabels(375, 400)).toBe(true);
    expect(usesCompactPublicCompanyLabels(430, 690)).toBe(true);
    expect(usesCompactPublicCompanyLabels(431, 690)).toBe(false);
    expect(usesCompactPublicCompanyLabels(430, 400)).toBe(false);
    expect(usesCompactPublicCompanyLabels(0, 0)).toBe(false);
  });

  it('uses the full projected cap size and retains it across a narrow hysteresis band', () => {
    expect(isReadablePublicCompanyCaption(8.79, 'full')).toBe(false);
    expect(isReadablePublicCompanyCaption(8.8, 'full')).toBe(true);
    expect(isReadablePublicCompanyCaption(8.3, 'full', true)).toBe(true);
    expect(isReadablePublicCompanyCaption(8.29, 'full', true)).toBe(false);
    expect(isReadablePublicCompanyCaption(7, 'compact')).toBe(true);
    expect(isReadablePublicCompanyCaption(6.99, 'compact')).toBe(false);
  });

  it('uses only text from the authorized name, preserving accents and a short final mark', () => {
    expect(compactCompanyCaptionAbbreviations('INDUSTRIAL K.F.')[0]).toBe('IND… K.F.');
    expect(compactCompanyCaptionAbbreviations('Foroeste Veículos')).toEqual(['Foroeste…', 'Foroe…']);
    expect(compactCompanyCaptionAbbreviations('A\u0301urea Industrial')).toContain('A\u0301urea…');
    expect(compactCompanyCaptionAbbreviations('K.F.')).toEqual([]);
  });
});
