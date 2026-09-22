import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommercialMapHeaderTools } from '@/features/commercial-map/components/shell/CommercialMapHeaderTools';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import type { VisitPOI } from '@/features/commercial-map/visit/VisitPOIManager';

beforeEach(() => {
  useVisitStore.getState().finishExit();
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  useSalesStore.setState(useSalesStore.getInitialState(), true);
});
afterEach(() => { cleanup(); useVisitStore.getState().finishExit(); });

describe('Modo Visita selector and traditional context preservation', () => {
  it('is absent by default, including a caller without an available 3D scene', () => {
    render(<CommercialMapHeaderTools />);
    expect(screen.queryByRole('button', { name: 'Modo Visita' })).not.toBeInTheDocument();
  });
  it('enters on the existing 3D workspace and restores selection, filters and sales cart', () => {
    const selection = [{ lotId: 'authorized-lot', publicIdentifier: 'Q-A-18', displayName: 'Lote 18', context: 'Quadra A' }];
    useSalesStore.setState({ salesModeActive: true, selection });
    useCommercialMapStore.setState({ workspaceMode: '3d', selectedEntityId: 'authorized-entity', activePanel: 'details',
      statusFilters: ['AVAILABLE'], salesPresentationActive: true });
    render(<CommercialMapHeaderTools visitAvailable salesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Modo Visita' }));
    expect(useVisitStore.getState().enabled).toBe(true);
    expect(useCommercialMapStore.getState().workspaceMode).toBe('3d');
    expect(useCommercialMapStore.getState().salesPresentationActive).toBe(false);
    expect(screen.queryByRole('button', { name: 'Vendas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();
    expect(useSalesStore.getState().selection).toBe(selection);
    act(() => useVisitStore.getState().finishExit());
    expect(useCommercialMapStore.getState()).toMatchObject({ selectedEntityId: 'authorized-entity', activePanel: 'details',
      statusFilters: ['AVAILABLE'], salesPresentationActive: true });
    expect(useSalesStore.getState().selection).toBe(selection);
    expect(screen.getByRole('button', { name: 'Vendas' })).toBeVisible();
  });
  it('passes the authorized selected lot identity to the visit spawn request', () => {
    render(<CommercialMapHeaderTools visitAvailable visitEntityId="authorized-entity" />);
    fireEvent.click(screen.getByRole('button', { name: 'Visitar este lote' }));
    expect(useVisitStore.getState().requestedEntityId).toBe('authorized-entity');
  });
  it('does not interrupt active editing or checkout', () => {
    useCommercialMapStore.setState({ workspaceMode: 'edit' });
    render(<CommercialMapHeaderTools visitAvailable />);
    expect(screen.getByRole('button', { name: 'Modo Visita' })).toBeDisabled();
    act(() => { useCommercialMapStore.setState({ workspaceMode: '3d' }); useSalesStore.setState({ checkoutOpen: true }); });
    expect(screen.getByRole('button', { name: 'Modo Visita' })).toBeDisabled();
  });
  it('keeps an existing list workspace as the return context', () => {
    useCommercialMapStore.setState({ workspaceMode: 'list' });
    render(<CommercialMapHeaderTools visitAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Modo Visita' }));
    expect(useCommercialMapStore.getState().workspaceMode).toBe('3d');
    act(() => useVisitStore.getState().finishExit());
    expect(useCommercialMapStore.getState().workspaceMode).toBe('list');
  });
  it('shows authored trees during the visit and restores the prior visibility choice', () => {
    useCommercialMapStore.setState({ treesVisible: false });
    useVisitStore.getState().start();
    expect(useCommercialMapStore.getState().treesVisible).toBe(true);
    useVisitStore.getState().finishExit();
    expect(useCommercialMapStore.getState().treesVisible).toBe(false);
  });
  it('refreshes a same-ID commercial snapshot without notifying on unchanged spatial samples', () => {
    const first = { id: 'lot-18', entity: { id: 'entity-18', name: 'Original' }, lot: { status: 'AVAILABLE' } } as VisitPOI;
    let updates = 0;
    const unsubscribe = useVisitStore.subscribe(() => { updates++; });
    useVisitStore.getState().setActivePOI(first);
    for (let sample = 0; sample < 100; sample++) useVisitStore.getState().setActivePOI(first);
    expect(updates).toBe(1);
    const refreshed = { ...first, entity: { ...first.entity, name: 'Atualizado' }, lot: { ...first.lot!, status: 'RESERVED' as const } };
    useVisitStore.getState().setActivePOI(refreshed);
    expect(updates).toBe(2);
    expect(useVisitStore.getState().activePOI?.lot?.status).toBe('RESERVED');
    expect(useVisitStore.getState().activePOI?.entity.name).toBe('Atualizado');
    unsubscribe();
  });
});
