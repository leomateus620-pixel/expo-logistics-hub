import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateCommercialMapDisplayCadence } from '@/features/commercial-map/utils/displayCadence';
import { resolveCommercialMapAdaptiveQuality, createCommercialMapAdaptiveQualityState } from '@/features/commercial-map/utils/viewport';
import { probeCommercialMapWebGL2, useWebGLAvailability } from '@/features/commercial-map/hooks/useWebGLAvailability';
import { MapListView } from '@/features/commercial-map/components/panels/EntityExplorer';
import { useMapEntityFilter } from '@/features/commercial-map/hooks/useCommercialMap';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const capabilities = { viewportWidth: 1366, viewportHeight: 768, devicePixelRatio: 1, deviceMemoryGb: 8, hardwareConcurrency: 8 };

describe('cadência e recuperação conservadora', () => {
  it.each([60, 90, 120])('calibra %i Hz e permite uma experiência de recuperação por vez', (hz) => {
    const cadence = 1000 / hz;
    expect(estimateCommercialMapDisplayCadence([...Array(40).fill(cadence), 1000, 500])).toBe(cadence);
    let state = { ...createCommercialMapAdaptiveQualityState(capabilities), tier: 'MEDIUM' as const };
    const sample = { ...capabilities, averageFrameTimeMs: cadence, p95FrameTimeMs: cadence, displayCadenceMs: cadence, nowMs: 5000 };
    for (let i = 0; i < 7; i++) {
      const decision = resolveCommercialMapAdaptiveQuality(state, sample);
      expect(decision.changed).toBe(false);
      state = decision as typeof state;
    }
    const upgrade = resolveCommercialMapAdaptiveQuality(state, sample);
    expect(upgrade).toMatchObject({ tier: 'HIGH', changed: true, lastUpgradeAtMs: 5000 });
    let next = upgrade;
    for (let i = 0; i < 20; i++) next = resolveCommercialMapAdaptiveQuality(next, { ...sample, nowMs: 6000 });
    expect(next.tier).toBe('HIGH');
    expect(resolveCommercialMapAdaptiveQuality(state, { ...sample, recoveryEligible: false }).changed).toBe(false);
    expect(resolveCommercialMapAdaptiveQuality(state, { ...sample, p95FrameTimeMs: 100 }).changed).toBe(false);
  });
  it('não classifica dez amostras ou pausas como cadência', () => {
    expect(estimateCommercialMapDisplayCadence(Array(10).fill(16.67))).toBeNull();
    expect(estimateCommercialMapDisplayCadence(Array(48).fill(500))).toBeNull();
  });
});

describe('capacidade WebGL reavaliada somente por ação explícita', () => {
  it('libera o contexto de teste e aceita suporte recuperado', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const loseContext = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const hook = renderHook(useWebGLAvailability);
    expect(hook.result.current.available).toBe(false);
    getContext.mockReturnValue({ isContextLost: () => false, getExtension: () => ({ loseContext }) } as unknown as WebGL2RenderingContext);
    act(() => { expect(hook.result.current.retry()).toBe(true); });
    expect(hook.result.current.available).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
  it('limita inclusive cliques agrupados a três novas sondagens', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const hook = renderHook(useWebGLAvailability);
    act(() => { for (let i = 0; i < 12; i++) hook.result.current.retry(); });
    expect(getContext).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(hook.result.current).toMatchObject({ attempts: 3, canRetry: false, available: false });
  });
  it('falha com segurança se o driver lançar durante a sondagem', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('driver'); });
    expect(probeCommercialMapWebGL2()).toBe(false);
  });
});

it('abre detalhes de estande sem voar uma câmera inexistente no fallback', () => {
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  Element.prototype.scrollIntoView = vi.fn();
  const stand = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'B2-M186')!;
  function Harness() {
    const explorer = useMapEntityFilter([stand], OFFICIAL_REFERENCE_DATA.lots);
    return <MapListView explorer={explorer} sceneAvailable={false} canRetry3D={false}
      permissions={{ canView: true, canEdit: false, canEditGeometry: false, canManageLots: false, canManageSales: false, canManageContracts: false, canManageLayers: false, isMapAdmin: false }} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
  expect(useCommercialMapStore.getState()).toMatchObject({ selectedEntityId: stand.id, activePanel: 'details', interiorEntityId: null });
  expect(screen.getByRole('button', { name: '3D indisponível nesta sessão' })).toBeDisabled();
});
