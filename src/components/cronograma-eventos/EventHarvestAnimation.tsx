import { memo, useId } from 'react';
import type { HarvestCompletionPhase } from '@/hooks/useEventHarvestCompletion';
import { cn } from '@/lib/utils';

interface EventHarvestAnimationProps {
  phase?: HarvestCompletionPhase;
  reducedMotion?: boolean;
  compact?: boolean;
  className?: string;
}

const DUST_PARTICLES = Array.from({ length: 7 }, (_, index) => index);

export const EventHarvestAnimation = memo(function EventHarvestAnimation({
  phase = 'harvesting',
  reducedMotion = false,
  compact = false,
  className,
}: EventHarvestAnimationProps) {
  const instanceId = useId().replace(/:/g, '');
  const plantId = `cronograma-soy-plant-${instanceId}`;
  const stemGradientId = `cronograma-soy-stem-${instanceId}`;
  const leafGradientId = `cronograma-soy-leaf-${instanceId}`;
  const podGradientId = `cronograma-soy-pod-${instanceId}`;
  const combineBodyGradientId = `cronograma-combine-body-${instanceId}`;
  const combineCabGradientId = `cronograma-combine-cab-${instanceId}`;
  const combineMetalGradientId = `cronograma-combine-metal-${instanceId}`;

  return (
    <span
      className={cn('cronograma-harvest-animation', compact && 'is-compact', className)}
      data-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className="cronograma-harvest-wash" />

      <svg
        className="cronograma-harvest-field"
        viewBox="0 0 1320 120"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id={stemGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8d6920" />
            <stop offset="0.5" stopColor="#d3a53a" />
            <stop offset="1" stopColor="#705017" />
          </linearGradient>
          <linearGradient id={leafGradientId} x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#d8b24f" />
            <stop offset="0.56" stopColor="#aa7b25" />
            <stop offset="1" stopColor="#6f4e18" />
          </linearGradient>
          <radialGradient id={podGradientId} cx="32%" cy="22%" r="82%">
            <stop offset="0" stopColor="#fff0a6" />
            <stop offset="0.28" stopColor="#e8bd4d" />
            <stop offset="0.7" stopColor="#b67f24" />
            <stop offset="1" stopColor="#75501a" />
          </radialGradient>

          <symbol id={plantId} viewBox="0 0 70 120">
            <path
              d="M35 118C34 90 38 61 30 15M34 82 15 60M35 73l20-24M33 53 16 35M31 39l15-22"
              fill="none"
              stroke={`url(#${stemGradientId})`}
              strokeLinecap="round"
              strokeWidth="3.1"
            />
            <path d="M16 61C6 57 5 48 7 43c9 0 15 5 16 13-1 3-3 5-7 5Z" fill={`url(#${leafGradientId})`} />
            <path d="M53 49c10-6 17-1 19 4-4 8-11 10-18 5-2-3-2-6-1-9Z" fill={`url(#${leafGradientId})`} />
            <path d="M17 35C9 29 11 20 15 16c8 3 12 9 9 16-2 3-4 4-7 3Z" fill={`url(#${leafGradientId})`} />
            <path d="M46 18c5-8 13-7 17-4-1 8-6 13-13 12-3-1-5-4-4-8Z" fill={`url(#${leafGradientId})`} />

            <g fill={`url(#${podGradientId})`} stroke="#6d4813" strokeWidth="0.8">
              <path d="M11 57c-5-9 2-15 12-10 8 4 10 12 5 17-5 5-13 1-17-7Z" />
              <path d="M40 43c-2-10 6-14 15-7 7 5 7 14 1 18-6 3-14-3-16-11Z" />
              <path d="M17 76c-2-10 7-14 15-7 7 6 6 15 0 18-7 3-14-3-15-11Z" />
              <path d="M37 69c3-9 12-10 18-2 5 7 1 15-6 16-7 0-14-6-12-14Z" />
            </g>
            <g fill="#f8dc73" opacity="0.72">
              <circle cx="17" cy="53" r="1.7" />
              <circle cx="24" cy="57" r="1.7" />
              <circle cx="47" cy="41" r="1.7" />
              <circle cx="53" cy="46" r="1.7" />
              <circle cx="23" cy="75" r="1.7" />
              <circle cx="29" cy="80" r="1.7" />
              <circle cx="45" cy="71" r="1.7" />
              <circle cx="50" cy="76" r="1.7" />
            </g>
          </symbol>
        </defs>

        <g className="cronograma-harvest-soy-crop">
          <use href={`#${plantId}`} x="-8" y="6" width="74" height="114" />
          <use href={`#${plantId}`} x="52" y="-2" width="81" height="122" />
          <use href={`#${plantId}`} x="116" y="10" width="70" height="110" />
          <use href={`#${plantId}`} x="171" y="-5" width="84" height="125" />
          <use href={`#${plantId}`} x="239" y="5" width="76" height="115" />
          <use href={`#${plantId}`} x="299" y="-1" width="82" height="121" />
          <use href={`#${plantId}`} x="365" y="9" width="72" height="111" />
          <use href={`#${plantId}`} x="421" y="-4" width="84" height="124" />
          <use href={`#${plantId}`} x="489" y="6" width="76" height="114" />
          <use href={`#${plantId}`} x="549" y="0" width="80" height="120" />
          <use href={`#${plantId}`} x="613" y="8" width="74" height="112" />
          <use href={`#${plantId}`} x="670" y="-3" width="82" height="123" />
          <use href={`#${plantId}`} x="730" y="5" width="76" height="115" />
          <use href={`#${plantId}`} x="790" y="-1" width="82" height="121" />
          <use href={`#${plantId}`} x="856" y="9" width="72" height="111" />
          <use href={`#${plantId}`} x="912" y="-4" width="84" height="124" />
          <use href={`#${plantId}`} x="980" y="6" width="76" height="114" />
          <use href={`#${plantId}`} x="1040" y="0" width="80" height="120" />
          <use href={`#${plantId}`} x="1104" y="8" width="74" height="112" />
          <use href={`#${plantId}`} x="1161" y="-3" width="82" height="123" />
          <use href={`#${plantId}`} x="1221" y="4" width="76" height="116" />
          <use href={`#${plantId}`} x="1278" y="-2" width="80" height="122" />
        </g>
      </svg>

      <span className="cronograma-harvest-cleared-strip">
        <span className="cronograma-harvest-furrow is-one" />
        <span className="cronograma-harvest-furrow is-two" />
        <span className="cronograma-harvest-furrow is-three" />
        <span className="cronograma-harvest-stubble is-one" />
        <span className="cronograma-harvest-stubble is-two" />
        <span className="cronograma-harvest-stubble is-three" />
        <span className="cronograma-harvest-stubble is-four" />
      </span>

      <span className="cronograma-harvest-combine-runner">
        <span className="cronograma-harvest-dust">
          {DUST_PARTICLES.map((particle) => <i key={particle} />)}
        </span>

        <svg
          className="cronograma-harvest-combine"
          viewBox="0 0 260 122"
          focusable="false"
        >
          <defs>
            <linearGradient id={combineBodyGradientId} x1="0" y1="0" x2="0.92" y2="1">
              <stop offset="0" stopColor="#fff0a1" />
              <stop offset="0.24" stopColor="#f5c533" />
              <stop offset="0.62" stopColor="#e58a19" />
              <stop offset="1" stopColor="#a94912" />
            </linearGradient>
            <linearGradient id={combineCabGradientId} x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#d8eff4" />
              <stop offset="0.42" stopColor="#5b7891" />
              <stop offset="1" stopColor="#172b3c" />
            </linearGradient>
            <linearGradient id={combineMetalGradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#66717a" />
              <stop offset="0.52" stopColor="#242b31" />
              <stop offset="1" stopColor="#0f1418" />
            </linearGradient>
          </defs>

          <ellipse cx="135" cy="113" rx="101" ry="6" fill="#17202a" opacity="0.25" />

          <g className="cronograma-harvest-auger">
            <path d="M93 38 38 17" fill="none" stroke={`url(#${combineBodyGradientId})`} strokeLinecap="round" strokeWidth="8" />
            <path d="m38 17-13 4" fill="none" stroke="#9c4b13" strokeLinecap="round" strokeWidth="7" />
            <path d="M91 36 40 17" fill="none" stroke="#ffe47a" strokeLinecap="round" strokeWidth="1.5" opacity="0.7" />
          </g>

          <path d="M50 54 78 31h79l31 19 17 37H57Z" fill={`url(#${combineBodyGradientId})`} stroke="#8e4211" strokeWidth="2" />
          <path d="M78 31 91 20h63l12 13Z" fill="#edaa22" stroke="#9a4c13" strokeWidth="1.7" />
          <path d="M89 24h64" stroke="#fff2a4" strokeLinecap="round" strokeWidth="2" opacity="0.74" />
          <path d="M56 58h42l-8 24H54Z" fill="#c96a16" opacity="0.84" />
          <path d="m158 35 30 16 15 32h-46Z" fill={`url(#${combineCabGradientId})`} stroke="#202b35" strokeWidth="2" />
          <path d="m165 40 18 10 10 23h-29Z" fill="#b9d7df" opacity="0.32" />
          <path d="M159 61h41" stroke="#d6e9ed" strokeWidth="1.2" opacity="0.48" />
          <path d="M148 35v48" stroke="#853d12" strokeWidth="2" />
          <path d="M73 48h65M69 58h72" stroke="#fff1a0" strokeLinecap="round" strokeWidth="1.4" opacity="0.54" />
          <rect x="119" y="13" width="7" height="21" rx="2" fill="#252c31" />
          <path d="M118 13h10" stroke="#4b545a" strokeLinecap="round" strokeWidth="3" />

          <path d="M47 78h161l-7 15H56Z" fill={`url(#${combineMetalGradientId})`} stroke="#11171b" strokeWidth="1.8" />
          <path d="M194 75h44l9 9-7 8h-43Z" fill="#db8a1d" stroke="#713710" strokeWidth="1.8" />

          <g className="cronograma-harvest-reel">
            <circle cx="229" cy="79" r="21" fill="none" stroke="#5b3915" strokeWidth="3" />
            <circle cx="229" cy="79" r="5" fill="#e6a829" stroke="#573312" strokeWidth="2" />
            <path d="M229 58v42M208 79h42M214 64l30 30M244 64l-30 30" stroke="#8b571b" strokeWidth="1.8" />
          </g>
          <path d="M199 96h57M203 91h49" stroke="#282f34" strokeLinecap="round" strokeWidth="4" />
          <path d="m205 96 7 8m7-8 7 8m7-8 7 8m7-8 7 8" stroke="#222a30" strokeWidth="2" />

          <g className="cronograma-harvest-wheel is-front">
            <circle cx="151" cy="91" r="26" fill="#151a1e" stroke="#30383e" strokeWidth="3" />
            <circle cx="151" cy="91" r="16" fill="#252c31" stroke="#59636a" strokeWidth="2" />
            <circle cx="151" cy="91" r="6" fill="#d88a1e" stroke="#864311" strokeWidth="2" />
            <path d="M151 69v44M129 91h44M136 76l30 30M166 76l-30 30" stroke="#667079" strokeWidth="1.7" />
          </g>
          <g className="cronograma-harvest-wheel is-rear">
            <circle cx="68" cy="94" r="17" fill="#151a1e" stroke="#30383e" strokeWidth="2.5" />
            <circle cx="68" cy="94" r="10" fill="#293036" stroke="#5e686f" strokeWidth="1.8" />
            <circle cx="68" cy="94" r="4" fill="#d88a1e" />
            <path d="M68 79v30M53 94h30M58 84l20 20M78 84l-20 20" stroke="#667079" strokeWidth="1.3" />
          </g>

          <path d="M101 89h22" stroke="#f7d35b" strokeLinecap="round" strokeWidth="3" />
          <path d="M102 94h18" stroke="#f7d35b" strokeLinecap="round" strokeWidth="2" opacity="0.66" />
        </svg>
      </span>

      <span className="cronograma-harvest-complete-seal">
        <span className="cronograma-harvest-complete-icon">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="m6.8 12.2 3.2 3.2 7.2-7.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
          </svg>
        </span>
        <span>
          <strong>Colheita concluída</strong>
          <small>Movendo para concluídos</small>
        </span>
      </span>
    </span>
  );
});
