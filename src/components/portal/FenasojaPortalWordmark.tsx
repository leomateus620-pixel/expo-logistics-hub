const ROOT_PATHS = [
  'M560 8 C510 34 464 57 402 76 C316 102 231 119 154 157 C104 181 65 207 24 232',
  'M560 8 C534 47 505 77 462 103 C414 132 374 166 344 207 C327 230 313 250 300 266',
  'M560 8 C555 54 549 91 554 128 C559 163 573 190 568 220 C565 239 561 254 557 268',
  'M560 8 C587 46 617 75 660 101 C709 130 750 164 781 205 C799 228 813 248 824 264',
  'M560 8 C611 32 660 51 723 67 C808 88 891 108 969 143 C1027 169 1074 196 1110 225',
] as const;

const WORDMARK_LETTERS = [
  ['F', 'f'],
  ['E', 'e'],
  ['N', 'n'],
  ['A', 'a-first'],
  ['S', 's'],
] as const;

const WORDMARK_END_LETTERS = [
  ['J', 'j'],
  ['A', 'a-last'],
] as const;

function SoybeanEmblem() {
  return (
    <span className="portal-soybean" data-testid="portal-soybean" aria-hidden="true">
      <svg
        className="portal-soybean__roots"
        viewBox="0 0 1120 270"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="portal-root-halo-gold" x1="560" y1="0" x2="560" y2="270" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffbd7" />
            <stop offset="0.18" stopColor="#ffe477" />
            <stop offset="0.68" stopColor="#e6a52c" />
            <stop offset="1" stopColor="#a66312" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="portal-root-gold" x1="560" y1="0" x2="560" y2="270" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffde5" />
            <stop offset="0.16" stopColor="#fff1a1" />
            <stop offset="0.52" stopColor="#f6c64f" />
            <stop offset="0.82" stopColor="#d99220" />
            <stop offset="1" stopColor="#a65f0f" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="portal-root-taper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" />
            <stop offset="0.72" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0.08" />
          </linearGradient>
          <mask id="portal-root-taper-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1120" height="270">
            <rect width="1120" height="270" fill="url(#portal-root-taper)" />
          </mask>
          <filter id="portal-root-glow" x="-8%" y="-15%" width="116%" height="135%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <g
          className="portal-soybean__root-halo"
          data-root-layer="halo"
          fill="none"
          stroke="url(#portal-root-halo-gold)"
          strokeLinecap="round"
          mask="url(#portal-root-taper-mask)"
          filter="url(#portal-root-glow)"
        >
          {ROOT_PATHS.map((path, index) => (
            <path
              key={`halo-${path}`}
              className={`portal-soybean__root-glow portal-soybean__root-glow--${index + 1}`}
              d={path}
              pathLength="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        <g
          data-root-layer="core"
          fill="none"
          stroke="url(#portal-root-gold)"
          strokeLinecap="round"
          mask="url(#portal-root-taper-mask)"
        >
          {ROOT_PATHS.map((path, index) => (
            <path
              key={path}
              className={`portal-soybean__root portal-soybean__root--${index + 1}`}
              d={path}
              pathLength="1"
              data-portal-root={index + 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      <svg className="portal-soybean__grain" viewBox="0 0 112 126" focusable="false">
        <defs>
          <radialGradient id="portal-soybean-aura" cx="50%" cy="44%" r="52%">
            <stop offset="0" stopColor="#ffe882" stopOpacity="0.34" />
            <stop offset="0.52" stopColor="#f7b92e" stopOpacity="0.14" />
            <stop offset="1" stopColor="#f7b92e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="portal-soybean-body" cx="0" cy="0" r="1" gradientTransform="translate(31 23) rotate(55) scale(108 90)" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffef0" />
            <stop offset="0.13" stopColor="#fff39a" />
            <stop offset="0.38" stopColor="#ffd042" />
            <stop offset="0.66" stopColor="#e79514" />
            <stop offset="0.87" stopColor="#9a5208" />
            <stop offset="1" stopColor="#4f2603" />
          </radialGradient>
          <linearGradient id="portal-soybean-rim" x1="17" y1="13" x2="92" y2="115" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffbd0" />
            <stop offset="0.4" stopColor="#f3b52a" />
            <stop offset="0.78" stopColor="#a75c08" />
            <stop offset="1" stopColor="#5a2a03" />
          </linearGradient>
          <radialGradient id="portal-soybean-hilum" cx="0" cy="0" r="1" gradientTransform="translate(72 60) rotate(116) scale(23 12)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff0a0" />
            <stop offset="0.34" stopColor="#d68b11" />
            <stop offset="0.78" stopColor="#81500b" />
            <stop offset="1" stopColor="#3f2103" />
          </radialGradient>
          <linearGradient id="portal-soybean-sheen" x1="24" y1="15" x2="77" y2="87" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.9" />
            <stop offset="0.34" stopColor="#fffbd1" stopOpacity="0.44" />
            <stop offset="0.76" stopColor="#ffd857" stopOpacity="0.06" />
            <stop offset="1" stopColor="#ffd857" stopOpacity="0" />
          </linearGradient>
          <filter id="portal-soybean-shadow" x="-45%" y="-38%" width="190%" height="205%">
            <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#000814" floodOpacity="0.72" />
            <feDropShadow dx="0" dy="0" stdDeviation="4.5" floodColor="#ffd64f" floodOpacity="0.5" />
          </filter>
          <clipPath id="portal-soybean-clip">
            <path d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z" />
          </clipPath>
        </defs>

        <ellipse className="portal-soybean__aura" cx="56" cy="61" rx="55" ry="61" fill="url(#portal-soybean-aura)" />
        <ellipse cx="56" cy="114" rx="31" ry="7" fill="#071326" opacity="0.5" />
        <path
          d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z"
          fill="url(#portal-soybean-body)"
          stroke="url(#portal-soybean-rim)"
          strokeWidth="2.3"
          filter="url(#portal-soybean-shadow)"
        />
        <g clipPath="url(#portal-soybean-clip)">
          <ellipse cx="32" cy="29" rx="22" ry="36" transform="rotate(31 32 29)" fill="url(#portal-soybean-sheen)" />
          <path d="M15 76C35 101 64 108 88 95" fill="none" stroke="#ffdf60" strokeOpacity="0.35" strokeWidth="4.2" />
          <path d="M20 98C39 116 64 119 80 109" fill="none" stroke="#6d3506" strokeOpacity="0.34" strokeWidth="3" />
          <ellipse cx="85" cy="31" rx="19" ry="32" fill="#7e4005" opacity="0.16" />
          <path d="M20 59C23 36 37 16 55 11" fill="none" stroke="white" strokeLinecap="round" strokeOpacity="0.3" strokeWidth="2.2" />
        </g>
        <path
          d="M68 48c10-3 19 3 18 12-1 10-8 19-17 21-7 2-12-3-10-10 2-9 3-20 9-23Z"
          fill="url(#portal-soybean-hilum)"
          stroke="#6e3c08"
          strokeWidth="1.45"
        />
        <path d="M68 54c5-2 10 0 11 4" fill="none" stroke="#fff3ad" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="1.8" />
        <ellipse cx="30" cy="23" rx="9" ry="4.5" transform="rotate(-34 30 23)" fill="white" opacity="0.72" />
        <circle cx="24" cy="38" r="2.8" fill="#fffde3" opacity="0.74" />
      </svg>
    </span>
  );
}

function LetterGroup({ letters }: { letters: ReadonlyArray<readonly [string, string]> }) {
  return (
    <span className="portal-wordmark__letters">
      {letters.map(([letter, modifier]) => (
        <span key={modifier} className={`portal-wordmark__letter portal-wordmark__letter--${modifier}`}>
          {letter}
        </span>
      ))}
    </span>
  );
}

export function FenasojaPortalWordmark() {
  return (
    <div className="portal-identity">
      <h1 id="portal-title" className="portal-identity__title">
        <span className="sr-only">FENASOJA 2028</span>
        <span className="portal-wordmark" aria-hidden="true">
          <span className="portal-wordmark__name">
            <LetterGroup letters={WORDMARK_LETTERS} />
            <SoybeanEmblem />
            <LetterGroup letters={WORDMARK_END_LETTERS} />
          </span>
          <span className="portal-wordmark__edition">
            <span className="portal-wordmark__edition-rule" />
            <span className="portal-wordmark__year">
              {[...'2028'].map((digit, index) => (
                <span key={`${digit}-${index}`} className={`portal-wordmark__digit portal-wordmark__digit--${index + 1}`}>
                  {digit}
                </span>
              ))}
            </span>
          </span>
        </span>
      </h1>

      <div className="portal-identity__card">
        <span className="portal-identity__card-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Gestão Operacional</span>
      </div>
    </div>
  );
}
