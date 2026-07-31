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

const ROOT_ZONE_PATHS = {
  planting:
    'M560 9 C510 35 445 58 366 78 C260 104 162 122 58 177 C124 195 220 207 323 212 C360 164 402 134 449 103 C491 75 527 48 560 9 Z',
  cultivation:
    'M560 9 C527 48 491 75 449 103 C402 134 360 164 323 212 C400 226 488 229 560 218 C562 187 558 162 555 128 C552 91 558 54 560 9 Z',
  harvest:
    'M560 9 C558 54 552 91 555 128 C558 162 562 187 560 218 C632 229 720 226 797 212 C760 164 718 134 671 103 C629 75 593 48 560 9 Z',
  world:
    'M560 9 C593 48 629 75 671 103 C718 134 760 164 797 212 C900 207 996 195 1062 177 C958 122 860 104 754 78 C675 58 610 35 560 9 Z',
} as const;

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
    path: 'M850 169 C861 149 879 132 903 126',
    destination: [903, 126],
    duration: '8.6s',
    begin: '0s',
  },
  {
    id: 'africa',
    path: 'M850 169 C872 166 894 158 915 151',
    destination: [915, 151],
    duration: '9.2s',
    begin: '2s',
  },
  {
    id: 'asia',
    path: 'M850 169 C888 151 931 138 969 142',
    destination: [969, 142],
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
        data-root-between="1-2"
        clipPath="url(#portal-root-zone-planting)"
      >
        <path className="portal-root-scene__base portal-root-scene__base--planting" d={ROOT_ZONE_PATHS.planting} />
        <path
          className="portal-root-scene__sky-band portal-root-scene__sky-band--planting"
          d="M62 177C164 132 283 104 451 76L479 105C335 139 197 177 72 200Z"
        />
        <ellipse className="portal-root-scene__sun" cx="379" cy="98" rx="30" ry="16" />
        <ellipse className="portal-root-scene__dust" cx="214" cy="172" rx="106" ry="27" />
        <path className="portal-root-scene__horizon" d="M71 178C172 143 290 118 436 96" />
        <path
          className="portal-root-terrain portal-root-terrain--planting"
          d="M56 179C163 150 282 124 425 102L376 180 323 212C221 207 127 195 56 179Z"
        />
        <g className="portal-root-field portal-root-field--planting">
          <path d="M57 186C145 160 247 141 400 122" />
          <path d="M69 198C171 177 270 163 378 151" />
          <path d="M115 207C198 190 279 180 354 174" />
          <path d="M170 212C234 201 290 197 337 194" />
        </g>
        <g className="portal-root-precision portal-root-scene__micro">
          <path d="M199 130C214 116 240 112 259 125" />
          <path d="M205 136C219 125 238 123 252 132" />
          <circle cx="228" cy="137" r="2.4" />
        </g>
        <g className="portal-root-machine portal-root-machine--planter" transform="translate(226 143)">
          <ellipse className="portal-root-machine__shadow" cx="-17" cy="34" rx="63" ry="9" />
          <circle className="portal-root-machine__tyre" cx="-28" cy="24" r="15" />
          <circle className="portal-root-machine__tyre" cx="27" cy="25" r="10" />
          <circle className="portal-root-machine__hub" cx="-28" cy="24" r="5" />
          <circle className="portal-root-machine__hub" cx="27" cy="25" r="3.5" />
          <path className="portal-root-machine__body" d="M-49 15-39-10H8L25 1 43 6 40 18H-50Z" />
          <path className="portal-root-machine__cab" d="M-23-10-13-31H8L22 2H-27Z" />
          <path className="portal-root-machine__glass" d="M-10-27H5L15-7H-18Z" />
          <path className="portal-root-machine__panel" d="M-40 2H5L24 9H-44Z" />
          <path className="portal-root-machine__accent" d="M-42 7H13L28 11" />
          <path className="portal-root-machine__shine" d="M-34-5H4L16 2M-8-24 3-23" />
          <path className="portal-root-machine__metal" d="M-18-31V-39M-21-39H-14" />
          <g className="portal-root-planter-implement">
            <path d="M-47 9H-91L-111 18" />
            <path d="M-91 9V20H-114" />
            <path d="M-106 17-101 31m17-18 3 16m16-18 2 15" />
            <circle cx="-101" cy="31" r="3.5" />
            <circle cx="-81" cy="29" r="3.2" />
            <circle cx="-62" cy="27" r="3" />
          </g>
        </g>
        <g className="portal-root-seed-trail portal-root-scene__micro">
          <circle cx="112" cy="187" r="1.8" />
          <circle cx="130" cy="184" r="1.6" />
          <circle cx="148" cy="180" r="1.4" />
          <circle cx="166" cy="176" r="1.2" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--cultivation"
        data-root-scene="cultivation"
        data-root-between="2-3"
        clipPath="url(#portal-root-zone-cultivation)"
      >
        <path
          className="portal-root-scene__base portal-root-scene__base--cultivation"
          d={ROOT_ZONE_PATHS.cultivation}
        />
        <path
          className="portal-root-scene__sky-band portal-root-scene__sky-band--cultivation"
          d="M325 213C364 158 416 116 497 79L559 70L559 130C505 162 440 196 337 225Z"
        />
        <path className="portal-root-scene__horizon" d="M335 202C392 166 456 139 548 113" />
        <path
          className="portal-root-terrain portal-root-terrain--cultivation"
          d="M326 205C400 175 472 145 552 123L559 199 560 218C486 229 397 226 326 212Z"
        />
        <g className="portal-root-field portal-root-field--cultivation">
          <path d="M328 211C394 183 459 163 552 145" />
          <path d="M348 222C417 202 484 188 558 177" />
          <path d="M397 228C452 215 508 207 560 202" />
        </g>
        <g className="portal-root-crop-canopy portal-root-scene__micro">
          <ellipse cx="367" cy="194" rx="13" ry="5" transform="rotate(-26 367 194)" />
          <ellipse cx="385" cy="188" rx="12" ry="5" transform="rotate(22 385 188)" />
          <ellipse cx="421" cy="173" rx="11" ry="4.6" transform="rotate(-22 421 173)" />
          <ellipse cx="443" cy="163" rx="12" ry="4.8" transform="rotate(25 443 163)" />
          <ellipse cx="505" cy="151" rx="10" ry="4.2" transform="rotate(-18 505 151)" />
          <ellipse cx="532" cy="142" rx="9" ry="3.8" transform="rotate(24 532 142)" />
        </g>
        <g className="portal-root-drone portal-root-scene__micro" transform="translate(493 115)">
          <path d="M-20 0H20M0-6V8M-12-4 0 2 12-4" />
          <ellipse cx="0" cy="1" rx="8" ry="4" />
          <path d="M-25-3H-13M13-3H25" />
          <circle cx="-26" cy="-3" r="4" />
          <circle cx="26" cy="-3" r="4" />
          <path className="portal-root-drone__beam" d="M-7 7-19 48M7 7l19 42" />
        </g>
        <g className="portal-root-sprouts">
          <g transform="translate(405 178) scale(.82)">
            <path className="portal-root-sprout__stem" d="M0 38C2 21 3 6 8-13" />
            <path d="M7-2C-10-3-19-12-20-27-3-29 9-19 7-2Z" />
            <path d="M6 9C20 7 31-2 35-16 18-19 6-8 6 9Z" />
            <path d="M3 20C-10 19-19 12-22 1-8-2 2 6 3 20Z" />
          </g>
          <g transform="translate(470 156)">
            <path className="portal-root-sprout__stem" d="M0 54C2 31 3 8 9-17" />
            <path d="M8-5C-13-6-25-17-26-35-5-38 10-25 8-5Z" />
            <path d="M7 9C26 7 39-5 44-23 22-26 7-12 7 9Z" />
            <path d="M4 25C-13 24-25 14-28 0-10-4 3 6 4 25Z" />
            <path d="M3 38C17 36 28 29 33 17 17 13 4 22 3 38Z" />
          </g>
          <g transform="translate(529 170) scale(.72)">
            <path className="portal-root-sprout__stem" d="M0 43C2 24 3 8 8-12" />
            <path d="M7-2C-10-3-20-12-21-27-3-30 9-19 7-2Z" />
            <path d="M6 11C21 8 32-2 36-17 18-19 6-8 6 11Z" />
          </g>
        </g>
        <g className="portal-root-pods portal-root-scene__micro">
          <path d="M430 182c8-6 18 1 16 9-3 8-14 10-20 4-5-5-2-10 4-13Z" />
          <path d="M501 188c8-6 18 1 16 9-3 8-14 10-20 4-5-5-2-10 4-13Z" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--harvest"
        data-root-scene="harvest-grain"
        data-root-between="3-4"
        clipPath="url(#portal-root-zone-harvest)"
      >
        <path className="portal-root-scene__base portal-root-scene__base--harvest" d={ROOT_ZONE_PATHS.harvest} />
        <path
          className="portal-root-scene__sky-band portal-root-scene__sky-band--harvest"
          d="M559 77C636 103 704 139 791 214L782 226C697 209 626 187 561 161Z"
        />
        <ellipse className="portal-root-scene__sun portal-root-scene__sun--harvest" cx="605" cy="103" rx="29" ry="17" />
        <ellipse
          className="portal-root-scene__dust portal-root-scene__dust--harvest"
          cx="649"
          cy="184"
          rx="99"
          ry="28"
        />
        <path className="portal-root-scene__horizon" d="M563 136C626 151 693 177 778 217" />
        <path
          className="portal-root-terrain portal-root-terrain--harvest"
          d="M560 139C632 156 704 182 783 218L797 212C760 164 718 134 671 103L560 139Z"
        />
        <g className="portal-root-field portal-root-field--harvest">
          <path d="M561 152C627 169 699 192 779 222" />
          <path d="M562 175C635 191 698 208 757 225" />
          <path d="M565 198C624 210 680 219 722 227" />
        </g>
        <g className="portal-root-soy-stalks portal-root-scene__micro">
          <path d="M714 188v25m0-18-7-8m7 14 9-9M735 199v19m0-13-6-7m6 12 8-7M759 208v14m0-9-5-5" />
          <circle cx="707" cy="187" r="2.2" />
          <circle cx="723" cy="191" r="2.1" />
          <circle cx="729" cy="197" r="1.9" />
          <circle cx="743" cy="202" r="1.8" />
        </g>
        <g className="portal-root-machine portal-root-machine--harvester" transform="translate(628 145)">
          <ellipse className="portal-root-machine__shadow" cx="-7" cy="42" rx="69" ry="10" />
          <circle className="portal-root-machine__tyre" cx="-27" cy="31" r="17" />
          <circle className="portal-root-machine__tyre" cx="35" cy="32" r="10" />
          <circle className="portal-root-machine__hub" cx="-27" cy="31" r="5.5" />
          <circle className="portal-root-machine__hub" cx="35" cy="32" r="3.5" />
          <path className="portal-root-machine__body" d="M-54 20-44-15H14L37 1 48 19 44 25H-55Z" />
          <path className="portal-root-machine__cab" d="M-20-15-10-43H16L31-4 15 2H-25Z" />
          <path className="portal-root-machine__glass" d="M-7-38H12L23-9H-16Z" />
          <path className="portal-root-machine__panel" d="M-43-4H18L34 7H-47Z" />
          <path className="portal-root-machine__accent" d="M-46 4H23L37 11" />
          <path className="portal-root-machine__shine" d="M-36-9H11L25-1M-5-35 10-34" />
          <path className="portal-root-machine__metal" d="M-34-15-46-28M-46-28H-24" />
          <g className="portal-root-harvester-header">
            <path d="M42 15H88L103 31H46Z" />
            <path d="M51 16v15m11-15 3 16m9-16 7 17m5-16 11 14" />
            <path d="M43 31H108" />
          </g>
          <path className="portal-root-harvester-auger" d="M8-9 62-27 74-21 23 1Z" />
        </g>
        <g className="portal-root-grain-flow">
          <ellipse cx="698" cy="130" rx="3.7" ry="2.6" transform="rotate(24 698 130)" />
          <ellipse cx="704" cy="139" rx="3.9" ry="2.8" transform="rotate(-18 704 139)" />
          <ellipse cx="699" cy="149" rx="3.5" ry="2.5" transform="rotate(34 699 149)" />
          <ellipse cx="708" cy="158" rx="4" ry="2.8" transform="rotate(-30 708 158)" />
          <ellipse cx="705" cy="170" rx="3.7" ry="2.6" transform="rotate(18 705 170)" />
          <ellipse cx="713" cy="181" rx="4.1" ry="2.9" transform="rotate(-22 713 181)" />
          <ellipse cx="708" cy="193" rx="3.8" ry="2.7" transform="rotate(28 708 193)" />
          <ellipse cx="718" cy="202" rx="4" ry="2.8" transform="rotate(-10 718 202)" />
          <path className="portal-root-grain-flow__ribbon" d="M696 126C706 151 705 181 719 207" />
        </g>
      </g>

      <g
        className="portal-root-scene portal-root-scene--world"
        data-root-scene="world"
        data-root-between="4-5"
        data-testid="portal-world-map"
        clipPath="url(#portal-root-zone-world)"
      >
        <path className="portal-root-scene__base portal-root-scene__base--world" d={ROOT_ZONE_PATHS.world} />
        <path
          className="portal-root-scene__sky-band portal-root-scene__sky-band--world"
          d="M648 76C792 94 937 125 1068 175L1058 203C934 208 828 195 746 166Z"
        />
        <ellipse className="portal-root-world__aura" cx="897" cy="158" rx="147" ry="60" />
        <g className="portal-root-world__globe">
          <ellipse cx="897" cy="158" rx="132" ry="48" />
          <path d="M770 158C824 144 959 143 1025 159" />
          <path d="M897 110C870 132 869 179 898 206" />
          <path d="M811 122C836 143 837 181 817 195" />
          <path d="M981 122C956 143 955 181 975 195" />
        </g>
        <g className="portal-root-world__continents">
          <path d="M783 135 798 124 821 126 836 136 829 145 816 147 807 157 794 153 790 145Z" />
          <path d="M833 154 847 153 858 164 855 178 848 192 840 181 836 168 828 160Z" />
          <path d="M876 130 893 123 916 128 930 137 952 135 981 147 970 158 946 155 934 165 919 158 904 166 891 153 876 149 868 139Z" />
          <path d="M922 175 938 169 955 177 950 190 932 194 917 184Z" />
          <path d="M982 174 997 171 1009 180 1002 188 986 187Z" />
        </g>
        <g className="portal-root-world__routes">
          {WORLD_ROUTES.map((route) => (
            <path key={route.id} d={route.path} pathLength="1" />
          ))}
        </g>
        <g className="portal-root-world__brazil">
          <circle cx="850" cy="169" r="16" />
          <path d="M843 158 853 157 860 165 857 175 851 183 844 178 840 168Z" />
        </g>
        <g className="portal-root-world__destinations portal-root-scene__micro">
          {WORLD_ROUTES.map((route) => (
            <circle key={route.id} cx={route.destination[0]} cy={route.destination[1]} r="2.4" />
          ))}
        </g>
        {WORLD_ROUTES.map((route, index) => (
          <g
            key={route.id}
            className={`portal-root-world__soybean portal-root-world__soybean--${index + 1}`}
            data-world-soybean={route.id}
            opacity={reducedMotion ? 1 : 0}
            transform={reducedMotion ? `translate(${route.destination[0]} ${route.destination[1]})` : undefined}
          >
            <path d="M-3.8-.9C-3.1-3.8.9-4.8 3.2-2.6 5.4-.3 3.6 3.6.5 4.1-2.7 4.5-4.6 2-3.8-.9Z" />
            {!reducedMotion && (
              <>
                <animateMotion path={route.path} dur={route.duration} begin={route.begin} repeatCount="indefinite" />
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
      <svg className="portal-soybean__roots" viewBox="0 0 1120 230" preserveAspectRatio="none" focusable="false">
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
          <linearGradient
            id="portal-root-zone-planting"
            x1="452"
            y1="70"
            x2="88"
            y2="214"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#1a86a6" stopOpacity="0.5" />
            <stop offset="0.44" stopColor="#14697b" stopOpacity="0.34" />
            <stop offset="0.72" stopColor="#c9892e" stopOpacity="0.3" />
            <stop offset="1" stopColor="#422710" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient
            id="portal-root-zone-cultivation"
            x1="551"
            y1="82"
            x2="341"
            y2="221"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#35a9bb" stopOpacity="0.42" />
            <stop offset="0.48" stopColor="#278c70" stopOpacity="0.42" />
            <stop offset="1" stopColor="#193e2c" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient
            id="portal-root-zone-harvest"
            x1="559"
            y1="77"
            x2="785"
            y2="225"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#2c8192" stopOpacity="0.36" />
            <stop offset="0.48" stopColor="#b77a27" stopOpacity="0.4" />
            <stop offset="1" stopColor="#5d3515" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient
            id="portal-root-zone-world"
            x1="654"
            y1="79"
            x2="1058"
            y2="208"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#145e82" stopOpacity="0.32" />
            <stop offset="0.52" stopColor="#0f7296" stopOpacity="0.42" />
            <stop offset="1" stopColor="#153853" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="portal-root-scene-sky" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#70d5e5" stopOpacity="0.18" />
            <stop offset="0.46" stopColor="#2395ae" stopOpacity="0.34" />
            <stop offset="1" stopColor="#f0b83e" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient
            id="portal-root-terrain-soil"
            x1="56"
            y1="179"
            x2="425"
            y2="172"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#5b3218" stopOpacity="0.2" />
            <stop offset="0.48" stopColor="#bd7a2d" stopOpacity="0.58" />
            <stop offset="1" stopColor="#e0ad4e" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient
            id="portal-root-terrain-green"
            x1="330"
            y1="212"
            x2="555"
            y2="136"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#173c31" stopOpacity="0.18" />
            <stop offset="0.52" stopColor="#2e9664" stopOpacity="0.52" />
            <stop offset="1" stopColor="#6cc87a" stopOpacity="0.17" />
          </linearGradient>
          <linearGradient
            id="portal-root-terrain-gold"
            x1="560"
            y1="144"
            x2="788"
            y2="218"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#68401c" stopOpacity="0.16" />
            <stop offset="0.54" stopColor="#c68a35" stopOpacity="0.54" />
            <stop offset="1" stopColor="#f1c85c" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="portal-root-scene-soil" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#9f5b21" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#ffd76a" stopOpacity="0.82" />
            <stop offset="1" stopColor="#71d19a" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="portal-root-scene-green" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#d6ff9b" />
            <stop offset="0.46" stopColor="#56bc76" />
            <stop offset="1" stopColor="#17604b" />
          </linearGradient>
          <linearGradient id="portal-root-scene-machine" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#c8ed78" />
            <stop offset="0.42" stopColor="#5aaa50" />
            <stop offset="1" stopColor="#174a3a" />
          </linearGradient>
          <linearGradient id="portal-root-scene-glass" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#d8f6ef" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#4ea7a5" stopOpacity="0.76" />
            <stop offset="1" stopColor="#102f43" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="portal-root-scene-grain" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#fff4a8" />
            <stop offset="0.5" stopColor="#eab33b" />
            <stop offset="1" stopColor="#9f5c14" />
          </linearGradient>
          <radialGradient id="portal-root-scene-sun" cx="50%" cy="50%" r="50%">
            <stop stopColor="#fffbd5" stopOpacity="0.98" />
            <stop offset="0.28" stopColor="#ffe16c" stopOpacity="0.84" />
            <stop offset="1" stopColor="#ffb935" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="portal-root-scene-dust" cx="50%" cy="50%" r="50%">
            <stop stopColor="#ffd77b" stopOpacity="0.34" />
            <stop offset="0.55" stopColor="#d89035" stopOpacity="0.16" />
            <stop offset="1" stopColor="#84420e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="portal-root-world-aura" cx="50%" cy="50%" r="50%">
            <stop stopColor="#42c2d6" stopOpacity="0.2" />
            <stop offset="0.58" stopColor="#217caa" stopOpacity="0.09" />
            <stop offset="1" stopColor="#07345c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="portal-root-world-origin" cx="50%" cy="50%" r="50%">
            <stop stopColor="#fffbd0" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="#ffd75d" stopOpacity="0.58" />
            <stop offset="1" stopColor="#d48b18" stopOpacity="0" />
          </radialGradient>
          <filter id="portal-root-scene-glow" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="1.35" result="sceneBlur" />
            <feMerge>
              <feMergeNode in="sceneBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="portal-root-zone-planting">
            <path d={ROOT_ZONE_PATHS.planting} data-root-zone-boundary="1-2" />
          </clipPath>
          <clipPath id="portal-root-zone-cultivation">
            <path d={ROOT_ZONE_PATHS.cultivation} data-root-zone-boundary="2-3" />
          </clipPath>
          <clipPath id="portal-root-zone-harvest">
            <path d={ROOT_ZONE_PATHS.harvest} data-root-zone-boundary="3-4" />
          </clipPath>
          <clipPath id="portal-root-zone-world">
            <path d={ROOT_ZONE_PATHS.world} data-root-zone-boundary="4-5" />
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
          <radialGradient
            id="portal-soybean-body"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(33 26) rotate(55) scale(104 88)"
            gradientUnits="userSpaceOnUse"
          >
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
          <radialGradient
            id="portal-soybean-hilum"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(75 63) rotate(117) scale(22 12)"
            gradientUnits="userSpaceOnUse"
          >
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
        <path
          d="M68 54c5-2 10 0 11 4"
          fill="none"
          stroke="#fff2a0"
          strokeLinecap="round"
          strokeOpacity="0.68"
          strokeWidth="2"
        />
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
                <span
                  key={`${digit}-${index}`}
                  className={`portal-wordmark__digit portal-wordmark__digit--${index + 1}`}
                >
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
