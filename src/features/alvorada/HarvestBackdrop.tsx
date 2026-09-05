import { useState } from 'react';
import type { AlvoradaPhase } from './timeline';

/** A decoded, bounded raster layer carries the horizon beyond orbital LOD. */
export function HarvestBackdrop({ stage, onCovered }: { stage: AlvoradaPhase; onCovered?: () => void }) {
  const [decoded, setDecoded] = useState(false);
  return (
    <div
      className="alvorada-harvest"
      data-stage={stage}
      data-decoded={decoded || undefined}
      aria-hidden="true"
      onTransitionEnd={(event) => {
        // A late decode starts the fade during the hold. Retain the scene until
        // the landscape actually covers it, not merely until bytes are ready.
        if (event.target === event.currentTarget && event.propertyName === 'opacity'
          && decoded && getComputedStyle(event.currentTarget).opacity === '1') onCovered?.();
      }}
    >
      <picture>
        <source media="(max-width: 640px) and (orientation: portrait)" srcSet="/alvorada/soy-harvest-dawn-mobile.webp" />
        <img
          src="/alvorada/soy-harvest-dawn.webp"
          alt=""
          decoding="async"
          onLoad={async (event) => {
            const image = event.currentTarget;
            await image.decode().catch(() => undefined);
            setDecoded(true);
          }}
        />
      </picture>
    </div>
  );
}
