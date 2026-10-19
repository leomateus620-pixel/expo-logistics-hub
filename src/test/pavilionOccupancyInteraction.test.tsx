import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PavilionWorkspace } from '@/features/commercial-map/dashboard/CommercialDashboardPavilion';
import { createPavilionOccupancyFixture } from './helpers/pavilionOccupancyFixture';
afterEach(cleanup);

describe('contract selection and pavilion fullscreen', () => {
  it('selects the exact contract footprint while retaining the exhibitor hierarchy in the panel', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Expositor ALFA MÁQUINAS AGRÍCOLAS, Contrato FS28-ALFA-1/ }));
    expect(document.querySelector('[data-contract-scope="contract:contract-alfa-1"]')).toHaveAttribute('opacity', '1');
    expect(document.querySelector('[data-contract-scope="contract:contract-alfa-2"]')).toHaveAttribute('opacity', '0.22');
    expect(document.querySelector('.pavilion-selected-contract')).toHaveTextContent('1A · Contrato FS28-ALFA-1');
    const selected = payload.lots.find(row => row.lotNumber === '41')!;
    const sameCompanyOtherContract = payload.lots.find(row => row.lotNumber === '235')!;
    expect(document.querySelector(`path[data-entity-id="${selected.entityId}"]`)).toHaveAttribute('opacity', '0.92');
    expect(document.querySelector(`path[data-entity-id="${sameCompanyOtherContract.entityId}"]`)).toHaveAttribute('opacity', '0.16');
    expect(screen.getByRole('button', { name: /1 ALFA MÁQUINAS AGRÍCOLAS Lotes/ })).toHaveAttribute('aria-pressed', 'true');
  });
  it('retains one map surface, selection and zoom through the accessible modal and restores trigger focus', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ampliar planta de/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const modal = screen.getByRole('dialog');
    expect(document.querySelectorAll('.commercial-dashboard-map-svg')).toHaveLength(1);
    expect(modal.querySelector('.commercial-dashboard-map-surface')).toHaveStyle({ width: '150%' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar tela cheia' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('.commercial-dashboard-map-surface')).toHaveStyle({ width: '150%' });
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toHaveFocus();
  });
  it('removes associations and disables export when no coherent authorized payload is available', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const view = render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    expect(document.querySelector('[data-contract-contour]')).toBeInTheDocument();
    view.rerender(<PavilionWorkspace snapshot={snapshot} onViewLot={vi.fn()} />);
    expect(document.querySelector('[data-contract-contour]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar planta em PDF' })).toBeDisabled();
    expect(document.querySelectorAll('[data-module-number]')).toHaveLength(257);
  });
});
