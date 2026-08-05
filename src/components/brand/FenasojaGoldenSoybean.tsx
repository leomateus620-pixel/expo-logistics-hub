import { useId } from 'react';
import { cn } from '@/lib/utils';

interface FenasojaGoldenSoybeanProps {
  auraClassName?: string;
  className?: string;
  dataTestId?: string;
  grainClassName?: string;
}

export function FenasojaGoldenSoybean({
  auraClassName,
  className,
  dataTestId,
  grainClassName,
}: FenasojaGoldenSoybeanProps) {
  const idPrefix = useId().replace(/:/g, '') || 'fenasoja-soybean';
  const auraId = `${idPrefix}-aura`;
  const bodyId = `${idPrefix}-body`;
  const rimId = `${idPrefix}-rim`;
  const hilumId = `${idPrefix}-hilum`;
  const sheenId = `${idPrefix}-sheen`;
  const clipId = `${idPrefix}-clip`;

  return (
    <span
      className={cn('fenasoja-golden-soybean', className)}
      data-testid={dataTestId}
      aria-hidden="true"
    >
      <svg
        className={cn('fenasoja-golden-soybean__grain', grainClassName)}
        viewBox="0 0 112 126"
        focusable="false"
      >
        <defs>
          <radialGradient id={auraId} cx="50%" cy="44%" r="52%">
            <stop offset="0" stopColor="#ffe882" stopOpacity="0.26" />
            <stop offset="0.52" stopColor="#f7b92e" stopOpacity="0.1" />
            <stop offset="1" stopColor="#f7b92e" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={bodyId}
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(31 23) rotate(55) scale(108 90)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#fffef0" />
            <stop offset="0.13" stopColor="#fff39a" />
            <stop offset="0.38" stopColor="#ffd042" />
            <stop offset="0.66" stopColor="#e79514" />
            <stop offset="0.87" stopColor="#9a5208" />
            <stop offset="1" stopColor="#4f2603" />
          </radialGradient>
          <linearGradient id={rimId} x1="17" y1="13" x2="92" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffbd0" />
            <stop offset="0.4" stopColor="#f3b52a" />
            <stop offset="0.78" stopColor="#a75c08" />
            <stop offset="1" stopColor="#5a2a03" />
          </linearGradient>
          <radialGradient
            id={hilumId}
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(72 60) rotate(116) scale(23 12)"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fff0a0" />
            <stop offset="0.34" stopColor="#d68b11" />
            <stop offset="0.78" stopColor="#81500b" />
            <stop offset="1" stopColor="#3f2103" />
          </radialGradient>
          <linearGradient id={sheenId} x1="24" y1="15" x2="77" y2="87" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.9" />
            <stop offset="0.34" stopColor="#fffbd1" stopOpacity="0.44" />
            <stop offset="0.76" stopColor="#ffd857" stopOpacity="0.06" />
            <stop offset="1" stopColor="#ffd857" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <path d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z" />
          </clipPath>
        </defs>

        <ellipse
          className={cn('fenasoja-golden-soybean__aura', auraClassName)}
          cx="56"
          cy="61"
          rx="55"
          ry="61"
          fill={`url(#${auraId})`}
        />
        <ellipse cx="56" cy="114" rx="31" ry="7" fill="#071326" opacity="0.5" />
        <path
          d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z"
          fill={`url(#${bodyId})`}
          stroke={`url(#${rimId})`}
          strokeWidth="2.3"
        />
        <g clipPath={`url(#${clipId})`}>
          <ellipse
            cx="32"
            cy="29"
            rx="22"
            ry="36"
            transform="rotate(31 32 29)"
            fill={`url(#${sheenId})`}
          />
          <path d="M15 76C35 101 64 108 88 95" fill="none" stroke="#ffdf60" strokeOpacity="0.35" strokeWidth="4.2" />
          <path d="M20 98C39 116 64 119 80 109" fill="none" stroke="#6d3506" strokeOpacity="0.34" strokeWidth="3" />
          <ellipse cx="85" cy="31" rx="19" ry="32" fill="#7e4005" opacity="0.16" />
          <path d="M20 59C23 36 37 16 55 11" fill="none" stroke="white" strokeLinecap="round" strokeOpacity="0.3" strokeWidth="2.2" />
        </g>
        <path
          d="M68 48c10-3 19 3 18 12-1 10-8 19-17 21-7 2-12-3-10-10 2-9 3-20 9-23Z"
          fill={`url(#${hilumId})`}
          stroke="#6e3c08"
          strokeWidth="1.45"
        />
        <path d="M68 54c5-2 10 0 11 4" fill="none" stroke="#fff3ad" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="1.8" />
        <ellipse cx="30" cy="23" rx="9" ry="4.5" transform="rotate(-34 30 23)" fill="white" opacity="0.72" />
        <circle cx="24" cy="38" r="2.8" fill="#fffde3" opacity="0.74" />
      </svg>
    </span>
  );
}
