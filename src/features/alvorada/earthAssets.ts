/** The globe can be presented as soon as this albedo is decoded; every device starts with it. */
export const EARTH_BASE_SURFACE_URL = '/alvorada/earth-surface-2048.webp';
/** Desktop-only detail albedo, crossfaded in when it arrives; it never gates the first frame. */
export const EARTH_DETAIL_SURFACE_URL = '/alvorada/earth-surface-4096.webp';

export interface EarthTextureSet {
  /** Optional higher-resolution albedo that replaces `surface` progressively. */
  detail: string | null;
  clouds: string;
  nightLights: string;
  normal: string;
  surface: string;
}

/** Cloud-free NASA land imagery; only the albedo receives a desktop detail tier. */
export function getEarthTextureSet(mobile: boolean): EarthTextureSet {
  return {
    surface: EARTH_BASE_SURFACE_URL,
    nightLights: '/alvorada/earth-night-lights-2048.png',
    normal: '/alvorada/earth-normal-2048.jpg',
    clouds: '/alvorada/earth-clouds-2048.webp',
    detail: mobile ? null : EARTH_DETAIL_SURFACE_URL,
  };
}

/**
 * Every texture the tier downloads, ordered by criticality: the base albedo
 * first (it is the only one the first frame waits for), the detail tier last.
 */
export function getEarthTextureUrls(mobile: boolean) {
  const set = getEarthTextureSet(mobile);
  const urls = [set.surface, set.nightLights, set.normal, set.clouds];
  if (set.detail) urls.push(set.detail);
  return urls;
}
