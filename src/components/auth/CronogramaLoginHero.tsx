import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

export function CronogramaLoginHero() {
  return (
    <section
      className="auth-hero auth-hero--cronograma"
      aria-labelledby="login-hero-title"
    >
      <FenasojaBrand
        className="auth-hero__brand"
        markOnly
        showEdition={false}
        tone="dark"
      />

      <div className="auth-hero__title-group">
        <h1
          id="login-hero-title"
          className="auth-hero__title auth-hero__title--cronograma"
        >
          <span className="auth-title-visual">
            <span className="auth-title-line auth-title-line--lead">Agenda</span>
            <span className="auth-title-line auth-title-line--brand">FENASOJA</span>
          </span>
        </h1>
      </div>
    </section>
  );
}
