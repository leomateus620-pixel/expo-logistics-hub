import { MapPinned } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

export function CommercialMapLoginHero() {
  return (
    <section className="auth-hero auth-hero--commercial-map" aria-labelledby="login-hero-title">
      <FenasojaBrand
        className="auth-hero__brand"
        scale="display"
        subtitle="Gestão comercial do parque"
        tone="dark"
      />

      <div className="commercial-map-login__identity">
        <p className="commercial-map-login__eyebrow">
          <MapPinned aria-hidden="true" />
          Parque Fenasoja 2028
        </p>
        <h1 id="login-hero-title" className="commercial-map-login__title">
          Mapa
          <span>Comercial</span>
        </h1>
        <p className="commercial-map-login__description">
          Gestão visual dos espaços, lotes e disponibilidade do parque.
        </p>
      </div>
    </section>
  );
}
