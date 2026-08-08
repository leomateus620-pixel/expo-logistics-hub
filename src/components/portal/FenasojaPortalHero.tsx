import { memo } from 'react';
import { OfficialCountdownCompact } from '@/components/countdown/OfficialCountdownCompact';

export const FenasojaPortalHero = memo(function FenasojaPortalHero() {
  return (
    <section
      className="fenasoja-portal__hero portal-reveal"
      aria-labelledby="portal-official-countdown-title"
    >
      <div className="fenasoja-portal__hero-frame">
        <OfficialCountdownCompact />
      </div>
    </section>
  );
});
