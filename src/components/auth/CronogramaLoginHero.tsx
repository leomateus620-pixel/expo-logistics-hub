import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import goldenSoybean from '@/assets/fenasoja-golden-soybean.png';

export function CronogramaLoginHero() {
  return (
    <section
      className="auth-hero auth-hero--cronograma"
      aria-labelledby="login-hero-title"
    >
      <FenasojaBrand
        className="auth-hero__brand"
        scale="display"
        showEdition={false}
        subtitle="Planejamento institucional"
        tone="dark"
      />

      <div className="auth-hero__title-group">
        <h1
          id="login-hero-title"
          className="auth-hero__title auth-hero__title--cronograma"
        >
          <span className="sr-only">Planejamento da Fenasoja 2028</span>
          <span className="auth-title-visual" aria-hidden="true">
            <span className="auth-title-line auth-title-line--lead">
              Planejamento da
            </span>
            <span className="auth-title-line auth-title-line--brand">
              <span className="auth-title-word">
                Fenas
                <span className="auth-title-soy-o">
                  <img
                    src={goldenSoybean}
                    alt=""
                    width="384"
                    height="384"
                    decoding="async"
                    draggable={false}
                  />
                </span>
                ja
              </span>
              <span className="auth-title-year">2028</span>
            </span>
          </span>
        </h1>

        <div
          className="auth-strategy-timeline"
          role="img"
          aria-label="Ciclo estratégico de 2026 a 2028, com foco atual em 2028"
        >
          <span className="auth-strategy-timeline__caption" aria-hidden="true">
            Ciclo estratégico
          </span>
          <span className="auth-strategy-timeline__track" aria-hidden="true">
            <span className="auth-strategy-timeline__milestone">
              <i />
              <strong>2026</strong>
            </span>
            <span className="auth-strategy-timeline__milestone">
              <i />
              <strong>2027</strong>
            </span>
            <span
              className="auth-strategy-timeline__milestone"
              data-current="true"
            >
              <i />
              <strong>2028</strong>
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
