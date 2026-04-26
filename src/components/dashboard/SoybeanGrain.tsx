import { cn } from '@/lib/utils';

interface SoybeanGrainProps {
  size?: number;
  className?: string;
  withGlow?: boolean;
}

/**
 * Grão de soja dourado — SVG vetorial, representando a Fenasoja.
 * Inclui hilum (mancha lateral característica), highlight especular e gradiente radial premium.
 */
export default function SoybeanGrain({ size = 26, className, withGlow = true }: SoybeanGrainProps) {
  const id = `soy-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      style={
        withGlow
          ? { filter: 'drop-shadow(0 2px 4px hsl(var(--gold) / 0.55)) drop-shadow(0 0 8px hsl(var(--gold) / 0.35))' }
          : undefined
      }
      aria-hidden
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFF1B8" />
          <stop offset="35%" stopColor="#F2C94C" />
          <stop offset="78%" stopColor="#C9881C" />
          <stop offset="100%" stopColor="#7A5210" />
        </radialGradient>
        <radialGradient id={`${id}-spec`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-hilum`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3a2407" />
          <stop offset="100%" stopColor="#1a1004" />
        </linearGradient>
      </defs>

      {/* Body (oval grain) */}
      <ellipse cx="16" cy="16" rx="13" ry="10" fill={`url(#${id}-body)`} />

      {/* Subtle inner shadow on bottom */}
      <ellipse cx="16" cy="20" rx="11" ry="5" fill="#000" opacity="0.10" />

      {/* Hilum — mancha lateral característica do grão */}
      <ellipse cx="16" cy="16" rx="3.4" ry="1.1" fill={`url(#${id}-hilum)`} opacity="0.85" />
      <ellipse cx="16" cy="16" rx="3.4" ry="1.1" fill="none" stroke="#FFE89A" strokeWidth="0.25" opacity="0.55" />

      {/* Specular highlight */}
      <ellipse cx="11" cy="11.5" rx="4" ry="2.2" fill={`url(#${id}-spec)`} transform="rotate(-22 11 11.5)" />

      {/* Outer rim light */}
      <ellipse cx="16" cy="16" rx="13" ry="10" fill="none" stroke="#FFE89A" strokeWidth="0.35" opacity="0.45" />
    </svg>
  );
}
