import { AgendaWordmark } from '@/components/brand/AgendaWordmark';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

export function VenueEventsLoginHero() {
  return (
    <section className="auth-hero auth-hero--venue" aria-labelledby="login-hero-title">
      <FenasojaBrand
        className="auth-hero__brand"
        scale="display"
        showEdition={false}
        subtitle="Operação de espaços"
        tone="dark"
      />

      <div className="auth-hero__title-group auth-hero__title-group--venue">
        <span className="auth-venue-tag">Operação de espaços</span>
        <h1 id="login-hero-title" className="auth-hero__title auth-hero__title--venue">
          <AgendaWordmark variant="venue" scale="hero" />
        </h1>
        <p className="auth-hero__subtitle">
          Reservas, aprovações e contrapartidas em um ambiente único.
        </p>
      </div>
    </section>
  );
}
