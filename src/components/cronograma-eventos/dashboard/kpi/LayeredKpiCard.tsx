import { memo, useEffect, useState, type ReactNode } from 'react';
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
  /** Tom aplicado apenas quando a segunda tela está ativa. */
  secondaryTone?: Props['tone'];
  icon: ReactNode;
  secondaryIcon?: ReactNode;
  /** Índice usado apenas para o stagger de entrada. */
  order?: number;
  className?: string;
}

/**
 * Card de indicador que funciona como viewport: duas telas empilhadas
 * verticalmente deslizam dentro dele com física real, sem alterar a altura.
 */
function LayeredKpiCard({
  layers,
  tone = 'neutral',
  secondaryTone,
  icon,
  secondaryIcon,
  order = 0,
  className,
}: Props) {
  const { progress, index, isDragging, goTo, bind } = useCardLayerScroll({ layers: 2 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 20 + order * 45);
    return () => window.clearTimeout(id);
  }, [order]);

  const p = Math.min(1, Math.max(0, progress));
  const activeTone = (p > 0.5 ? secondaryTone ?? tone : tone) ?? 'neutral';
  const activeIcon = p > 0.5 ? secondaryIcon ?? icon : icon;

  return (
    <section
      ref={bind.ref}
      className={cn('agenda-kpi-card', className)}
      data-tone={activeTone}
      data-mounted={mounted || undefined}
      data-dragging={isDragging || undefined}
      data-layer={index}
      style={{ ['--kpi-order' as string]: String(order) }}
      onPointerDown={bind.onPointerDown}
      onKeyDown={bind.onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`${layers[index]?.label ?? layers[0].label}. Use as setas para cima e para baixo para alternar a visualização.`}
    >
      <header className="agenda-kpi-head">
        <span className="agenda-kpi-icon" aria-hidden="true">{activeIcon}</span>
      </header>

      <div className="agenda-kpi-viewport">
        <div
          className="agenda-kpi-track"
          style={{
            transform: `translate3d(0, ${-p * 100}%, 0)`,
            willChange: isDragging || (p > 0.001 && p < 0.999) ? 'transform' : undefined,
          }}
        >
          {layers.map((layer, layerIndex) => {
            const distance = Math.abs(layerIndex - p);
            return (
              <div
                key={layer.id}
                className="agenda-kpi-screen"
                style={{
                  opacity: 1 - Math.min(1, distance) * 0.55,
                  transform: `scale(${1 - Math.min(1, distance) * 0.012})`,
                }}
                aria-hidden={distance > 0.5}
              >
                {layer.content}
              </div>
            );
          })}
        </div>
      </div>

      <div className="agenda-kpi-rail" role="tablist" aria-orientation="vertical" aria-label="Visualizações do indicador">
        {layers.map((layer, layerIndex) => (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={index === layerIndex}
            aria-label={layer.label}
            className="agenda-kpi-rail-dot"
            data-active={index === layerIndex || undefined}
            onClick={(event) => {
              event.stopPropagation();
              goTo(layerIndex);
            }}
          />
        ))}
        <span
          className="agenda-kpi-rail-thumb"
          aria-hidden="true"
          style={{ transform: `translate3d(0, ${p * 100}%, 0)` }}
        />
      </div>
    </section>
  );
}

export default memo(LayeredKpiCard);
