import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoyHarvestOverlay } from '@/features/commercial-map/harvest/SoyHarvestOverlay';
import { soyHarvestClock, useSoyHarvestStore } from '@/features/commercial-map/harvest/useSoyHarvestStore';

beforeEach(() => {
  useSoyHarvestStore.setState(useSoyHarvestStore.getInitialState(), true);
  soyHarvestClock.elapsed = 0; soyHarvestClock.lastNow = null;
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('soy cycle accessible controls', () => {
  it('shows nothing at idle, offers exit during loading and ignores late readiness', () => {
    render(<SoyHarvestOverlay />); expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => useSoyHarvestStore.getState().requestStart());
    expect(screen.getByText('Preparando ciclo da soja…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' })); expect(useSoyHarvestStore.getState().enabled).toBe(false);
  });
  it('pauses on hidden document, waits for explicit resume, and Esc restores green', () => {
    render(<SoyHarvestOverlay />);
    act(() => { useSoyHarvestStore.getState().requestStart(); useSoyHarvestStore.getState().ready(useSoyHarvestStore.getState().session); });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('button', { name: 'Continuar ciclo da soja' })).toBeInTheDocument();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); fireEvent(document, new Event('visibilitychange'));
    expect(useSoyHarvestStore.getState().status).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar ciclo da soja' }));
    expect(useSoyHarvestStore.getState().status).toBe('running');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'restoring', enabled: false, fieldState: 'green' });
  });
  it('supports keyboard/touch information and stable-camera step navigation', () => {
    useSoyHarvestStore.setState({ status: 'paused', enabled: true, reducedMotion: true, fieldState: 'cycle' });
    render(<SoyHarvestOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima etapa' })); expect(soyHarvestClock.elapsed).toBe(6);
    fireEvent.click(screen.getByRole('button', { name: 'Informações sobre o ciclo da soja' }));
    expect(screen.getByText(/não representa duração de cultivo/)).toBeInTheDocument();
  });
});
