import { useId, type SVGProps } from 'react';
import './fenasoja-map-icons.css';

/**
 * Vetores próprios dos controles do Mapa Comercial. Todos compartilham a
 * grade 24×24, contorno de 1,5 px em `currentColor` e iluminação superior
 * esquerda; gradientes usam IDs por instância porque desktop e mobile montam
 * cópias simultâneas (uma delas oculta por `display: none`).
 */
export type FenasojaMapIconProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & { strokeWidth?: number | string };

/** Original soy header/combine silhouette; same 24 px grid as the map controls. */
export function FenasojaHarvestIcon(props: FenasojaMapIconProps) {
  return <IconFrame iconName="harvest" {...props}>
    <path d="M4 7h8l3 4v5H4Z" fill="#49a262" fillOpacity=".85" />
    <path d="M12 6h5l2 6h-7Z" fill="#9ddde9" fillOpacity=".85" />
    <path d="M4 7h8v5h7l-2-6h-5M4 7v9h10M7 7V4h7l2 2M5 10 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="7" cy="17" r="3" fill="#e5bf42" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="16" cy="17.5" r="2.2" fill="#e5bf42" stroke="currentColor" strokeWidth="1.5" />
    <path d="m18 13 3 2v4h-2M19 15h3M20 15v5M22 15v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </IconFrame>;
}

function useGradientId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function IconFrame({ className, children, ...props }: FenasojaMapIconProps & { iconName: string }) {
  const { iconName, strokeWidth: _strokeWidth, ...svgProps } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      className={`fenasoja-map-icon fenasoja-map-icon--${iconName}${className ? ` ${className}` : ''}`}
      {...svgProps}
    >
      {children}
    </svg>
  );
}

/** Ícone 01 — mapa dobrável com os três planos nas cores institucionais. */
export function FenasojaFoldedMapIcon(props: FenasojaMapIconProps) {
  const id = useGradientId('fmi-map');
  return (
    <IconFrame iconName="map" {...props}>
      <defs>
        <linearGradient id={`${id}-blue`} x1="4" y1="4" x2="8.5" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5fb4ec" />
          <stop offset="1" stopColor="#1763a6" />
        </linearGradient>
        <linearGradient id={`${id}-yellow`} x1="9" y1="4" x2="15" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f9de78" />
          <stop offset=".55" stopColor="#ecbd34" />
          <stop offset="1" stopColor="#c98f12" />
        </linearGradient>
        <linearGradient id={`${id}-green`} x1="16" y1="4" x2="20.5" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6fcf8b" />
          <stop offset="1" stopColor="#1d7a42" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="12" y1="3" x2="12" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="fenasoja-map-icon__fill" d="M3.25 6.35 9 3.6v14.55l-5.75 2.75Z" fill={`url(#${id}-blue)`} />
      <path className="fenasoja-map-icon__fill" d="M9 3.6 15 6.35V20.9L9 18.15Z" fill={`url(#${id}-yellow)`} />
      <path className="fenasoja-map-icon__fill" d="m15 6.35 5.75-2.75v14.55L15 20.9Z" fill={`url(#${id}-green)`} />
      {/* Fold shading: the central plane recedes towards both creases. */}
      <path d="M9 3.6 10.6 4.35V18.9L9 18.15Z" fill="#06263c" fillOpacity=".2" />
      <path d="m15 6.35 1.5-.72v14.55l-1.5.72Z" fill="#06263c" fillOpacity=".16" />
      <path d="M3.25 6.35 9 3.6l6 2.75 5.75-2.75v6.2L15 12.6 9 9.85l-5.75 2.75Z" fill={`url(#${id}-sheen)`} />
      <path d="M3.25 6.35 9 3.6l6 2.75 5.75-2.75v14.55L15 20.9l-6-2.75-5.75 2.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 3.6v14.55M15 6.35V20.9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeOpacity=".92" />
    </IconFrame>
  );
}

/** Ícone 02 — vista superior: três planos sobrepostos com luminosidade crescente. */
export function FenasojaLayeredViewIcon(props: FenasojaMapIconProps) {
  const id = useGradientId('fmi-stack');
  return (
    <IconFrame iconName="layers" {...props}>
      <defs>
        <linearGradient id={`${id}-front`} x1="11" y1="11" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="10" height="10" rx="2.6" fill="currentColor" fillOpacity=".08" />
      <rect x="7" y="7" width="10" height="10" rx="2.6" fill="currentColor" fillOpacity=".14" />
      <rect className="fenasoja-map-icon__fill" x="11" y="11" width="10" height="10" rx="2.6" fill={`url(#${id}-front)`} />
      <path d="M7 13H5.6A2.6 2.6 0 0 1 3 10.4V5.6A2.6 2.6 0 0 1 5.6 3h4.8A2.6 2.6 0 0 1 13 5.6V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".58" />
      <path d="M11 17H9.6A2.6 2.6 0 0 1 7 14.4V9.6A2.6 2.6 0 0 1 9.6 7h4.8A2.6 2.6 0 0 1 17 9.6V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".8" />
      <rect x="11" y="11" width="10" height="10" rx="2.6" stroke="currentColor" strokeWidth="1.5" />
    </IconFrame>
  );
}

