import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommercialDashboardScopeCard } from '@/features/commercial-map/dashboard/CommercialDashboardScopeCard';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { buildDashboardCommercialProgress, formatDashboardCommercialProgress } from '@/features/commercial-map/dashboard/commercialDashboardProgress';

const empty = buildCommercialDashboardSnapshot({ entities: [], lots: [] }).external;

describe('commercialization percentage presentation', () => {
  it('uses open and confirmed lots against the commercial base, including a real zero numerator', () => {
    const progress = buildDashboardCommercialProgress({ total: 7, saleOpen: 2, sold: 1 });
    expect(progress.percentage).toBeCloseTo(300 / 7);
    expect(progress.saleOpenWidth + progress.soldWidth).toBeCloseTo(300 / 7);
    expect(formatDashboardCommercialProgress(progress.percentage)).toBe('42,9%');
    expect(formatDashboardCommercialProgress(buildDashboardCommercialProgress({ total: 7, saleOpen: 0, sold: 0 }).percentage)).toBe('0,0%');
  });

  it('keeps a missing base unavailable and preserves inconsistencies outside the bounded visual track', () => {
    expect(buildDashboardCommercialProgress({ total: 0, saleOpen: 0, sold: 0 }).percentage).toBeNull();
    expect(buildDashboardCommercialProgress({ total: Number.NaN, saleOpen: 0, sold: 0 }).percentage).toBeNull();
    const inconsistent = buildDashboardCommercialProgress({ total: 10, saleOpen: 9, sold: 6 });
    expect(inconsistent).toEqual({ percentage: 150, saleOpenWidth: 60, soldWidth: 40, inconsistent: true });
    expect(formatDashboardCommercialProgress(inconsistent.percentage)).toBe('150,0%');
    expect(buildDashboardCommercialProgress({ total: 10, saleOpen: -1, sold: 0 }).inconsistent).toBe(true);
  });

  it('never rounds remaining commercial availability into completion or an overflow into consistency', () => {
    expect(formatDashboardCommercialProgress(9999 / 10000 * 100)).toBe('99,9%');
    expect(formatDashboardCommercialProgress(100)).toBe('100,0%');
    expect(formatDashboardCommercialProgress(100.01)).toBe('100,1%');
    expect(formatDashboardCommercialProgress(null)).toBe('—');
  });
});

describe('selectable commercial scope cards', () => {
  it('preserves the cadastral total while explaining the commercial denominator through a separate information control', () => {
    const onSelect = vi.fn();
    const { container } = render(<CommercialDashboardScopeCard scopeId="external:all" title="Todas as áreas" selected
      onSelect={onSelect} aggregate={{ ...empty, totalLots: 8, commercialLots: 7, saleOpenLots: 2, soldLots: 1, unavailableLots: 1 }} />);
    const select = screen.getByRole('button', { name: 'Todas as áreas' });
    expect(select).toHaveTextContent('8 espaços');
    expect(select).toHaveTextContent('42,9%');
    expect(select).toHaveAccessibleDescription(/Base de 7 espaços comerciais/);
    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('button button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Informações do recorte: Todas as áreas' }));
    const details = screen.getByRole('dialog', { name: 'Informações do recorte: Todas as áreas' });
    expect(details).toHaveTextContent('1 indisponível permanece no total cadastral');
    expect(details).toHaveTextContent('apenas as áreas externas');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(select);
    expect(onSelect).toHaveBeenCalledOnce();
    const fills = container.querySelectorAll<HTMLElement>('.commercial-dashboard-scope-card__fill');
    expect(parseFloat(fills[0].style.width)).toBeCloseTo(200 / 7);
    expect(parseFloat(fills[1].style.width)).toBeCloseTo(100 / 7);
  });

  it('activates pavilion selection by keyboard and retains its complete official name', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CommercialDashboardScopeCard scopeId="pavilion:B5" title="Pavilhão 13" pavilionNumber={13}
      aggregate={empty} selected={false} onSelect={onSelect} />);
    const select = screen.getByRole('button', { name: 'Pavilhão 13' });
    await user.tab();
    expect(select).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(select).toHaveTextContent('Pavilhão 13');
    expect(select).toHaveAccessibleDescription(/Sem base de cálculo/);
    expect(within(select).getByText('—')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Informações do recorte: Pavilhão 13' })).toHaveFocus();
    expect(await screen.findByRole('dialog', { name: 'Informações do recorte: Pavilhão 13' })).toHaveTextContent('não tem base comercial válida');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Informações do recorte: Pavilhão 13' })).toHaveFocus();
  });

  it('updates number and fills together without remounting the selected control or fabricating an empty base', () => {
    const base = { ...empty, totalLots: 5, commercialLots: 5, saleOpenLots: 1, soldLots: 1 };
    const props = { scopeId: 'external:exporural', title: 'Exporural', selected: true, onSelect: vi.fn() };
    const { container, rerender } = render(<CommercialDashboardScopeCard {...props} aggregate={base} segmentId="exporural" />);
    const control = screen.getByRole('button', { name: 'Exporural' });
    expect(control).toHaveTextContent('40,0%');
    rerender(<CommercialDashboardScopeCard {...props} aggregate={{ ...base, saleOpenLots: 0, soldLots: 1 }} segmentId="exporural" />);
    expect(screen.getByRole('button', { name: 'Exporural' })).toBe(control);
    expect(control).toHaveTextContent('20,0%');
    expect(container.querySelector<HTMLElement>('.commercial-dashboard-scope-card__fill--open')!.style.width).toBe('0%');
    expect(container.querySelector<HTMLElement>('.commercial-dashboard-scope-card__fill--sold')!.style.width).toBe('20%');
    rerender(<CommercialDashboardScopeCard {...props} aggregate={empty} segmentId="exporural" />);
    expect(control).toHaveAccessibleDescription(/Sem base de cálculo/);
    expect(control).toHaveTextContent('—');
  });
});
