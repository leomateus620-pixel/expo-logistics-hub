import { useEffect, useState } from 'react';

const ROOT_PATHS = [
  'M560 9 C510 35 445 58 366 78 C260 104 162 122 58 177',
  'M560 9 C527 48 491 75 449 103 C402 134 360 164 323 212',
  'M560 9 C558 54 552 91 555 128 C558 162 562 187 560 218',
  'M560 9 C593 48 629 75 671 103 C718 134 760 164 797 212',
  'M560 9 C610 35 675 58 754 78 C860 104 958 122 1062 177',
] as const;

const ROOT_NODES = [
  [58, 177],
  [323, 212],
  [560, 218],
  [797, 212],
  [1062, 177],
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

const WORLD_ROUTES = [
  {
    id: 'europa',
    path: 'M909 143 C925 118 945 102 969 96',
    destination: [969, 96],
    duration: '8.6s',
    begin: '0s',
  },
  {
    id: 'africa',
    path: 'M909 143 C936 139 956 131 981 121',
    destination: [981, 121],
    duration: '9.2s',
    begin: '2s',
  },
  {
    id: 'asia',
    path: 'M909 143 C946 128 991 109 1030 105',
    destination: [1030, 105],
    duration: '9.8s',
    begin: '4s',
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

function RootIllustrations({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <g className="portal-root-scenes" data-root-illustrations>
      <g
        className="portal-root-scene portal-root-scene--planting"
        data-root-scene="planting"
        data-root-path="1"
        clipPath="url(#portal-root-clip-planting)"
      >
        <path className="portal-root-scene__atmosphere" d="M48 174C109 127 192 105 302 87L320 119C250 165 158 187 64 190Z" />
        <g className="portal-root-field-lines">
          <path d="M48 181C121 149 203 131 306 118" />
          <path d="M56 190C137 164 218 149 310 140" />
          <path d="M93 193C162 174 232 163 307 158" />
        </g>
        <g className="portal-root-machine portal-root-machine--planter" transform="translate(154 118)">
          <circle cx="-24" cy="19" r="10" />
          <circle cx="20" cy="20" r="7" />
          <circle className="portal-root-machine__hub" cx="-24" cy="19" r="3" />
          <circle className="portal-root-machine__hub" cx="20" cy="20" r="2.4" />
          <path d="M-38 10-29-5H1L14 4 33 8 31 16H-39Z" />
          <path d="M-15-5-8-18H8L18 2" />
          <path className="portal-root-machine__highlight" d="M-29 4H2L15 9" />
          <path d="M31 11H69M38 11l8 13m4-13 7 11m5-11 6 8" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--cultivation"
        data-root-scene="cultivation"
        data-root-path="2"
        clipPath="url(#portal-root-clip-cultivation)"
      >
        <path className="portal-root-scene__atmosphere" d="M302 205C329 151 374 112 450 86L474 113C438 166 392 200 326 224Z" />
        <g className="portal-root-crop-lines">
          <path d="M315 210C351 176 394 151 454 128" />
          <path d="M329 218C368 188 408 166 456 151" />
        </g>
        <g className="portal-root-sprouts">
          <g transform="translate(362 170)">
            <path d="M0 35C2 19 1 7 5-8" />
            <path d="M4 1C-7-2-14-9-14-19 0-19 7-12 4 1Z" />
            <path d="M4 10C14 7 23 0 25-10 12-12 4-4 4 10Z" />
          </g>
          <g transform="translate(407 144) scale(.82)">
            <path d="M0 35C2 19 1 7 5-8" />
            <path d="M4 1C-7-2-14-9-14-19 0-19 7-12 4 1Z" />
            <path d="M4 10C14 7 23 0 25-10 12-12 4-4 4 10Z" />
          </g>
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--grain"
        data-root-scene="grain"
        data-root-path="3"
        clipPath="url(#portal-root-clip-grain)"
      >
        <path className="portal-root-scene__atmosphere" d="M505 88C530 76 590 76 615 90L594 139C578 165 578 190 576 224H544C542 190 542 165 526 139Z" />
        <path className="portal-root-grain-chute" d="M520 87H603L587 118H538Z" />
        <g className="portal-root-grain-flow">
          <ellipse cx="548" cy="126" rx="4.5" ry="3.3" transform="rotate(24 548 126)" />
          <ellipse cx="561" cy="130" rx="4.8" ry="3.5" transform="rotate(-18 561 130)" />
          <ellipse cx="575" cy="125" rx="4.3" ry="3.1" transform="rotate(34 575 125)" />
          <ellipse cx="554" cy="143" rx="4.5" ry="3.2" transform="rotate(-30 554 143)" />
          <ellipse cx="570" cy="147" rx="4.9" ry="3.5" transform="rotate(18 570 147)" />
          <ellipse cx="548" cy="160" rx="4.2" ry="3" transform="rotate(12 548 160)" />
          <ellipse cx="563" cy="166" rx="4.8" ry="3.4" transform="rotate(-22 563 166)" />
          <ellipse cx="576" cy="177" rx="4.4" ry="3.1" transform="rotate(28 576 177)" />
          <ellipse cx="552" cy="187" rx="4.7" ry="3.4" transform="rotate(-10 552 187)" />
          <ellipse cx="568" cy="199" rx="4.5" ry="3.2" transform="rotate(20 568 199)" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--harvest"
        data-root-scene="harvest"
        data-root-path="4"
        clipPath="url(#portal-root-clip-harvest)"
      >
        <path className="portal-root-scene__atmosphere" d="M646 91C723 115 768 151 818 209L793 226C727 202 681 168 646 116Z" />
        <g className="portal-root-harvest-lines">
          <path d="M662 131C718 151 762 177 805 216" />
          <path d="M655 152C707 169 752 193 785 224" />
        </g>
        <g className="portal-root-machine portal-root-machine--harvester" transform="translate(718 144)">
          <circle cx="-13" cy="27" r="12" />
          <circle cx="29" cy="28" r="7" />
          <circle className="portal-root-machine__hub" cx="-13" cy="27" r="3.4" />
          <circle className="portal-root-machine__hub" cx="29" cy="28" r="2.3" />
          <path d="M-36 18-29-5H13L30 8 40 18 38 23H-37Z" />
          <path d="M-16-5-8-24H11L21 5" />
          <path className="portal-root-machine__highlight" d="M-27 7H15L29 13" />
          <path d="M38 17H73L82 27H42Z" />
          <path d="M48 17v11m8-11 4 12m6-12 7 12" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--world"
        data-root-scene="world"
        data-root-path="5"
        data-testid="portal-world-map"
        clipPath="url(#portal-root-clip-world)"
      >
        <path className="portal-root-scene__atmosphere" d="M800 88C910 105 993 128 1072 174L1056 192C962 186 870 165 800 121Z" />
        <g className="portal-root-world__globe">
          <ellipse cx="940" cy="130" rx="105" ry="43" />
          <path d="M838 130C884 116 993 113 1043 131" />
          <path d="M940 89C917 108 916 151 943 172" />
        </g>
        <g className="portal-root-world__continents">
          <path d="M836 106 850 96 871 97 885 105 879 114 866 116 859 127 847 123 842 114Z" />
          <path d="M875 128 888 127 896 138 893 151 885 163 878 154 875 142 870 134Z" />
          <path d="M920 101 937 94 961 99 978 108 1001 108 1027 120 1015 131 993 128 979 137 964 131 949 136 936 124 920 119 912 109Z" />
          <path d="M956 143 971 139 986 148 981 160 963 163 950 153Z" />
        </g>
        <g className="portal-root-world__routes">
          {WORLD_ROUTES.map((route) => (
            <path key={route.id} d={route.path} pathLength="1" />
          ))}
        </g>
        <g className="portal-root-world__brazil">
          <circle cx="909" cy="143" r="12" />
          <path d="M903 134 912 134 917 141 914 150 908 155 902 150 899 142Z" />
        </g>
        {WORLD_ROUTES.map((route, index) => (
          <g
            key={route.id}
            className={`portal-root-world__soybean portal-root-world__soybean--${index + 1}`}
            data-world-soybean={route.id}
            opacity={reducedMotion ? 1 : 0}
            transform={reducedMotion
              ? `translate(${route.destination[0]} ${route.destination[1]})`
              : undefined}
          >
            <path d="M-3.8-.9C-3.1-3.8.9-4.8 3.2-2.6 5.4-.3 3.6 3.6.5 4.1-2.7 4.5-4.6 2-3.8-.9Z" />
            {!reducedMotion && (
              <>
                <animateMotion
                  path={route.path}
                  dur={route.duration}
                  begin={route.begin}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.16;0.82;1"
                  dur={route.duration}
                  begin={route.begin}
                  repeatCount="indefinite"
                />
              </>
            )}
          </g>
        ))}
      </g>
    </g>
  );
}

function SoybeanEmblem() {
  const reducedMotion = useReducedMotionPreference();

  return (
    <span className="portal-soybean" data-testid="portal-soybean" aria-hidden="true">
      <svg
        className="portal-soybean__roots"
        viewBox="0 0 1120 230"
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
          <linearGradient id="portal-root-scene-sky" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#164f7a" stopOpacity="0.16" />
            <stop offset="0.45" stopColor="#1882a0" stopOpacity="0.54" />
            <stop offset="1" stopColor="#f0b83e" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id="portal-root-scene-soil" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#bf7a24" stopOpacity="0.08" />
            <stop offset="0.5" stopColor="#f0c35d" stopOpacity="0.7" />
            <stop offset="1" stopColor="#6bb67d" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="portal-root-scene-green" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#b8e982" />
            <stop offset="0.5" stopColor="#43a66e" />
            <stop offset="1" stopColor="#155e4a" />
          </linearGradient>
          <linearGradient id="portal-root-scene-machine" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b7df70" />
            <stop offset="0.48" stopColor="#4f9a55" />
            <stop offset="1" stopColor="#1f6749" />
          </linearGradient>
          <linearGradient id="portal-root-scene-grain" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#fff4a8" />
            <stop offset="0.5" stopColor="#eab33b" />
            <stop offset="1" stopColor="#9f5c14" />
          </linearGradient>
          <radialGradient id="portal-root-world-origin" cx="50%" cy="50%" r="50%">
            <stop stopColor="#fffbd0" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="#ffd75d" stopOpacity="0.58" />
            <stop offset="1" stopColor="#d48b18" stopOpacity="0" />
          </radialGradient>
          <filter id="portal-root-scene-glow" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="1.8" result="sceneBlur" />
            <feMerge>
              <feMergeNode in="sceneBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="portal-root-clip-planting">
            <path d="M48 174C109 127 192 105 302 87L320 119C250 165 158 187 64 190Z" />
          </clipPath>
          <clipPath id="portal-root-clip-cultivation">
            <path d="M302 205C329 151 374 112 450 86L474 113C438 166 392 200 326 224Z" />
          </clipPath>
          <clipPath id="portal-root-clip-grain">
            <path d="M505 88C530 76 590 76 615 90L594 139C578 165 578 190 576 224H544C542 190 542 165 526 139Z" />
          </clipPath>
          <clipPath id="portal-root-clip-harvest">
            <path d="M646 91C723 115 768 151 818 209L793 226C727 202 681 168 646 116Z" />
          </clipPath>
          <clipPath id="portal-root-clip-world">
            <path d="M800 88C910 105 993 128 1072 174L1056 192C962 186 870 165 800 121Z" />
          </clipPath>
        </defs>
        <RootIllustrations reducedMotion={reducedMotion} />
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
