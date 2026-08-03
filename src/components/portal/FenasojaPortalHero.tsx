import { memo } from 'react';
import { OfficialCountdownCompact } from '@/components/countdown/OfficialCountdownCompact';
import { FenasojaPortalWordmark } from '@/components/portal/FenasojaPortalWordmark';

export const FenasojaPortalHero = memo(function FenasojaPortalHero() {
  return (
    <section className="fenasoja-portal__hero portal-reveal" aria-labelledby="portal-title">
      <div className="fenasoja-portal__hero-frame">
        <div className="fenasoja-portal__hero-brand">
          <FenasojaPortalWordmark />
        </div>
        <OfficialCountdownCompact />
      </div>
    </section>
  );
});
