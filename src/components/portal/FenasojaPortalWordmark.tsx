import { useEffect, useState } from 'react';

const ROOT_PATHS = [
  'M560 9 C514 35 472 58 414 74 C332 97 250 110 178 148 C131 173 92 199 47 220',
  'M560 9 C536 50 512 78 470 104 C424 132 379 158 350 205 C338 224 330 242 316 260',
  'M560 9 C556 57 548 94 553 132 C558 168 576 193 570 224 C567 241 560 252 554 264',
  'M560 9 C585 48 615 76 658 101 C708 131 750 160 780 205 C794 226 801 243 814 258',
  'M560 9 C608 33 657 50 717 62 C797 79 873 99 944 132 C1004 160 1042 190 1080 215',
] as const;

const ROOT_NODES = [
  [47, 220],
  [316, 260],
  [554, 264],
  [814, 258],
  [1080, 215],
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

const AGRICULTURAL_SCENES = [
  {
    id: 'plantio',
    eyebrow: 'Plantio de precisão',
    title: 'Onde o futuro cria raízes',
    image: '/portal/fenasoja-plantio-premium.webp',
  },
  {
    id: 'colheita',
    eyebrow: 'Colheita em escala',
    title: 'A força que move o Brasil',
    image: '/portal/fenasoja-colheita-premium.webp',
  },
  {
    id: 'abundancia',
    eyebrow: 'Grão em movimento',
    title: 'Valor que segue para o mundo',
    image: '/portal/fenasoja-abundancia-premium.webp',
  },
] as const;

const WORLD_ROUTES = [
  {
    id: 'europa',
    path: 'M101 95 C111 68 128 49 151 40',
    destination: [151, 40],
    duration: '7.8s',
    begin: '0s',
  },
  {
    id: 'africa',
    path: 'M101 95 C126 86 151 69 181 58',
    destination: [181, 58],
    duration: '8.4s',
    begin: '1.6s',
  },
  {
    id: 'asia',
    path: 'M101 95 C149 93 204 76 248 56',
    destination: [248, 56],
    duration: '9s',
    begin: '3.2s',
  },
] as const;

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  );

  useEffect(() => {
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!motionQuery) return undefined;

    const syncPreference = () => setReducedMotion(motionQuery.matches);
    syncPreference();
    motionQuery.addEventListener?.('change', syncPreference);
    return () => motionQuery.removeEventListener?.('change', syncPreference);
  }, []);

  return reducedMotion;
}

function AgriculturalScene({
  id,
  eyebrow,
  title,
  image,
}: (typeof AGRICULTURAL_SCENES)[number]) {
  return (
    <article
      className={`portal-story__node portal-story__node--${id}`}
      data-portal-scene={id}
    >
      <img src={image} alt="" loading="lazy" decoding="async" />
      <span className="portal-story__node-light" aria-hidden="true" />
      <span className="portal-story__node-copy">
        <span className="portal-story__node-eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </span>
    </article>
  );
}

function WorldSupplyMap() {
  const reducedMotion = useReducedMotionPreference();

  return (
    <article
      className="portal-story__node portal-story__node--world"
      data-testid="portal-world-map"
      aria-label="O Brasil abastece o mundo: três grãos de soja partem do Brasil para diferentes continentes."
    >
      <span className="portal-story__node-copy portal-story__node-copy--world">
        <span className="portal-story__node-eyebrow">Brasil → mundo</span>
        <strong>Soja que abastece continentes</strong>
      </span>

      <svg
        className="portal-world"
        viewBox="0 0 300 150"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="portal-world-origin" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff9bc" />
            <stop offset="0.34" stopColor="#ffd75d" />
            <stop offset="1" stopColor="#d48b18" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="portal-world-soy" x1="-5" y1="-4" x2="5" y2="4">
            <stop stopColor="#fff6ad" />
            <stop offset="0.45" stopColor="#f4bd37" />
            <stop offset="1" stopColor="#9b570b" />
          </linearGradient>
          <filter id="portal-world-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="portal-world__continents">
          <path d="M19 38 31 25 54 20 72 27 85 24 98 33 90 45 79 50 72 62 60 67 52 60 42 60 37 51 25 48Z" />
          <path d="M83 72 98 69 111 77 118 91 113 105 108 119 99 137 91 128 88 112 83 99 76 87Z" />
          <path d="M135 34 145 29 160 32 165 39 157 44 148 42 142 48 134 43Z" />
          <path d="M143 51 161 47 177 58 174 78 164 99 153 111 144 96 135 80 136 64Z" />
          <path d="M164 32 190 25 221 29 238 38 265 43 277 56 265 66 244 64 231 74 215 67 202 72 188 61 174 55 166 44Z" />
          <path d="M231 100 247 95 268 104 271 117 255 126 237 121 225 110Z" />
        </g>

        <g className="portal-world__routes">
          {WORLD_ROUTES.map((route) => (
            <path key={route.id} d={route.path} pathLength="1" />
          ))}
        </g>

        <g className="portal-world__brazil">
          <circle cx="101" cy="94" r="18" fill="url(#portal-world-origin)" />
          <path d="M94 81 105 81 112 89 109 100 101 108 94 102 89 92Z" />
          <circle cx="101" cy="94" r="3.4" />
        </g>

        {WORLD_ROUTES.map((route, index) => (
          <g
            key={route.id}
            className={`portal-world__soybean portal-world__soybean--${index + 1}`}
            data-world-soybean={route.id}
            opacity={reducedMotion ? 1 : 0}
            transform={reducedMotion
              ? `translate(${route.destination[0]} ${route.destination[1]})`
              : undefined}
          >
            <path d="M-5-1.2C-4.1-5.2 1.2-6.5 4.2-3.4 7.1-.4 4.7 4.8.7 5.4-3.6 6-6.1 2.7-5-1.2Z" />
            <path className="portal-world__soybean-sheen" d="M-2.9-2.3C-1.4-4 1.1-4.4 2.6-3.2" />
            {!reducedMotion && (
              <>
                <animateMotion
                  path={route.path}
                  dur={route.duration}
                  begin={route.begin}
                  repeatCount="indefinite"
                  rotate="auto"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.12;0.84;1"
                  dur={route.duration}
                  begin={route.begin}
                  repeatCount="indefinite"
                />
              </>
            )}
          </g>
        ))}
      </svg>
    </article>
  );
}

function PortalAgricultureStory() {
  return (
    <div
      className="portal-story"
      role="group"
      aria-label="Da precisão no plantio à colheita em escala, a soja brasileira gera valor e abastece o mundo."
    >
      <span className="portal-story__kicker">Da terra para o mundo</span>
      <div className="portal-story__grid">
        {AGRICULTURAL_SCENES.map((scene) => (
          <AgriculturalScene key={scene.id} {...scene} />
        ))}
        <WorldSupplyMap />
      </div>
    </div>
  );
}

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
        <g className="portal-soybean__root-nodes" aria-hidden="true">
          {ROOT_NODES.map(([cx, cy], index) => (
            <circle
              key={`${cx}-${cy}`}
              className={`portal-soybean__root-node portal-soybean__root-node--${index + 1}`}
              cx={cx}
              cy={cy}
              r="4.5"
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

      <PortalAgricultureStory />

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
