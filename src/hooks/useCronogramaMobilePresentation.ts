import { useEffect, useState } from 'react';

export const CRONOGRAMA_MOBILE_QUERY = '(max-width: 899px), (max-height: 600px) and (pointer: coarse)';

export function shouldReleaseClosedMobileSelection(
  drawerOpen: boolean,
  currentEventIdentity: string | undefined,
  closingEventIdentity: string | undefined,
) {
  return !drawerOpen && currentEventIdentity === closingEventIdentity;
}

function getInitialMatch() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(CRONOGRAMA_MOBILE_QUERY).matches;
}

export function useCronogramaMobilePresentation() {
  const [isMobile, setIsMobile] = useState(getInitialMatch);

  useEffect(() => {
    const media = window.matchMedia(CRONOGRAMA_MOBILE_QUERY);
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return isMobile;
}
