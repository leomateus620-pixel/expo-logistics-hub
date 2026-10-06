import type { ReactNode, SVGProps } from 'react';

/**
 * Local glyphs of the Dashboard overview (header through "Área comercial").
 * Strokes use currentColor; `.is-soft` parts take the variant's soft fill.
 */
type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function Glyph({ children, viewBox = '0 0 24 24', strokeWidth = 1.7, ...props }: GlyphProps & { children: ReactNode }) {
  return <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

/** Eight-point seal with a firm check: a confirmed commercial agreement. */
export function ConfirmedSealGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <path className="is-soft" d="M12 2.7l3 2 3.6.7.7 3.6 2 3-2 3-.7 3.6-3.6.7-3 2-3-2-3.6-.7-.7-3.6-2-3 2-3 .7-3.6 3.6-.7Z" />
    <path d="m8.4 12.3 2.5 2.5 4.9-5.2" strokeWidth={2} />
  </Glyph>;
}

/** Contract sheet with a pending signature and an open clock. */
export function PendingSignatureGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <path d="M11.6 20.4H7.4a1.8 1.8 0 0 1-1.8-1.8V5.3a1.8 1.8 0 0 1 1.8-1.8h6.8l4.2 4.2v3" />
    <path d="M14.2 3.5v3a1.2 1.2 0 0 0 1.2 1.2h3" />
    <path d="M8.6 9.6h4.4" />
    <path d="M8.6 14.4c.8-1.4 1.6-1.4 2 0 .4 1.3 1.1 1.2 1.7 0" />
    <circle className="is-soft" cx="17.2" cy="17.2" r="4.3" />
    <path d="M17.2 15.3v2.1l1.3.9" />
  </Glyph>;
}

/** Stacked layers: the consolidated commercial base of the inventory. */
export function InventoryBaseGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <path className="is-soft" d="m12 3.6 8.2 4.2-8.2 4.2-8.2-4.2Z" />
    <path d="m3.8 12 8.2 4.2 8.2-4.2" />
    <path d="m3.8 16.2 8.2 4.2 8.2-4.2" />
  </Glyph>;
}

export function ModulesGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <rect className="is-soft" x="3.8" y="3.8" width="7" height="7" rx="1.7" />
    <rect x="13.2" y="3.8" width="7" height="7" rx="1.7" />
    <rect x="3.8" y="13.2" width="7" height="7" rx="1.7" />
    <rect className="is-soft" x="13.2" y="13.2" width="7" height="7" rx="1.7" />
  </Glyph>;
}

/** Turning arc with three pending steps. */
export function ProcessGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <path d="M19.8 12a7.8 7.8 0 1 1-2.3-5.5" />
    <path d="M17.9 3.4v3.4h-3.4" />
    <circle cx="8.5" cy="12" r=".9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="12" r=".9" fill="currentColor" stroke="none" />
  </Glyph>;
}

export function ConfirmedGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <circle className="is-soft" cx="12" cy="12" r="8.3" />
    <path d="m8.4 12.3 2.4 2.4 4.8-5" strokeWidth={1.9} />
  </Glyph>;
}

/** A free, demarcated lot with its marker flag. */
export function AvailableLotGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3.2" strokeDasharray="2.4 2.6" />
    <path className="is-soft" d="M9.2 16.6V7.4h6.4l-1.5 2.3 1.5 2.3H9.2" />
  </Glyph>;
}

export function AreaMeasureGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <rect className="is-soft" x="7.6" y="7.6" width="12.6" height="12.6" rx="1.8" />
    <path d="M7.6 3.8h12.6M7.6 2.7v2.2M20.2 2.7v2.2" />
    <path d="M3.8 7.6v12.6M2.7 7.6h2.2M2.7 20.2h2.2" />
  </Glyph>;
}

export function InfoGlyph(props: GlyphProps) {
  return <Glyph viewBox="0 0 16 16" strokeWidth={1.5} {...props}>
    <circle cx="8" cy="8" r="6.3" />
    <path d="M8 7.2v3.7" />
    <circle cx="8" cy="4.9" r=".85" fill="currentColor" stroke="none" />
  </Glyph>;
}

/** Header mark: confirmed (blue) and in-progress (orange) bars on one base. */
export function DashboardMarkGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <rect className="is-blue" x="4.6" y="11.2" width="3.7" height="8.3" rx="1.25" stroke="none" />
    <rect className="is-orange" x="10.15" y="7.6" width="3.7" height="11.9" rx="1.25" stroke="none" />
    <rect className="is-blue-deep" x="15.7" y="4.5" width="3.7" height="15" rx="1.25" stroke="none" />
    <path className="is-base" d="M3.4 21h17.2" />
  </Glyph>;
}

export function SyncActiveGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <path d="M19.4 12a7.4 7.4 0 0 1-12.7 5.2" />
    <path d="M4.6 12a7.4 7.4 0 0 1 12.7-5.2" />
    <path d="M17.6 3.4v3.5h-3.5" />
    <path d="M6.4 20.6v-3.5h3.5" />
  </Glyph>;
}

export function SyncDoneGlyph(props: GlyphProps) {
  return <Glyph {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.7V12l2.8 1.7" />
  </Glyph>;
}

export function PauseGlyph(props: GlyphProps) {
  return <Glyph {...props} strokeWidth={2.2}><path d="M9 7v10M15 7v10" /></Glyph>;
}

export function PlayGlyph(props: GlyphProps) {
  return <Glyph {...props}><path d="M8.6 6.6v10.8l8.6-5.4Z" fill="currentColor" /></Glyph>;
}

export function LegendConfirmedKey() {
  return <svg className="commercial-dashboard-overview-progress__key commercial-dashboard-overview-progress__key--confirmed"
    viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <rect x=".5" y=".5" width="11" height="11" rx="3.4" />
    <path d="m3.4 6.1 1.7 1.7 3.5-3.6" />
  </svg>;
}

export function LegendOpenKey() {
  return <svg className="commercial-dashboard-overview-progress__key commercial-dashboard-overview-progress__key--open"
    viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <circle cx="6" cy="6" r="4.9" />
    <path d="M6 1.1a4.9 4.9 0 0 1 0 9.8Z" />
  </svg>;
}
