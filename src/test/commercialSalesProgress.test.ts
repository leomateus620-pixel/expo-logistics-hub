import { describe, expect, it } from 'vitest';
import { commercialSalesProgress } from '@/features/commercial-map/dashboard/commercialSalesProgress';
import type { DashboardAggregate } from '@/features/commercial-map/dashboard/commercialDashboardTypes';

const summary = (soldValue: number, saleOpenValue: number, totalKnownValue: number, commercialLots = 3, knownValueLots = 3) =>
  ({ soldValue, saleOpenValue, totalKnownValue, commercialLots, knownValueLots }) as DashboardAggregate;

describe('commercial sales progress', () => {
  it('divides both sale states by the same known-value base and adds their widths', () => {
    expect(commercialSalesProgress(summary(36450, 146850, 4_620_000))).toMatchObject({
      confirmed: 36450 / 4_620_000 * 100,
      open: 146850 / 4_620_000 * 100,
      combined: (36450 + 146850) / 4_620_000 * 100,
      available: true, partial: false,
    });
  });

  it('reclassifies open as confirmed without increasing the combined amount', () => {
    const before = commercialSalesProgress(summary(100, 200, 500));
    const after = commercialSalesProgress(summary(300, 0, 500));
    expect(after.confirmed).toBeGreaterThan(before.confirmed);
    expect(after.combined).toBe(before.combined);
  });

  it('treats missing amounts as partial coverage, including a known zero', () => {
    expect(commercialSalesProgress(summary(0, 100, 500, 4, 2))).toMatchObject({ combined: 20, partial: true });
    expect(commercialSalesProgress(summary(0, 0, 0, 4, 1))).toMatchObject({ available: false, partial: true });
  });

  it('omits unavailable denominators and constrains inconsistent widths', () => {
    expect(commercialSalesProgress(summary(0, 0, 0)).available).toBe(false);
    expect(commercialSalesProgress(summary(1, 0, Number.NaN)).available).toBe(false);
    expect(commercialSalesProgress(summary(120, 80, 100))).toMatchObject({ confirmed: 100, open: 0, combined: 100 });
  });

  it('retains cent precision for tiny amounts', () => {
    expect(commercialSalesProgress(summary(.01, .02, .04)).combined).toBe(75);
  });
});