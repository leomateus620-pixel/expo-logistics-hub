import './alvorada-preparing.css';

interface AlvoradaPreparingSurfaceProps {
  /** Fades the surface out when the journey has started. */
  active?: boolean;
  /** Progress hint in [0, 1] when downloads are measurable; hides the meter otherwise. */
  progress?: number | null;
}

/**
 * Shared "Preparando a Alvorada" surface: the host shows it while the intro
 * chunk loads and the intro keeps it while the renderer prepares, so a slow
 * device sees one continuous, calm night sky — never the final frame early.
 */
export function AlvoradaPreparingSurface({ active = true, progress = null }: AlvoradaPreparingSurfaceProps) {
  return (
    <div
      className="alvorada-preparing"
      data-testid="alvorada-preparing"
      data-active={active || undefined}
      aria-hidden="true"
    >
      <span className="alvorada-preparing__glow" />
      <span className="alvorada-preparing__orbit" />
      <span className="alvorada-preparing__label">Preparando a Alvorada</span>
      {progress !== null && (
        <span className="alvorada-preparing__meter">
          <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
        </span>
      )}
    </div>
  );
}
