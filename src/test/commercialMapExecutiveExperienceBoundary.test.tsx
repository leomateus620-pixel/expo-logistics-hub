import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ExecutiveExperienceErrorBoundary } from '@/features/commercial-map/components/canvas/executives/ExecutiveExperienceErrorBoundary';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

function BrokenExecutiveAsset(): ReactElement {
  throw new Error('GLB indisponivel');
}

describe('isolamento de falhas da experiencia executiva', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      cameraNavigating: true,
      executiveFocusActive: true,
      executiveTarget: [15.08, 0.397, 16.68],
      executiveCameraOffset: [0.72, 0.24, -0.55],
      executiveInteractionPhase: 'waving',
      executiveInteractionEnabled: true,
      executiveExperienceAvailable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('remove somente a camada opcional e restaura seu contrato ao falhar um GLB', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { container } = render(
      <ExecutiveExperienceErrorBoundary>
        <BrokenExecutiveAsset />
      </ExecutiveExperienceErrorBoundary>,
    );

    expect(container.childElementCount).toBe(0);
    expect(useCommercialMapStore.getState()).toMatchObject({
      cameraNavigating: false,
      executiveFocusActive: false,
      executiveTarget: null,
      executiveCameraOffset: null,
      executiveInteractionPhase: 'walking',
      executiveInteractionEnabled: false,
      executiveExperienceAvailable: false,
    });
  });

  it('preserva os filhos quando os assets sao validos', () => {
    render(
      <ExecutiveExperienceErrorBoundary>
        <span>Camada executiva pronta</span>
      </ExecutiveExperienceErrorBoundary>,
    );

    expect(screen.getByText('Camada executiva pronta')).toBeInTheDocument();
  });
});