/** Ícone 03 — rede hidrológica: duas gotas ligadas por um percurso de água. */
export function FenasojaHydrologyIcon(props: FenasojaMapIconProps) {
  const id = useGradientId('fmi-hydro');
  return (
    <IconFrame iconName="hydrology" {...props}>
      <defs>
        <linearGradient id={`${id}-major`} x1="11" y1="3" x2="18" y2="17.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d4f2ff" />
          <stop offset=".45" stopColor="#5ab9ec" />
          <stop offset="1" stopColor="#1a6aa8" />
        </linearGradient>
        <linearGradient id={`${id}-minor`} x1="4" y1="6" x2="8.5" y2="14.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e6f7ff" />
          <stop offset="1" stopColor="#7cc8ee" />
        </linearGradient>
      </defs>
      <path
        className="fenasoja-map-icon__fill fenasoja-map-icon__fill--minor"
        d="M6.4 5.6c1.05 1.45 2.9 3.55 2.9 6a2.9 2.9 0 0 1-5.8 0c0-2.45 1.85-4.55 2.9-6Z"
        fill={`url(#${id}-minor)`}
      />
      <path
        className="fenasoja-map-icon__fill"
        d="M14.6 2.85c1.75 2.3 4.9 5.65 4.9 9.75a4.9 4.9 0 0 1-9.8 0c0-4.1 3.15-7.45 4.9-9.75Z"
        fill={`url(#${id}-major)`}
      />
      <path d="M6.4 5.6c1.05 1.45 2.9 3.55 2.9 6a2.9 2.9 0 0 1-5.8 0c0-2.45 1.85-4.55 2.9-6Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" strokeOpacity=".72" />
      <path d="M14.6 2.85c1.75 2.3 4.9 5.65 4.9 9.75a4.9 4.9 0 0 1-9.8 0c0-4.1 3.15-7.45 4.9-9.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.35 13.05a2.45 2.45 0 0 0 1.75 2.2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity=".85" />
      <path d="M2.9 20.35c1.4-.95 2.8-.95 4.2 0s2.8.95 4.2 0 2.8-.95 4.2 0 2.8.95 4.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".88" />
    </IconFrame>
  );
}

/** Ícone 04 — lua crescente com volume, terminador suave e crateras discretas. */
export function FenasojaMoonIcon(props: FenasojaMapIconProps) {
  const id = useGradientId('fmi-moon');
  const crescent = 'M11.01 3.96A8.4 8.4 0 1 0 20.09 14.55 7.2 7.2 0 0 1 11.01 3.96Z';
  return (
    <IconFrame iconName="moon" {...props}>
      <defs>
        <radialGradient id={`${id}-surface`} cx="6.6" cy="15.4" r="13.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffdf3" />
          <stop offset=".5" stopColor="#f6e8c0" />
          <stop offset="1" stopColor="#c7ad74" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} cx="11" cy="13" r="11" gradientUnits="userSpaceOnUse">
          <stop offset=".45" stopColor="#ffeeb8" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffeeb8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="fenasoja-map-icon__halo" cx="11" cy="13" r="11" fill={`url(#${id}-halo)`} />
      <path className="fenasoja-map-icon__fill" d={crescent} fill={`url(#${id}-surface)`} />
      <g fill="#a98d55" className="fenasoja-map-icon__craters">
        <circle cx="7.3" cy="13.3" r="1.15" fillOpacity=".42" />
        <circle cx="11.3" cy="17.35" r=".8" fillOpacity=".36" />
        <circle cx="6.85" cy="9.25" r=".6" fillOpacity=".34" />
        <circle cx="15.5" cy="17.95" r=".55" fillOpacity=".3" />
      </g>
      <path d="M5.4 15.9a7.1 7.1 0 0 0 4.1 3.55" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeOpacity=".7" />
      <path d={crescent} stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </IconFrame>
  );
}

/** Ícone 05 — nuvem volumétrica; as gotas animam por CSS apenas quando ativo. */
export function FenasojaRainIcon(props: FenasojaMapIconProps) {
  const id = useGradientId('fmi-rain');
  return (
    <IconFrame iconName="rain" {...props}>
      <defs>
        <linearGradient id={`${id}-base`} x1="12" y1="7" x2="12" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6fafd" />
          <stop offset="1" stopColor="#b6cddd" />
        </linearGradient>
        <radialGradient id={`${id}-crown`} cx="10.8" cy="7.4" r="6.8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".6" stopColor="#e5eff6" />
          <stop offset="1" stopColor="#c3d7e5" />
        </radialGradient>
      </defs>
      {/* Outline pass: a wide stroke under the fill leaves only the outer silhouette. */}
      <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        <circle cx="7.5" cy="12.5" r="3.3" />
        <circle cx="16.6" cy="12.3" r="3.5" />
        <circle cx="12" cy="9.5" r="4.7" />
        <path d="M7.5 10h9.1v5.8H7.5Z" />
      </g>
      <g className="fenasoja-map-icon__fill">
        <circle cx="7.5" cy="12.5" r="3.3" fill={`url(#${id}-base)`} />
        <circle cx="16.6" cy="12.3" r="3.5" fill={`url(#${id}-base)`} />
        <path d="M7.5 10h9.1v5.8H7.5Z" fill={`url(#${id}-base)`} />
        <circle cx="12" cy="9.5" r="4.7" fill={`url(#${id}-crown)`} />
      </g>
      <path d="M8.35 7.9a4.7 4.7 0 0 1 3.2-3.05" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeOpacity=".9" />
      <g className="fenasoja-map-icon__drops" stroke="#93d5ff" strokeWidth="1.6" strokeLinecap="round">
        <path className="fenasoja-map-icon__drop" d="M8.6 17.7v1.75" />
        <path className="fenasoja-map-icon__drop" d="M12.1 18.1v2.7" />
        <path className="fenasoja-map-icon__drop" d="M15.6 17.6v2.2" />
      </g>
    </IconFrame>
  );
}
