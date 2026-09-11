import { useState } from 'react';
import type { AlvoradaPhase } from './timeline';

export type HarvestBackdropVariant = 'auto' | 'landscape' | 'portrait';

const HARVEST_LANDSCAPE_SRC = '/alvorada/soy-harvest-dawn.webp';
const HARVEST_PORTRAIT_SRC = '/alvorada/soy-harvest-dawn-mobile.webp';

interface HarvestBackdropProps {
  stage: AlvoradaPhase;
  onCovered?: () => void;
  onUnavailable?: () => void;
  /**
   * `auto` follows the viewport (fullscreen usage). Embedded hosts measure their
   * own container and pick the framing that keeps the horizon readable.
   */
  variant?: HarvestBackdropVariant;
}

/** A decoded, bounded raster layer carries the horizon beyond orbital LOD. */
export function HarvestBackdrop({
  stage,
  onCovered,
  onUnavailable,
  variant = 'auto',
}: HarvestBackdropProps) {
  const [decoded, setDecoded] = useState(false);
  const image = (
    <img
      src={variant === 'portrait' ? HARVEST_PORTRAIT_SRC : HARVEST_LANDSCAPE_SRC}
      alt=""
      decoding="async"
      onError={() => onUnavailable?.()}
      onLoad={async (event) => {
        const image = event.currentTarget;
        await image.decode().catch(() => undefined);
        setDecoded(true);
      }}
    />
  );

  return (
    <div
      className="alvorada-harvest"
      data-stage={stage}
      data-decoded={decoded || undefined}
      data-variant={variant}
      aria-hidden="true"
      onTransitionEnd={(event) => {
        // A late decode starts the fade during the hold. Retain the scene until
        // the landscape actually covers it, not merely until bytes are ready.
        if (event.target === event.currentTarget && event.propertyName === 'opacity'
          && decoded && getComputedStyle(event.currentTarget).opacity === '1') onCovered?.();
      }}
    >
      {variant === 'auto' ? (
        <picture>
          <source media="(max-width: 640px) and (orientation: portrait)" srcSet={HARVEST_PORTRAIT_SRC} />
          {image}
        </picture>
      ) : image}
    </div>
  );
}
