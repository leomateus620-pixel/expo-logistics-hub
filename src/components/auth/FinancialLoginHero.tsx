import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

export function FinancialLoginHero() {
  return (
    <section
      className="auth-hero auth-hero--financial"
      aria-labelledby="login-hero-title"
    >
      <FenasojaBrand
        className="auth-hero__brand financial-login__brand"
        scale="display"
        tone="dark"
      />

      <div className="financial-login__identity">
        <h1
          id="login-hero-title"
          className="financial-login__title"
          aria-label="Financeiro"
        >
          <span className="financial-login__title-lead" aria-hidden="true">FINAN</span>
          <span className="financial-login__title-tail" aria-hidden="true">CEIRO</span>
        </h1>

        <div className="financial-login__title-ledger" aria-hidden="true">
          <span />
          <i />
          <i />
          <i />
          <strong />
        </div>

        <p className="financial-login__description">Gestão financeira institucional</p>
      </div>

      <div className="financial-login__signature" aria-hidden="true">
        <div className="financial-login__legend">
          <span data-flow="revenue">Receita</span>
          <span data-flow="expense">Despesa</span>
          <span data-flow="budget">Orçamento</span>
          <span data-flow="balance">Saldo</span>
        </div>

        <svg
          className="financial-login__flow"
          viewBox="0 0 720 164"
          preserveAspectRatio="none"
          focusable="false"
        >
          <g className="financial-login__flow-grid">
            <path d="M16 31H704" />
            <path d="M16 81H704" />
            <path d="M16 131H704" />
            <path d="M90 16V148" />
            <path d="M250 16V148" />
            <path d="M410 16V148" />
            <path d="M570 16V148" />
          </g>

          <g className="financial-login__bars">
            <rect data-tone="revenue" x="74" y="111" width="8" height="27" rx="2" />
            <rect data-tone="expense" x="86" y="119" width="8" height="19" rx="2" />
            <rect data-tone="revenue" x="234" y="92" width="8" height="46" rx="2" />
            <rect data-tone="expense" x="246" y="105" width="8" height="33" rx="2" />
            <rect data-tone="revenue" x="394" y="76" width="8" height="62" rx="2" />
            <rect data-tone="expense" x="406" y="94" width="8" height="44" rx="2" />
          </g>

          <path
            className="financial-login__trajectory financial-login__trajectory--revenue"
            pathLength="1"
            d="M18 132C92 130 126 119 180 112C264 100 300 82 364 84C452 87 493 63 548 67C596 70 622 60 652 54"
          />
          <path
            className="financial-login__trajectory financial-login__trajectory--expense"
            pathLength="1"
            d="M18 56C90 59 122 73 181 71C257 69 302 96 365 92C440 87 487 80 548 76C596 73 622 62 652 54"
          />

          <g className="financial-login__balance-point">
            <circle cx="652" cy="54" r="13" />
            <circle cx="652" cy="54" r="3.5" />
            <path d="M652 35V24M671 54H686" />
          </g>
        </svg>
      </div>
    </section>
  );
}
