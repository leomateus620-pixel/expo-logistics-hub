import { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitOverlayFrame } from '@/features/commercial-map/visit/VisitOverlay';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
const originalLock = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
const originalUnlock = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');

beforeEach(() => {
  useVisitStore.getState().finishExit();
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
});
afterEach(() => {
  cleanup(); useVisitStore.getState().finishExit(); vi.restoreAllMocks();
  if (originalLock) Object.defineProperty(document, 'pointerLockElement', originalLock); else Reflect.deleteProperty(document, 'pointerLockElement');
  if (originalUnlock) Object.defineProperty(document, 'exitPointerLock', originalUnlock); else Reflect.deleteProperty(document, 'exitPointerLock');
});

describe('recuperação da camada lazy de controles da visita', () => {
  it('permite sair enquanto o chunk não resolve, restaura contexto e não monta o HUD atrasado', async () => {
    let complete!: (value: { default: () => JSX.Element }) => void;
    const PendingHUD = lazy(() => new Promise<{ default: () => JSX.Element }>(resolve => { complete = resolve; }));
    useCommercialMapStore.setState({ workspaceMode: 'list', activePanel: 'details', selectedEntityId: 'lot-before', salesPresentationActive: true });
    const view = render(<VisitOverlayFrame><PendingHUD /></VisitOverlayFrame>);
    expect(screen.queryByRole('button', { name: 'Sair do Modo Visita' })).not.toBeInTheDocument();
    act(() => useVisitStore.getState().start());
    expect(screen.getByRole('status')).toHaveTextContent('Carregando controles');
    fireEvent.click(screen.getByRole('button', { name: 'Sair do Modo Visita' }));
    expect(useVisitStore.getState().enabled).toBe(false);
    expect(useCommercialMapStore.getState()).toMatchObject({ workspaceMode: 'list', activePanel: 'details', selectedEntityId: 'lot-before', salesPresentationActive: true });
    await act(async () => { complete({ default: () => <span>HUD chegou depois</span> }); });
    expect(screen.queryByText('HUD chegou depois')).not.toBeInTheDocument();
    expect(view.container).toBeEmptyDOMElement();
  });

  it('isola rejeição do chunk, libera pointer lock e oferece saída sem desmontar o mapa', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const releasePointer = vi.fn();
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.createElement('canvas') });
    Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: releasePointer });
    let fail!: (error: Error) => void;
    const FailedHUD = lazy(() => new Promise<{ default: () => JSX.Element }>((_, reject) => { fail = reject; }));
    const view = render(<><canvas data-testid="persistent-map" /><VisitOverlayFrame><FailedHUD /></VisitOverlayFrame></>);
    const canvas = screen.getByTestId('persistent-map');
    act(() => { useVisitStore.getState().start(); useVisitStore.setState({ phase: 'active' }); });
    await act(async () => { fail(new Error('ChunkLoadError: HUD indisponível')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os controles');
    expect(useVisitStore.getState().error).toBeTruthy();
    expect(releasePointer).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistent-map')).toBe(canvas);
    fireEvent.click(screen.getByRole('button', { name: 'Sair do Modo Visita' }));
    expect(useVisitStore.getState().enabled).toBe(false);
    expect(screen.getByTestId('persistent-map')).toBe(canvas);
    expect(view.container.querySelector('[data-visit-recovery]')).toBeNull();
    expect(log).toHaveBeenCalled();
  });
});
