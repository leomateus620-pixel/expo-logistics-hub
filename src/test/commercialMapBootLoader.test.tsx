import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useCommercialMapBootVisit } from '@/features/commercial-map/hooks/useCommercialMapBootVisit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapBootLoader, commercialMapBootProgress } from '@/features/commercial-map/components/CommercialMapBootLoader';
import { beginCommercialMapBoot, getCommercialMapBootSnapshot, markCommercialMapStage, measureCommercialMapStage, summarizeCommercialMapBoot, resetCommercialMapReady } from '@/features/commercial-map/utils/performanceDiagnostics';

beforeEach(() => beginCommercialMapBoot());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Commercial Map real readiness loader', () => {
  it('requires a new ready event after context loss, even when the route already presented once', async () => {
    render(<CommercialMapBootLoader />);
    await act(async () => markCommercialMapStage('commercial-map-ready'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    await act(async () => resetCommercialMapReady());
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => markCommercialMapStage('essential-scene:failed', undefined, true));
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    await act(async () => { resetCommercialMapReady(); markCommercialMapStage('commercial-map-ready'); });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('preserves a new factory session but resets a cached page remount before children and data marks', async () => {
    markCommercialMapStage('module-ready');
    const firstModuleAt = getCommercialMapBootSnapshot().marks['module-requested'];
    const first = renderHook(useCommercialMapBootVisit, { wrapper: MemoryRouter });
    expect(getCommercialMapBootSnapshot().marks['module-requested']).toBe(firstModuleAt);
    markCommercialMapStage('essential-data:end');
    markCommercialMapStage('first-interactive');
    first.rerender();
    expect(getCommercialMapBootSnapshot().interactive).toBe(true);
    await act(async () => first.unmount());
    const next = renderHook(useCommercialMapBootVisit, { wrapper: MemoryRouter });
    expect(getCommercialMapBootSnapshot().interactive).toBe(false);
    expect(getCommercialMapBootSnapshot().marks['essential-data:end']).toBeUndefined();
    expect(getCommercialMapBootSnapshot().marks['module-ready']).toBeDefined();
    markCommercialMapStage('essential-data:cached');
    const cachedAt = getCommercialMapBootSnapshot().marks['essential-data:cached'];
    next.rerender();
    expect(getCommercialMapBootSnapshot().marks['essential-data:cached']).toBe(cachedAt);
    next.unmount();
  });
  it('retains the visit across discarded pre-commit Suspense retries', async () => {
    let ready = false;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    function SuspendedPage() {
      useCommercialMapBootVisit();
      if (!ready) throw pending;
      return <span>map content</span>;
    }
    render(<MemoryRouter><Suspense fallback={<CommercialMapBootLoader force />}><SuspendedPage /></Suspense></MemoryRouter>);
    const requestedAt = getCommercialMapBootSnapshot().marks['module-requested'];
    await act(async () => { markCommercialMapStage('essential-data:cached'); ready = true; resolve(); });
    expect(screen.getByText('map content')).toBeInTheDocument();
    expect(getCommercialMapBootSnapshot().marks['module-requested']).toBe(requestedAt);
    expect(getCommercialMapBootSnapshot().marks['essential-data:cached']).toBeDefined();
  });
  it('reports a cached SPA route relative to that visit rather than the document age', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100_000);
    beginCommercialMapBoot();
    expect(summarizeCommercialMapBoot().navigationToModuleMs).toBe(0);
  });
  it('does not advance for elapsed time, module availability, or an unfinished data request', () => {
    markCommercialMapStage('renderer-module-ready');
    markCommercialMapStage('essential-data:start');
    expect(commercialMapBootProgress(getCommercialMapBootSnapshot()).progress).toBe(0);
    markCommercialMapStage('essential-data:end');
    expect(commercialMapBootProgress(getCommercialMapBootSnapshot()).progress).toBe(23);
  });

  it('keeps the loading cover after first draw until responsive readiness is qualified', async () => {
    render(<CommercialMapBootLoader />);
    await act(async () => {
      markCommercialMapStage('essential-data:cached');
      markCommercialMapStage('critical-scene:end');
      markCommercialMapStage('first-draw');
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
    await act(async () => markCommercialMapStage('first-interactive'));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => markCommercialMapStage('essential-scene:prepared'));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '85');
    await act(async () => markCommercialMapStage('commercial-map-ready'));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reports overlapping real spans and preserves failed then successful data retry', async () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(100);
    markCommercialMapStage('essential-data:start');
    now.mockReturnValue(500);
    markCommercialMapStage('essential-data:end', 400, true);
    expect(getCommercialMapBootSnapshot().failed).toBe(true);
    await measureCommercialMapStage('essential-data', async () => 'success');
    expect(getCommercialMapBootSnapshot().failed).toBe(false);
    expect(summarizeCommercialMapBoot().dataMs).toBe(400);
    expect(summarizeCommercialMapBoot().interactiveMs).toBeNull();
  });

  it('offers an explicit retry and starts a fresh readiness session on reentry', async () => {
    const retry = vi.fn();
    render(<CommercialMapBootLoader error="Connexion indisponible" onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
    await act(async () => markCommercialMapStage('first-interactive'));
    beginCommercialMapBoot();
    expect(getCommercialMapBootSnapshot().interactive).toBe(false);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    expect(getCommercialMapBootSnapshot().marks['first-draw']).toBeUndefined();
  });
});
