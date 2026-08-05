import { Factory, MapPinned, Tractor } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import type { CommissionMapPortalConfig } from '@/modules/commissions/commissionMapPortalRegistry';

interface CommissionMapLoginHeroProps {
  portal: CommissionMapPortalConfig;
}

function ExporuralTitle() {
  return (
    <h1
      id="login-hero-title"
      className="commission-login-title commission-login-title--exporural"
      aria-label="Exporural"
    >
      <span className="commission-login-title__expo">Expo</span>
      <span className="commission-login-title__rural">
        <span className="commission-login-title__harvest" aria-hidden="true">
          <picture>
            <source srcSet="/commissions/exporural-harvester.webp" type="image/webp" />
            <img
              src="/commissions/exporural-harvester.webp"
              alt=""
              decoding="async"
            />
          </picture>
        </span>
        <span className="commission-login-title__letters">rural</span>
      </span>
    </h1>
  );
}

function IndustryTitle() {
  return (
    <div className="commission-login-industry-lockup">
      <div className="commission-login-industry-structure" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <h1 id="login-hero-title" className="commission-login-title commission-login-title--industry">
        <span>Indústria,</span>
        <span>Comércio <em>e</em> Serviços</span>
      </h1>
    </div>
  );
}

export function CommissionMapLoginHero({ portal }: CommissionMapLoginHeroProps) {
  const isRural = portal.theme === 'rural';
  const ContextIcon = isRural ? Tractor : Factory;

  return (
    <section
      className="auth-hero auth-hero--commission-map"
      data-commission-theme={portal.theme}
      aria-labelledby="login-hero-title"
    >
      <FenasojaBrand
        className="auth-hero__brand"
        scale="display"
        subtitle="Gestão comercial por comissão"
        tone="dark"
      />

      <div className="commission-login-identity">
        <p className="commission-login-eyebrow">
          <ContextIcon aria-hidden="true" />
          Comissão Fenasoja 2028
        </p>

        {isRural ? <ExporuralTitle /> : <IndustryTitle />}

        <div className="commission-login-scope">
          <MapPinned aria-hidden="true" />
          <span>
            <strong>Mapa Comercial</strong>
            Segmento exclusivo e acesso protegido
          </span>
        </div>
      </div>
    </section>
  );
}
