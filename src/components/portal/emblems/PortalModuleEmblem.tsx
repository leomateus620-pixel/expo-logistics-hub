import { cn } from '@/lib/utils';
import type { PortalEntryId } from '@/modules/portal/portalRegistry';
import { PORTAL_MODULE_SYMBOLS } from './portalModuleSymbols';
import { getPortalModuleTone } from './portalModuleTone';
import '@/styles/portal-module-emblems.css';

interface PortalModuleEmblemProps {
  module: PortalEntryId;
  /** Holds the live pose, e.g. while the module panel is expanded. */
  active?: boolean;
  /** Softens the emblem when the profile cannot open the module. */
  muted?: boolean;
  /** Accessible name; omit when the emblem sits beside a visible title. */
  label?: string;
  className?: string;
}

/**
 * Plate, surface and symbol of a portal module. The emblem reacts to the
 * nearest `.portal-emblem-host` ancestor (hover, focus-visible and press).
 */
export function PortalModuleEmblem({
  module,
  active = false,
  muted = false,
  label,
  className,
}: PortalModuleEmblemProps) {
  const symbol = PORTAL_MODULE_SYMBOLS[module];

  return (
    <span
      className={cn('portal-emblem portal-tone', className)}
      data-emblem={module}
      {...getPortalModuleTone(module)}
      data-active={active || undefined}
      data-muted={muted || undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        className="portal-emblem__symbol"
        viewBox="0 0 32 32"
        focusable="false"
        aria-hidden="true"
      >
        {symbol.body}
      </svg>
    </span>
  );
}
