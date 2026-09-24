import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SalesModeLayer } from '@/features/commercial-map/sales/components/SalesModeLayer';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import type { CommercialLot } from '@/features/commercial-map/types';

vi.mock('@/features/commercial-map/sales/salesEligibility', () => ({ useSalesEligibility: vi.fn() }));
vi.mock('@/features/commercial-map/sales/useSalesCheckout', () => ({ useSalesCart: () => ({ summary: { areaTotal: 0, valueTotal: 0 }, loading: false }) }));
vi.mock('@/features/commercial-map/sales/components/SalesCart', () => ({ SalesCart: () => null, SalesCartContents: () => null, SalesStageSwitch: () => null }));
vi.mock('@/features/commercial-map/sales/components/SalesCheckoutDialog', () => ({ SalesCheckoutDialog: () => null }));
afterEach(() => useSalesStore.getState().closeSalesMode());

it('removes a now-SOLD selection and closes checkout on a map query refresh', () => {
  const entry = { lotId: 'sold-elsewhere', publicIdentifier: 'D-01', displayName: 'D-01', context: null };
  useSalesStore.setState({ salesModeActive: true, checkoutOpen: true, selection: [entry, { ...entry, lotId: 'still-available' }] });
  const lots = [
    { id: 'sold-elsewhere', status: 'AVAILABLE' },
    { id: 'still-available', status: 'AVAILABLE' },
  ] as CommercialLot[];
  const view = render(<SalesModeLayer projectId={null} lots={lots} />);
  expect(useSalesStore.getState().selection).toHaveLength(2);
  view.rerender(<SalesModeLayer projectId={null} lots={[{ ...lots[0], status: 'SOLD' }, lots[1]]} />);
  expect(useSalesStore.getState().selection.map(entry => entry.lotId)).toEqual(['still-available']);
  expect(useSalesStore.getState().checkoutOpen).toBe(false);
  view.unmount();
});
