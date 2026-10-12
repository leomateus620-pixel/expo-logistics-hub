import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrgFilterBar, OrgViewportControls } from './OrgControls';

describe('OrgFilterBar', () => {
  it('presents uppercase CCPF filters with an icon and preserved accessible names', () => {
    const onFilterChange = vi.fn();
    const { container } = render(
      <OrgFilterBar filter="ccp" onFilterChange={onFilterChange} />,
    );
    const filters = screen.getByRole('navigation', { name: /Filtrar níveis organizacionais/i });
    const buttons = within(filters).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'TODO O ECOSSISTEMA',
      'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
      'PRESIDÊNCIA',
      'COMISSÃO CENTRAL',
      'COMISSÕES',
      'ASSESSORIAS',
    ]);
    buttons.forEach((button) => {
      expect(button.querySelectorAll('[data-org-filter-icon]')).toHaveLength(1);
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label'));
    });
    expect(new Set(buttons.map((button) => (
      button.querySelector('[data-org-filter-icon]')?.getAttribute('class')
    ))).size).toBe(6);
    expect(screen.getByRole('button', {
      name: 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
    })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(container.querySelector('kbd')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ASSESSORIAS' }));
    expect(onFilterChange).toHaveBeenCalledWith('advisory');
  });
});

describe('OrgViewportControls', () => {
  it('keeps each essential action independent and exposes a clear selection action', () => {
    const onClearSelection = vi.fn();
    const onFit = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onFocusSelected = vi.fn();
    render(<OrgViewportControls scale={0.8} selected onClearSelection={onClearSelection} onFit={onFit} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFocusSelected={onFocusSelected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção e restaurar visão geral' }));
    expect(onClearSelection).toHaveBeenCalledOnce();
    expect(onFit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enquadrar todo o ecossistema' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reduzir zoom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Centralizar nó selecionado' }));
    [onFit, onZoomIn, onZoomOut, onFocusSelected].forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('80%');
    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAttribute('title'));
  });
});
