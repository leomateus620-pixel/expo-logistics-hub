import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentLegend } from '@/features/commercial-map/components/segments/SegmentLegend';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
} from '@/features/commercial-map/data/officialReference2026';

describe('legenda acessível dos segmentos comerciais', () => {
  it('apresenta os três segmentos, seus inventários e solicita foco', () => {
    const onSelect = vi.fn();
    render(
      <SegmentLegend
        entities={OFFICIAL_REFERENCE_ENTITIES}
        lots={OFFICIAL_REFERENCE_LOTS}
        activeSegmentId={null}
        onSelect={onSelect}
        onClear={vi.fn()}
      />,
    );

    const legend = screen.getByRole('region', { name: 'Segmentos comerciais do parque' });
    expect(within(legend).getByText('Exporural')).toBeInTheDocument();
    expect(within(legend).getByText('Indústria, Comércio e Serviços')).toBeInTheDocument();
    expect(within(legend).getByText('Espaço do Automóvel')).toBeInTheDocument();
    expect(within(legend).getByRole('button', { name: /Focar Exporural\. 95 lotes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(within(legend).getByRole('button', { name: /Focar Indústria, Comércio e Serviços\. 1166 lotes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(within(legend).getByRole('button', { name: /Focar Espaço do Automóvel\. 52 lotes/i })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(legend).getByRole('button', { name: /Focar Espaço do Automóvel/i }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(COMMERCIAL_MAP_SEGMENT_IDS.automotive);
  });

  it('comunica o segmento ativo e permite restaurar a visão geral', () => {
    const onClear = vi.fn();
    render(
      <SegmentLegend
        entities={OFFICIAL_REFERENCE_ENTITIES}
        lots={OFFICIAL_REFERENCE_LOTS}
        activeSegmentId={COMMERCIAL_MAP_SEGMENT_IDS.industry}
        onSelect={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(screen.getByText('Indústria, Comércio e Serviços em foco')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remover foco de Indústria, Comércio e Serviços/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todos os segmentos' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
