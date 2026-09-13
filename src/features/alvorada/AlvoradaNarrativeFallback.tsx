import { useEffect, useState } from 'react';
import { loadAlvoradaAsset } from './alvoradaAssets';
import { getEarthTextureUrls } from './earthAssets';
import type { AlvoradaIntroStage, AlvoradaPhase } from './timeline';
import './alvorada-narrative.css';

interface AlvoradaNarrativeFallbackProps {
  phase: AlvoradaPhase;
  /** Crossfades only: no travel, no zoom (prefers-reduced-motion). */
  reduced?: boolean;
  stage: AlvoradaIntroStage;
}

/** The compact albedo already flowing through the pipeline dresses the CSS planet. */
function useAlbedoObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    loadAlvoradaAsset(getEarthTextureUrls(true)[0])
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);
  return url;
}

/**
 * CSS-only rendition of the journey for devices without a usable WebGL
 * renderer: a planet in orbit, the dive through the atmosphere towards Santa
 * Rosa and the horizon that receives the dawn. It never reproduces the 3D
 * detail, but it keeps the narrative so a fallback is not perceived as "the
 * animation skipped to the end". The harvest landscape and the brand frame are
 * layered above it by the intro, exactly as over the WebGL scene.
 */
export function AlvoradaNarrativeFallback({ phase, reduced = false, stage }: AlvoradaNarrativeFallbackProps) {
  const albedo = useAlbedoObjectUrl();

  return (
    <div
      className="alvorada-narrative"
      data-testid="alvorada-narrative-fallback"
      data-stage={stage}
      data-phase={phase}
      data-reduced={reduced || undefined}
      data-textured={albedo ? 'true' : undefined}
      role="img"
      aria-label="Alvorada de Santa Rosa"
    >
      <div className="alvorada-narrative__stars" aria-hidden="true" />
      <div className="alvorada-narrative__planet" aria-hidden="true">
        <span className="alvorada-narrative__planet-surface">
          {albedo && <img src={albedo} alt="" decoding="async" draggable={false} />}
        </span>
        <span className="alvorada-narrative__planet-terminator" />
      </div>
      <span className="alvorada-narrative__marker" aria-hidden="true" />
      <div className="alvorada-narrative__veil" aria-hidden="true" />
      <div className="alvorada-narrative__horizon" aria-hidden="true">
        <span className="alvorada-narrative__sun" />
      </div>
    </div>
  );
}
