import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import { PavilionWorkspace } from '@/features/commercial-map/dashboard/CommercialDashboardPavilion';
import { createPavilionOccupancyFixture, createPavilionGroupingRegressionFixture } from './helpers/pavilionOccupancyFixture';
afterEach(cleanup);
const company = (name: string) => screen.getByRole('button', { name: new RegExp(`Expositor ${name},`) });
const paths = () => Array.from(document.querySelectorAll('path[data-company-selected="true"]'));
const contracts = () => Array.from(document.querySelectorAll('path[data-contract-selected="true"]'));
const openContracts = () => fireEvent.click(screen.getByText('Contratos e lotes vinculados'));

/** Optional SVG artifact from the actual mounted React surface, not a browser
 * screenshot. Useful alongside PDF/operator evidence when browser access stops. */
async function saveSvgEvidence(pavilion: number, state: string) {
  if (!process.env.PAVILION_SVG_EVIDENCE) return;
  const svg = document.querySelector('.commercial-dashboard-map-svg')!.cloneNode(true) as SVGSVGElement;
  const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', '1600'); svg.setAttribute('height', String(Math.round(1600 * height / width)));
  svg.setAttribute('style', 'font-family: Arial, sans-serif; background: #f5f7f3');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = '.commercial-dashboard-module-number { font-weight: 700; fill: #173c2b; stroke: #ffffffc0; paint-order: stroke; pointer-events: none; }';
  svg.prepend(style);
  const { mkdir, writeFile } = await import('node:fs/promises');
  const output = process.env.PAVILION_SVG_OUTPUT || 'docs/validation/pavilion-company-grouping';
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/pavilion-${pavilion}-${state}.svg`, svg.outerHTML);
}

describe('company primary selection and secondary contract inspection', () => {
  it('selects all company lots, preserves them during contract inspection and toggles only the secondary scope', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ALFA MÁQUINAS AGRÍCOLAS'));
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(0);
    const before = document.querySelector('.commercial-dashboard-map-svg')!.getAttribute('viewBox');
    openContracts();
    const contract = screen.getByRole('button', { name: /Contrato FS28-ALFA-1/ });
    fireEvent.click(contract);
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(4);
    expect(document.querySelector('.pavilion-selected-contract')).toHaveTextContent('ocupação completa preservada');
    expect(document.querySelectorAll('[data-company-label="exhibitor:alfa"]')).toHaveLength(1);
    expect(document.querySelector('.commercial-dashboard-map-svg')).toHaveAttribute('viewBox', before);
    const other = payload.lots.find(row => row.lotNumber === '235')!;
    expect(document.querySelector(`path[data-entity-id="${other.entityId}"]`)).toHaveAttribute('opacity', '0.92');
    fireEvent.click(contract);
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(0);
    fireEvent.click(company('BETA TECNOLOGIA'));
    expect(paths()).toHaveLength(4); expect(contracts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção da empresa' }));
    expect(paths()).toHaveLength(0); expect(contracts()).toHaveLength(0);
  });
  it.each([[12, 'ÓTICA DINIZ', 6], [12, 'AMERICAN FISIO', 4], [13, 'ADRI MODAS', 5], [12, 'VIA MUNDI', 5]] as const)(
    'selects the exact complete company for P%i %s', async (pavilion, name, count) => {
      const { snapshot, payload } = createPavilionGroupingRegressionFixture(pavilion);
      render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
      await saveSvgEvidence(pavilion, 'default');
      fireEvent.click(company(name));
      expect(paths()).toHaveLength(count); expect(screen.getAllByRole('button', { name: new RegExp(`Expositor ${name},`) })).toHaveLength(1);
      openContracts();
      fireEvent.click(screen.getByRole('button', { name: /Contrato FS28/ }));
      expect(contracts()).toHaveLength(1); expect(paths()).toHaveLength(count);
      for (const path of paths()) expect(path).toHaveAttribute('fill', STATUS_CONFIG.SOLD.color);
      await saveSvgEvidence(pavilion, name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll(' ', '-') + '-contract');
    });
  it('resolves a lot to the full company and its real contract choices, and clears old contract scope on navigation', () => {
    const { snapshot, payload } = createPavilionGroupingRegressionFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ÓTICA DINIZ')); openContracts();
    fireEvent.click(screen.getByRole('button', { name: /Contrato FS28-DINIZ/ }));
    const american = payload.lots.find(row => Number(row.lotNumber) === 249)!;
    fireEvent.click(document.querySelector(`path[data-entity-id="${american.entityId}"]`)!);
    expect(paths()).toHaveLength(4); expect(contracts()).toHaveLength(0);
    expect(document.querySelector('.pavilion-company-detail h4')).toHaveTextContent('AMERICAN FISIO');
  });
  it('uses the status filter to find companies without truncating mixed company membership', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Situação comercial'), { target: { value: 'SOLD' } });
    fireEvent.click(company('ALFA MÁQUINAS AGRÍCOLAS'));
    expect(paths()).toHaveLength(6);
    expect(document.querySelector('.pavilion-company-detail')).toHaveTextContent('41, 42, 43, 44, 235, 236');
  });
  it('drops a removed contract selection during document-only refresh and retains the whole company', () => {
    const { snapshot, payload } = createPavilionGroupingRegressionFixture();
    const view = render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ÓTICA DINIZ')); openContracts();
    fireEvent.click(screen.getByRole('button', { name: /Contrato FS28-DINIZ/ }));
    const removed = { ...payload, lots: payload.lots.map(row => ({ ...row, associations: row.associations.map(a => ({ ...a, contracts: [] })) })) };
    view.rerender(<PavilionWorkspace snapshot={snapshot} payload={removed} onViewLot={vi.fn()} />);
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(0);
    view.rerender(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    expect(contracts()).toHaveLength(0);
  });
});

describe('fullscreen, permission and pavilion changes', () => {
  it('retains one map, complete company selection, secondary scope and zoom through fullscreen', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ALFA MÁQUINAS AGRÍCOLAS')); openContracts();
    fireEvent.click(screen.getByRole('button', { name: /Contrato FS28-ALFA-1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ampliar planta de/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    const modal = screen.getByRole('dialog');
    expect(document.querySelectorAll('.commercial-dashboard-map-svg')).toHaveLength(1);
    expect(document.querySelectorAll('[data-company-label="exhibitor:alfa"]')).toHaveLength(1);
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(4);
    expect(modal.querySelector('.commercial-dashboard-map-surface')).toHaveStyle({ width: '150%' });
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar tela cheia' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('.commercial-dashboard-map-surface')).toHaveStyle({ width: '150%' });
    expect(paths()).toHaveLength(6); expect(contracts()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toHaveFocus();
  });
  it('removes annotations and selection on permission loss without resurrecting them on a later response', () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const view = render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ALFA MÁQUINAS AGRÍCOLAS'));
    expect(document.querySelector('[data-group-contour]')).toBeInTheDocument();
    view.rerender(<PavilionWorkspace snapshot={snapshot} onViewLot={vi.fn()} />);
    expect(document.querySelector('[data-group-contour]')).not.toBeInTheDocument(); expect(paths()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Baixar planta em PDF' })).toBeDisabled();
    expect(document.querySelectorAll('[data-module-number]')).toHaveLength(257);
    view.rerender(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    expect(paths()).toHaveLength(0);
  });
  it('clears a selected lot company after permission loss instead of restoring stale membership', () => {
    const { snapshot, payload } = createPavilionGroupingRegressionFixture();
    const view = render(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    const row = payload.lots.find(row => Number(row.lotNumber) === 58)!;
    fireEvent.click(document.querySelector(`path[data-entity-id="${row.entityId}"]`)!);
    expect(paths()).toHaveLength(6);
    expect(document.querySelector('.pavilion-companies')).not.toHaveAttribute('hidden');
    view.rerender(<PavilionWorkspace snapshot={snapshot} onViewLot={vi.fn()} />);
    view.rerender(<PavilionWorkspace snapshot={snapshot} payload={payload} onViewLot={vi.fn()} />);
    expect(paths()).toHaveLength(0);
  });
  it('clears company and document state when changing pavilions', () => {
    const p12 = createPavilionGroupingRegressionFixture(), p13 = createPavilionGroupingRegressionFixture(13);
    const view = render(<PavilionWorkspace snapshot={p12.snapshot} payload={p12.payload} onViewLot={vi.fn()} />);
    fireEvent.click(company('ÓTICA DINIZ'));
    view.rerender(<PavilionWorkspace snapshot={p13.snapshot} payload={p13.payload} onViewLot={vi.fn()} />);
    expect(paths()).toHaveLength(0); expect(document.querySelectorAll('[data-module-number]')).toHaveLength(104);
  });
});
