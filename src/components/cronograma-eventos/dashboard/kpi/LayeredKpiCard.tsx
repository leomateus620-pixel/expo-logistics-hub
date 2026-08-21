import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useCardLayerScroll } from '@/hooks/useCardLayerScroll';

export interface KpiLayer {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  layers: [KpiLayer, KpiLayer];
  tone?: 'neutral' | 'healthy' | 'attention' | 'critical' | 'informational';
  icon: ReactNode;
  /** Índice usado apenas para o stagger de entrada. */
  order?: number;
  className?: string;
}

/**
 * Card de indicador com duas camadas empilhadas e navegação vertical física
 * (spring + damping + inércia + snap). O card permanece imóvel; o conteúdo
 * interno se move via transform/opacity.
 */
export default function LayeredKpiCard({ layers, tone = 'neutral', icon, order = 0, className }: Props) {
  const { offset, index, isDragging, goTo, bind } = useCardLayerScroll({ layers: 2 });
  const [mounted, setMounted] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 20 + order * 40);
    return () => window.clearTimeout(id);
  }, [order]);

  const progress = Math.min(1, Math.max(0, offset));

  return (
    <section
      ref={(node) => {
        shellRef.current = node;
        bind.ref(node);
      }}
      className={cn('agenda-kpi-card', className)}
      data-tone={tone}
      data-mounted={mounted || undefined}
      data-dragging={isDragging || undefined}
      style={{ ['--kpi-order' as string]: String(order) }}
      onPointerDown={bind.onPointerDown}
      onKeyDown={bind.onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`${layers[index]?.label ?? layers[0].label}. Role verticalmente para alternar a camada.`}
    >
      <span className="agenda-kpi-icon" aria-hidden="true">{icon}</span>

      <div className="agenda-kpi-viewport">
        {layers.map((layer, layerIndex) => {
          const distance = layerIndex - progress;
          const style = {
            transform: `translate3d(0, ${distance * 100}%, 0)`,
            opacity: Math.max(0, 1 - Math.abs(distance) * 1.25),
          };
          return (
            <div
              key={layer.id}
              className="agenda-kpi-layer"
              style={style}
              aria-hidden={Math.abs(distance) > 0.5}
            >
              {layer.content}
            </div>
          );
        })}
      </div>

      <div className="agenda-kpi-dots" role="tablist" aria-label="Camadas do indicador">
        {layers.map((layer, layerIndex) => (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={index === layerIndex}
            aria-label={layer.label}
            className="agenda-kpi-dot"
            data-active={index === layerIndex || undefined}
            onClick={(event) => {
              event.stopPropagation();
              goTo(layerIndex);
            }}
          />
        ))}
      </div>
    </section>
  );
}
