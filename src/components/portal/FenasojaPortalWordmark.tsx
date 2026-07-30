const ROOT_PATHS = [
  'M560 9 C514 35 472 58 414 74 C332 97 250 110 178 148 C131 173 92 199 47 220',
  'M560 9 C536 50 512 78 470 104 C424 132 379 158 350 205 C338 224 330 242 316 260',
  'M560 9 C556 57 548 94 553 132 C558 168 576 193 570 224 C567 241 560 252 554 264',
  'M560 9 C585 48 615 76 658 101 C708 131 750 160 780 205 C794 226 801 243 814 258',
  'M560 9 C608 33 657 50 717 62 C797 79 873 99 944 132 C1004 160 1042 190 1080 215',
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
          <linearGradient id="portal-root-gold" x1="560" y1="0" x2="560" y2="270" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff8bf" />
            <stop offset="0.24" stopColor="#ffe36f" />
            <stop offset="0.7" stopColor="#eeb638" />
            <stop offset="1" stopColor="#a96512" stopOpacity="0.42" />
          </linearGradient>
          <filter id="portal-root-glow" x="-15%" y="-20%" width="130%" height="150%">
            <feGaussianBlur stdDeviation="3.2" result="rootBlur" />
            <feMerge>
              <feMergeNode in="rootBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g fill="none" stroke="url(#portal-root-gold)" strokeLinecap="round" filter="url(#portal-root-glow)">
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
          <radialGradient id="portal-soybean-body" cx="0" cy="0" r="1" gradientTransform="translate(33 26) rotate(55) scale(104 88)" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffbd2" />
            <stop offset="0.19" stopColor="#ffe76d" />
            <stop offset="0.48" stopColor="#f3bd2e" />
            <stop offset="0.76" stopColor="#c87a0c" />
            <stop offset="1" stopColor="#693706" />
          </radialGradient>
          <linearGradient id="portal-soybean-rim" x1="18" y1="15" x2="91" y2="113" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff6a1" />
            <stop offset="0.4" stopColor="#e99d17" />
            <stop offset="1" stopColor="#6d3907" />
          </linearGradient>
          <radialGradient id="portal-soybean-hilum" cx="0" cy="0" r="1" gradientTransform="translate(75 63) rotate(117) scale(22 12)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff5a1" />
            <stop offset="0.36" stopColor="#d18a12" />
            <stop offset="1" stopColor="#704007" />
          </radialGradient>
          <linearGradient id="portal-soybean-sheen" x1="27" y1="18" x2="76" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.94" />
            <stop offset="0.48" stopColor="#fff8bf" stopOpacity="0.38" />
            <stop offset="1" stopColor="#ffd94d" stopOpacity="0" />
          </linearGradient>
          <filter id="portal-soybean-shadow" x="-45%" y="-38%" width="190%" height="205%">
            <feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#000814" floodOpacity="0.72" />
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ffd64f" floodOpacity="0.58" />
          </filter>
          <clipPath id="portal-soybean-clip">
            <path d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z" />
          </clipPath>
        </defs>

        <ellipse cx="56" cy="114" rx="31" ry="7" fill="#071326" opacity="0.52" />
        <path
          d="M55 5C78 5 97 20 102 42c4 17-1 31-12 45-6 8-8 14-7 20 1 7-7 13-16 16-17 6-36 1-47-12C8 97 4 80 8 61 13 34 32 4 55 5Z"
          fill="url(#portal-soybean-body)"
          stroke="url(#portal-soybean-rim)"
          strokeWidth="2.4"
          filter="url(#portal-soybean-shadow)"
        />
        <g clipPath="url(#portal-soybean-clip)">
          <ellipse cx="34" cy="31" rx="24" ry="37" transform="rotate(31 34 31)" fill="url(#portal-soybean-sheen)" />
          <path d="M13 75C34 103 65 110 88 96" fill="none" stroke="#ffdf60" strokeOpacity="0.33" strokeWidth="4.5" />
          <path d="M20 98C38 116 64 119 79 110" fill="none" stroke="#743b08" strokeOpacity="0.32" strokeWidth="3" />
          <ellipse cx="84" cy="30" rx="19" ry="31" fill="#8e4d08" opacity="0.15" />
        </g>
        <path
          d="M68 48c10-3 19 3 18 12-1 10-8 19-17 21-7 2-12-3-10-10 2-9 3-20 9-23Z"
          fill="url(#portal-soybean-hilum)"
          stroke="#7a470c"
          strokeWidth="1.5"
        />
        <path d="M68 54c5-2 10 0 11 4" fill="none" stroke="#fff2a0" strokeLinecap="round" strokeOpacity="0.68" strokeWidth="2" />
        <ellipse cx="31" cy="24" rx="10" ry="5" transform="rotate(-34 31 24)" fill="white" opacity="0.74" />
        <circle cx="24" cy="38" r="3.2" fill="#fffbd3" opacity="0.8" />
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
