import { memo } from 'react';
import { FenasojaGoldenSoybean } from '@/components/brand/FenasojaGoldenSoybean';

/** Five reusable vector grains: no image decode, canvas, particles or frame state. */
export const SoybeanAtmosphere = memo(function SoybeanAtmosphere({ active }: { active: boolean }) {
  return (
    <div className="org-soy-atmosphere" data-active={active || undefined} aria-hidden="true">
      <span className="org-soy-atmosphere__horizon" />
      {[0, 1, 2, 3, 4].map((grain) => (
        <span key={grain} className="org-soy-atmosphere__layer" data-grain={grain}>
          <FenasojaGoldenSoybean className="org-soy-atmosphere__grain" />
        </span>
      ))}
    </div>
  );
});
